from __future__ import annotations

from datetime import datetime, timedelta, timezone

_last_external_fetch: datetime | None = None
_retailer_cooldowns: dict[str, datetime] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def seconds_until_allowed(min_interval: int) -> int:
    """Global min-interval throttle only -- per-retailer 429 cooldowns are
    tracked separately via is_retailer_cooling_down(), since one retailer's
    rate limit must not block live fetches for the others."""
    if not _last_external_fetch:
        return 0
    elapsed = (_now() - _last_external_fetch).total_seconds()
    remaining = min_interval - elapsed
    return int(remaining) if remaining > 0 else 0


def should_skip_external(force: bool, min_interval: int) -> tuple[bool, str]:
    """Return (skip, reason) for the GLOBAL min-interval throttle only.
    force bypasses this. Per-retailer 429 cooldowns are a separate check
    (is_retailer_cooling_down), made inside the refresh loop per retailer."""
    if force:
        return False, ""
    remaining = seconds_until_allowed(min_interval)
    if remaining > 0:
        return True, f"Using cache · next live fetch in {remaining}s"
    return False, ""


def mark_external_fetch() -> None:
    global _last_external_fetch
    _last_external_fetch = _now()


def is_retailer_cooling_down(retailer: str) -> tuple[bool, int]:
    """Return (cooling_down, seconds_remaining) for this specific retailer's
    post-429 cooldown. Scoped per retailer -- a 429 from one OpenWebNinja
    endpoint (e.g. Costco) must not block live fetches for the others."""
    until = _retailer_cooldowns.get(retailer)
    if not until:
        return False, 0
    remaining = (until - _now()).total_seconds()
    if remaining <= 0:
        _retailer_cooldowns.pop(retailer, None)
        return False, 0
    return True, int(remaining)


def mark_rate_limited(retailer: str, seconds: int = 600) -> None:
    _retailer_cooldowns[retailer] = _now() + timedelta(seconds=max(30, seconds))


def clear_rate_limit(retailer: str) -> None:
    _retailer_cooldowns.pop(retailer, None)
