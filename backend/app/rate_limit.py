from __future__ import annotations

from datetime import datetime, timedelta, timezone

_last_external_fetch: datetime | None = None
_cooldown_until: datetime | None = None
_last_skip_reason: str = ""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def seconds_until_allowed(min_interval: int) -> int:
    now = _now()
    waits: list[float] = []
    if _cooldown_until and _cooldown_until > now:
        waits.append((_cooldown_until - now).total_seconds())
    if _last_external_fetch:
        elapsed = (now - _last_external_fetch).total_seconds()
        if elapsed < min_interval:
            waits.append(min_interval - elapsed)
    return int(max(waits) if waits else 0)


def should_skip_external(force: bool, min_interval: int) -> tuple[bool, str]:
    """Return (skip, reason). force bypasses the normal interval but not a hard 429 cooldown."""
    global _last_skip_reason
    now = _now()

    if _cooldown_until and _cooldown_until > now:
        remaining = int((_cooldown_until - now).total_seconds())
        _last_skip_reason = f"rate_limited:{remaining}"
        return True, f"OpenWebNinja cooldown · retry in {remaining}s (serving cache)"

    if force:
        _last_skip_reason = ""
        return False, ""

    if _last_external_fetch:
        elapsed = (now - _last_external_fetch).total_seconds()
        if elapsed < min_interval:
            remaining = int(min_interval - elapsed)
            _last_skip_reason = f"cooldown:{remaining}"
            return True, f"Using cache · next live fetch in {remaining}s"

    _last_skip_reason = ""
    return False, ""


def mark_external_fetch() -> None:
    global _last_external_fetch
    _last_external_fetch = _now()


def mark_rate_limited(seconds: int = 600) -> None:
    global _cooldown_until
    _cooldown_until = _now() + timedelta(seconds=max(30, seconds))


def clear_rate_limit() -> None:
    global _cooldown_until
    _cooldown_until = None
