from __future__ import annotations

import logging
import math
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from adapters import STORE_ADAPTERS
from adapters.base import NormalizedDeal
from app.config import get_settings
from app.matcher import score_deal, search_term_for_keyword, should_skip_retailer_for_query
from app.models import AlertLog, Deal, Device, Preference
from app.push import send_expo_push
from app import impact, quota, rate_limit, search_cache

logger = logging.getLogger(__name__)

DEFAULT_RETAILERS = list(STORE_ADAPTERS.keys())


def preference_to_lists(prefs: Preference | None) -> tuple[list[str], list[str], str]:
    if prefs is None:
        # Untargeted: empty queries → stores with supports_untargeted (e.g. Amazon deals-v2)
        return [], list(DEFAULT_RETAILERS), "US"

    retailers = [r.strip().lower() for r in (prefs.retailers or "").split(",") if r.strip()]
    if not retailers:
        retailers = list(DEFAULT_RETAILERS)
    country = (prefs.country or "US").upper()

    keywords = [k.strip() for k in (prefs.keywords or "").split(",") if k.strip()]
    if not keywords:
        # No filters → hot deals tape only (untargeted stores e.g. Amazon deals-v2)
        return [], retailers, country

    # One deal-oriented search term per refresh; results stay in DB and are re-filtered locally.
    kw = keywords[0]
    term = search_term_for_keyword(kw)
    return [term], retailers, country


def purge_full_price_deals(db: Session, min_pct: float = 5.0) -> int:
    """Drop catalog rows that aren't real discounts so the board stays deal-focused."""
    doomed = db.query(Deal).filter(Deal.pct_off < min_pct).all()
    count = len(doomed)
    for deal in doomed:
        db.delete(deal)
    if count:
        db.commit()
        logger.info("Purged %s full-price / low-discount deals (< %.0f%% off)", count, min_pct)
    return count


def _append_search_query(existing: str | None, source_query: str | None) -> str:
    terms = {part.strip().lower() for part in (existing or "").split(",") if part.strip()}
    if source_query and source_query.strip():
        terms.add(source_query.strip().lower())
    return ",".join(sorted(terms))


async def upsert_deals(
    db: Session,
    deals: list[NormalizedDeal],
    source_query: str | None = None,
) -> list[Deal]:
    now = datetime.now(timezone.utc)
    settings = get_settings()
    saved: list[Deal] = []
    for item in deals:
        existing = (
            db.query(Deal)
            .filter(Deal.retailer == item.retailer, Deal.external_id == item.external_id)
            .one_or_none()
        )
        if existing:
            existing.title = item.title
            existing.ticker = item.ticker or existing.ticker
            existing.category = item.category
            existing.price = item.price
            existing.list_price = item.list_price
            existing.pct_off = item.pct_off
            existing.url = item.url
            if existing.affiliate_url is None and item.url:
                existing.affiliate_url = await impact.get_tracking_url(
                    item.retailer, item.url, settings
                )
            existing.image_url = item.image_url
            existing.in_stock = item.in_stock
            if item.rating is not None:
                existing.rating = item.rating
            if item.review_count is not None:
                existing.review_count = item.review_count
            existing.search_queries = _append_search_query(
                existing.search_queries, source_query
            )
            existing.last_seen = now
            existing.updated_at = now
            saved.append(existing)
        else:
            affiliate_url = (
                await impact.get_tracking_url(item.retailer, item.url, settings)
                if item.url else None
            )
            deal = Deal(
                retailer=item.retailer,
                external_id=item.external_id,
                title=item.title,
                ticker=item.ticker or "",
                category=item.category,
                price=item.price,
                list_price=item.list_price,
                pct_off=item.pct_off,
                url=item.url,
                affiliate_url=affiliate_url,
                image_url=item.image_url,
                in_stock=item.in_stock,
                rating=item.rating,
                review_count=item.review_count,
                search_queries=_append_search_query(None, source_query),
                last_seen=now,
            )
            db.add(deal)
            saved.append(deal)
    db.commit()
    for deal in saved:
        db.refresh(deal)
    return saved


async def _send_alerts(db: Session, device_id: str | None, saved: list[Deal]) -> int:
    settings = get_settings()
    alerts_sent = 0
    devices_q = db.query(Device).filter(Device.expo_push_token.isnot(None))
    if device_id:
        devices_q = devices_q.filter(Device.device_id == device_id)
    devices = devices_q.all()
    threshold = settings.match_alert_threshold

    for device in devices:
        device_prefs = (
            db.query(Preference).filter(Preference.device_id == device.device_id).one_or_none()
        )
        if device_prefs and not device_prefs.alerts_enabled:
            continue

        candidates = saved or db.query(Deal).order_by(Deal.pct_off.desc()).limit(50).all()
        for deal in candidates:
            score = score_deal(deal, device_prefs)
            if score < threshold:
                continue
            already = (
                db.query(AlertLog)
                .filter(AlertLog.device_id == device.device_id, AlertLog.deal_id == deal.id)
                .one_or_none()
            )
            if already:
                continue
            sent = await send_expo_push(
                [device.expo_push_token],
                title=f"{deal.pct_off:.0f}% off · {deal.retailer.title()}",
                body=deal.title[:120],
                data={"dealId": deal.id, "retailer": deal.retailer},
            )
            if sent:
                db.add(
                    AlertLog(
                        device_id=device.device_id,
                        deal_id=deal.id,
                        match_score=score,
                    )
                )
                alerts_sent += sent
        db.commit()
    return alerts_sent


@dataclass
class RefreshSummary:
    message: str
    refresh_state: str
    cache_age_seconds: int | None
    cooldown_seconds: int | None
    quota_reset_date: str | None


def _classify_refresh_state(
    *, fetched: list[NormalizedDeal], quota_hit: list[str], limited: list[str]
) -> str:
    """Fixed precedence (highest first): quota_exhausted > rate_limited > live > cached."""
    if quota_hit:
        return "quota_exhausted"
    if limited:
        return "rate_limited"
    if fetched:
        return "live"
    return "cached"


def _summarize_refresh(
    *,
    db: Session,
    fetched: list[NormalizedDeal],
    cache_hits: list[str],
    quota_hit: list[str],
    limited: list[str],
    retry_after: int,
    query_key: str,
    country: str,
    ttl: int,
    cooldown_seconds: int,
) -> RefreshSummary:
    """Pure-ish derivation of the status message + refresh_state contract.

    Takes `db`/`country` (beyond the message-building inputs) solely to compute
    `cache_age_seconds` for the "cached" state directly from SearchFetch rows —
    every other field is a deterministic function of the passed-in lists/counts.
    Callers are responsible for any side effects (rate-limit bookkeeping, cache
    TTL lookups feeding `retry_after`, logging) — this function only builds the
    RefreshSummary.
    """
    if cache_hits and not fetched and not limited and not quota_hit:
        label = query_key or "hot-deals"
        searches_per_day = max(1, math.ceil(86_400 / max(1, ttl)))
        message = (
            f"Serving DB cache for {', '.join(cache_hits)} · "
            f"'{label}' (live search ≤ ~{searches_per_day}×/day)"
        )
    elif quota_hit:
        which = "+".join(quota_hit)
        message = f"{which} monthly API quota exhausted · serving cache until next month"
        if fetched:
            message = (
                f"{which} monthly quota hit · saved {len(fetched)} deals · "
                "other stores may still work"
            )
    elif limited:
        which = "+".join(limited)
        message = f"{which} rate-limited · cooling down {cooldown_seconds}s · serving cache"
        if fetched:
            message = f"{which} rate-limited · saved {len(fetched)} deals · cooling down"
    elif not fetched and not cache_hits:
        message = "No new deals fetched; serving cache"
    elif fetched and cache_hits:
        message = f"Fetched {len(fetched)} · cache hit {', '.join(cache_hits)}"
    else:
        message = "ok"

    refresh_state = _classify_refresh_state(fetched=fetched, quota_hit=quota_hit, limited=limited)

    cache_age_seconds: int | None = None
    cooldown_out: int | None = None
    quota_reset_date: str | None = None

    if refresh_state == "quota_exhausted":
        reset_dates = []
        for retailer_name in quota_hit:
            adapter_cls = STORE_ADAPTERS.get(retailer_name.lower())
            if adapter_cls is None:
                continue
            reset = quota.quota_reset_at(adapter_cls.api_slug)
            if reset is not None:
                reset_dates.append(reset)
        quota_reset_date = min(reset_dates).date().isoformat() if reset_dates else None
    elif refresh_state == "rate_limited":
        cooldown_out = retry_after
    elif refresh_state == "live":
        cache_age_seconds = 0
    else:  # "cached"
        if cache_hits:
            now = datetime.now(timezone.utc)
            ages: list[float] = []
            for retailer_name in cache_hits:
                row = search_cache.get_fetch(db, retailer_name, query_key, country)
                if row is None:
                    continue
                last_fetched = row.last_fetched_at
                if last_fetched.tzinfo is None:
                    last_fetched = last_fetched.replace(tzinfo=timezone.utc)
                ages.append((now - last_fetched).total_seconds())
            cache_age_seconds = int(min(ages)) if ages else None

    return RefreshSummary(
        message=message,
        refresh_state=refresh_state,
        cache_age_seconds=cache_age_seconds,
        cooldown_seconds=cooldown_out,
        quota_reset_date=quota_reset_date,
    )


async def refresh_deals(
    db: Session, device_id: str | None = None, force: bool = False
) -> dict:
    settings = get_settings()
    cycle_id = uuid.uuid4().hex
    prefs = None
    if device_id:
        prefs = db.query(Preference).filter(Preference.device_id == device_id).one_or_none()

    queries, retailers, country = preference_to_lists(prefs)
    query_key = queries[0] if queries else search_cache.HOT_DEALS_QUERY_KEY
    ttl = settings.search_cache_ttl_seconds
    api_key = settings.openwebninja_api_key
    used_cache_only = not bool(api_key)
    counts: dict[str, int] = {name: 0 for name in STORE_ADAPTERS}
    fetched: list[NormalizedDeal] = []
    skipped_external = False
    cache_hits: list[str] = []
    retry_after = 0
    message = "ok"
    refresh_state = "cached"
    cache_age_seconds: int | None = None
    cooldown_seconds: int | None = None
    quota_reset_date: str | None = None

    # Short global throttle (force bypasses this). Per-query daily cache still applies.
    skip, skip_msg = rate_limit.should_skip_external(
        force=force, min_interval=settings.refresh_min_interval_seconds
    )

    if not api_key:
        used_cache_only = True
        skipped_external = True
        message = "No OPENWEBNINJA_API_KEY set; serving cached deals only"
        refresh_state = "cached"
    elif skip:
        skipped_external = True
        retry_after = rate_limit.seconds_until_allowed(settings.refresh_min_interval_seconds)
        message = skip_msg
        refresh_state = "rate_limited"
        cooldown_seconds = retry_after
    else:
        limited: list[str] = []
        limited_retry_after = 0
        quota_hit: list[str] = []
        called_any = False
        for name in retailers:
            adapter_cls = STORE_ADAPTERS.get(name)
            if adapter_cls is None:
                continue
            # Query-only stores (e.g. Costco) skip when there is no search term.
            if not queries and not adapter_cls.supports_untargeted:
                continue

            if quota.is_quota_exhausted(adapter_cls.api_slug):
                quota_hit.append(adapter_cls.retailer.title())
                reset = quota.quota_reset_at(adapter_cls.api_slug)
                logger.warning(
                    "Skipping %s — monthly OpenWebNinja quota exhausted (resets %s UTC)",
                    adapter_cls.retailer,
                    reset.date().isoformat() if reset else "next month",
                )
                continue

            cooling, cooldown_remaining = rate_limit.is_retailer_cooling_down(
                adapter_cls.retailer
            )
            if cooling:
                limited.append(adapter_cls.retailer.title())
                limited_retry_after = max(limited_retry_after, cooldown_remaining)
                logger.info(
                    "Skipping %s — rate-limit cooldown (%ss remaining)",
                    adapter_cls.retailer,
                    cooldown_remaining,
                )
                continue

            if query_key and should_skip_retailer_for_query(adapter_cls.retailer, query_key):
                logger.info(
                    "Skipping %s for query '%s' (retailer not useful for this category)",
                    adapter_cls.retailer,
                    query_key,
                )
                continue

            may_fetch, cache_reason = search_cache.should_fetch_search(
                db,
                retailer=adapter_cls.retailer,
                query_key=query_key,
                country=country,
                ttl_seconds=ttl,
                cycle_id=cycle_id,
            )
            if not may_fetch:
                cache_hits.append(adapter_cls.retailer)
                continue

            adapter = adapter_cls(api_key)
            adapter.cycle_id = cycle_id
            deals = await adapter.fetch_deals(queries[:1], country=country)
            # Catalog noise: keep only products that are actually discounted.
            min_pct = settings.min_ingest_pct_off
            discounted = [d for d in deals if (d.pct_off or 0) >= min_pct]
            dropped = len(deals) - len(discounted)
            if dropped:
                logger.info(
                    "%s '%s': kept %s/%s deals at ≥%.0f%% off (dropped %s full-price)",
                    adapter_cls.retailer,
                    query_key or "hot-deals",
                    len(discounted),
                    len(deals),
                    min_pct,
                    dropped,
                )
            counts[name] = len(discounted)
            fetched.extend(discounted)
            called_any = True

            if adapter.was_quota_exhausted:
                quota_hit.append(adapter_cls.retailer.title())
            elif adapter.was_rate_limited:
                limited.append(adapter_cls.retailer.title())
                # Per-retailer cooldown -- a 429 from this one retailer must
                # not block live fetches for the others this cycle or next.
                rate_limit.mark_rate_limited(
                    adapter_cls.retailer, settings.rate_limit_cooldown_seconds
                )
                limited_retry_after = max(
                    limited_retry_after, settings.rate_limit_cooldown_seconds
                )
            elif adapter.had_error:
                logger.warning(
                    "%s fetch failed (network/parse/error-payload) — not stamping cache, "
                    "will retry next refresh",
                    adapter_cls.retailer,
                )
            else:
                # Stamp cache on successful response (even if few discounted hits).
                search_cache.mark_search_fetched(
                    db,
                    retailer=adapter_cls.retailer,
                    query_key=query_key,
                    country=country,
                    result_count=len(discounted),
                )
                rate_limit.clear_rate_limit(adapter_cls.retailer)

        if called_any:
            rate_limit.mark_external_fetch()

        state = _classify_refresh_state(fetched=fetched, quota_hit=quota_hit, limited=limited)
        if state == "quota_exhausted":
            logger.warning("Refresh skipped quota-exhausted stores: %s", ", ".join(quota_hit))
        elif state == "rate_limited":
            # Cooldowns are already marked per-retailer above (both the
            # freshly-429'd case and the already-cooling-down skip case);
            # this just surfaces the longest remaining wait to the caller.
            retry_after = limited_retry_after
        elif state == "cached" and cache_hits:
            skipped_external = True
            used_cache_only = True
            remaining = [
                search_cache.seconds_until_refresh(db, r, query_key, country, ttl)
                for r in cache_hits
            ]
            retry_after = min(remaining) if remaining else 0

        summary = _summarize_refresh(
            db=db,
            fetched=fetched,
            cache_hits=cache_hits,
            quota_hit=quota_hit,
            limited=limited,
            retry_after=retry_after,
            query_key=query_key,
            country=country,
            ttl=ttl,
            # Actual remaining cooldown for this cycle's rate-limited
            # retailer(s), not always the full configured duration -- a
            # retailer already partway through a prior cooldown reports its
            # true remaining time here, matching what is_retailer_cooling_down
            # returned.
            cooldown_seconds=retry_after,
        )
        message = summary.message
        refresh_state = summary.refresh_state
        cache_age_seconds = summary.cache_age_seconds
        cooldown_seconds = summary.cooldown_seconds
        quota_reset_date = summary.quota_reset_date

    saved = await upsert_deals(db, fetched, source_query=query_key) if fetched else []
    alerts_sent = await _send_alerts(db, device_id, saved)

    return {
        "upserted": len(saved),
        **counts,
        "alerts_sent": alerts_sent,
        "used_cache_only": used_cache_only or (skipped_external and not fetched),
        "skipped_external": skipped_external,
        "retry_after_seconds": retry_after,
        "message": message,
        "cache_hits": cache_hits,
        "refresh_state": refresh_state,
        "cache_age_seconds": cache_age_seconds,
        "cooldown_seconds": cooldown_seconds,
        "quota_reset_date": quota_reset_date,
    }


def serialize_preference(prefs: Preference) -> dict:
    return {
        "device_id": prefs.device_id,
        "keywords": [k.strip() for k in (prefs.keywords or "").split(",") if k.strip()],
        "categories": [c.strip() for c in (prefs.categories or "").split(",") if c.strip()],
        "min_pct_off": prefs.min_pct_off,
        "max_price": prefs.max_price,
        "retailers": [r.strip() for r in (prefs.retailers or "").split(",") if r.strip()],
        "country": prefs.country,
        "alerts_enabled": prefs.alerts_enabled,
    }


def apply_preference_payload(prefs: Preference, payload) -> Preference:
    prefs.keywords = ",".join(payload.keywords)
    prefs.categories = ",".join(payload.categories)
    prefs.min_pct_off = payload.min_pct_off
    prefs.max_price = payload.max_price
    prefs.retailers = ",".join(payload.retailers)
    prefs.country = (payload.country or "US").upper()
    prefs.alerts_enabled = payload.alerts_enabled
    return prefs
