from __future__ import annotations

import logging
import math
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from adapters import STORE_ADAPTERS
from adapters.base import NormalizedDeal
from app.config import get_settings
from app.matcher import score_deal, search_term_for_keyword, should_skip_retailer_for_query
from app.models import AlertLog, Deal, Device, Preference
from app.push import send_expo_push
from app import quota, rate_limit, search_cache

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


def upsert_deals(
    db: Session,
    deals: list[NormalizedDeal],
    source_query: str | None = None,
) -> list[Deal]:
    now = datetime.now(timezone.utc)
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


async def refresh_deals(
    db: Session, device_id: str | None = None, force: bool = False
) -> dict:
    settings = get_settings()
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

    # Short global throttle (force bypasses this). Per-query daily cache still applies.
    skip, skip_msg = rate_limit.should_skip_external(
        force=force, min_interval=settings.refresh_min_interval_seconds
    )

    if not api_key:
        used_cache_only = True
        skipped_external = True
        message = "No OPENWEBNINJA_API_KEY set; serving cached deals only"
    elif skip:
        skipped_external = True
        retry_after = rate_limit.seconds_until_allowed(settings.refresh_min_interval_seconds)
        message = skip_msg
    else:
        limited: list[str] = []
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
            )
            if not may_fetch:
                cache_hits.append(adapter_cls.retailer)
                continue

            adapter = adapter_cls(api_key)
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
            else:
                # Stamp cache on successful response (even if few discounted hits).
                search_cache.mark_search_fetched(
                    db,
                    retailer=adapter_cls.retailer,
                    query_key=query_key,
                    country=country,
                    result_count=len(discounted),
                )

        if called_any:
            rate_limit.mark_external_fetch()

        if cache_hits and not fetched and not limited and not quota_hit:
            skipped_external = True
            used_cache_only = True
            label = query_key or "hot-deals"
            searches_per_day = max(1, math.ceil(86_400 / max(1, ttl)))
            message = (
                f"Serving DB cache for {', '.join(cache_hits)} · "
                f"'{label}' (live search ≤ ~{searches_per_day}×/day)"
            )
            remaining = [
                search_cache.seconds_until_refresh(db, r, query_key, country, ttl)
                for r in cache_hits
            ]
            retry_after = min(remaining) if remaining else 0
        elif quota_hit:
            which = "+".join(quota_hit)
            message = (
                f"{which} monthly API quota exhausted · serving cache until next month"
            )
            if fetched:
                message = (
                    f"{which} monthly quota hit · saved {len(fetched)} deals · "
                    "other stores may still work"
                )
            logger.warning("Refresh skipped quota-exhausted stores: %s", ", ".join(quota_hit))
        elif limited:
            rate_limit.mark_rate_limited(settings.rate_limit_cooldown_seconds)
            which = "+".join(limited)
            message = (
                f"{which} rate-limited · cooling down "
                f"{settings.rate_limit_cooldown_seconds}s · serving cache"
            )
            retry_after = settings.rate_limit_cooldown_seconds
            if fetched:
                message = f"{which} rate-limited · saved {len(fetched)} deals · cooling down"
        elif not fetched and not cache_hits:
            message = "No new deals fetched; serving cache"
        elif fetched and cache_hits:
            message = f"Fetched {len(fetched)} · cache hit {', '.join(cache_hits)}"
            rate_limit.clear_rate_limit()
        else:
            message = "ok"
            rate_limit.clear_rate_limit()

    saved = upsert_deals(db, fetched, source_query=query_key) if fetched else []
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
