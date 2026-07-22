from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import SearchFetch

logger = logging.getLogger(__name__)

# Empty string = Amazon-style untargeted /deals-v2 (no keyword).
HOT_DEALS_QUERY_KEY = ""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_query_key(query: str | None) -> str:
    return (query or "").strip().lower()


def get_fetch(
    db: Session, retailer: str, query_key: str, country: str
) -> SearchFetch | None:
    return (
        db.query(SearchFetch)
        .filter(
            SearchFetch.retailer == retailer.lower(),
            SearchFetch.query_key == normalize_query_key(query_key),
            SearchFetch.country == (country or "US").upper(),
        )
        .one_or_none()
    )


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def seconds_until_refresh(
    db: Session,
    retailer: str,
    query_key: str,
    country: str,
    ttl_seconds: int,
) -> int:
    """0 = may call API now; >0 = serve DB cache for this many more seconds."""
    row = get_fetch(db, retailer, query_key, country)
    if row is None:
        return 0
    age = (_now() - _as_utc(row.last_fetched_at)).total_seconds()
    # A valid empty search can change quickly and should not suppress retries
    # for the full 8-hour positive-result TTL.
    effective_ttl = min(ttl_seconds, 3600) if row.result_count == 0 else ttl_seconds
    remaining = effective_ttl - age
    return int(remaining) if remaining > 0 else 0


def should_fetch_search(
    db: Session,
    retailer: str,
    query_key: str,
    country: str,
    ttl_seconds: int,
) -> tuple[bool, str]:
    """Return (may_call_api, reason)."""
    remaining = seconds_until_refresh(db, retailer, query_key, country, ttl_seconds)
    if remaining <= 0:
        return True, ""
    label = normalize_query_key(query_key) or "hot-deals"
    hours = max(1, remaining // 3600)
    reason = (
        f"{retailer}/{label} cache fresh · next live search in ~{hours}h "
        f"({remaining}s)"
    )
    logger.info("Search cache hit — skipping API: %s", reason)
    return False, reason


def mark_search_fetched(
    db: Session,
    retailer: str,
    query_key: str,
    country: str,
    result_count: int,
) -> SearchFetch:
    key = normalize_query_key(query_key)
    country = (country or "US").upper()
    retailer = retailer.lower()
    row = get_fetch(db, retailer, key, country)
    now = _now()
    if row is None:
        row = SearchFetch(
            retailer=retailer,
            query_key=key,
            country=country,
            result_count=result_count,
            last_fetched_at=now,
        )
        db.add(row)
    else:
        row.result_count = result_count
        row.last_fetched_at = now
    db.commit()
    db.refresh(row)
    logger.info(
        "Recorded search fetch %s/%s/%s → %s deals (TTL clock reset)",
        retailer,
        key or "hot-deals",
        country,
        result_count,
    )
    return row


def cache_age_summary(db: Session, ttl_seconds: int) -> list[str]:
    """Human lines for status / debugging."""
    now = _now()
    lines: list[str] = []
    for row in db.query(SearchFetch).order_by(SearchFetch.last_fetched_at.desc()).limit(20):
        age = int((now - _as_utc(row.last_fetched_at)).total_seconds())
        fresh = age < ttl_seconds
        label = row.query_key or "hot-deals"
        lines.append(
            f"{row.retailer}/{label}/{row.country}: "
            f"{row.result_count} deals · {age // 60}m ago"
            f"{' · FRESH' if fresh else ' · STALE'}"
        )
    return lines
