from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_STATE_PATH = Path(__file__).resolve().parent.parent / "quota_state.json"
_exhausted_until: dict[str, datetime] = {}
_loaded = False

_QUOTA_HINTS = (
    "quota",
    "monthly",
    "plan limit",
    "hard limit",
    "requests / month",
    "requests per month",
    "exceeded your",
    "exceeded the",
    "usage limit",
    "upgrade your plan",
    "subscription",
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def next_month_start(now: datetime | None = None) -> datetime:
    now = now or _now()
    if now.month == 12:
        return datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    return datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)


def _load() -> None:
    global _loaded
    if _loaded:
        return
    _loaded = True
    if not _STATE_PATH.exists():
        return
    try:
        raw = json.loads(_STATE_PATH.read_text())
        for slug, iso in (raw.get("exhausted_until") or {}).items():
            _exhausted_until[slug] = datetime.fromisoformat(iso)
    except Exception as exc:
        logger.warning("Failed to load quota state: %s", exc)


def _save() -> None:
    payload = {
        "exhausted_until": {
            slug: until.isoformat() for slug, until in _exhausted_until.items()
        }
    }
    try:
        _STATE_PATH.write_text(json.dumps(payload, indent=2))
    except Exception as exc:
        logger.warning("Failed to save quota state: %s", exc)


def is_quota_exhausted(api_slug: str) -> bool:
    _load()
    until = _exhausted_until.get(api_slug)
    if until is None:
        return False
    if until <= _now():
        _exhausted_until.pop(api_slug, None)
        _save()
        logger.info("OpenWebNinja %s monthly quota window ended; calls re-enabled", api_slug)
        return False
    return True


def quota_reset_at(api_slug: str) -> datetime | None:
    _load()
    until = _exhausted_until.get(api_slug)
    if until is None or until <= _now():
        return None
    return until


def mark_quota_exhausted(api_slug: str, *, reason: str = "") -> datetime:
    """Block further calls for this API product until next calendar month (UTC)."""
    _load()
    until = next_month_start()
    previous = _exhausted_until.get(api_slug)
    _exhausted_until[api_slug] = until
    _save()
    if previous is None or previous < until:
        logger.warning(
            "OpenWebNinja %s monthly quota exhausted%s — blocking calls until %s UTC",
            api_slug,
            f" ({reason})" if reason else "",
            until.date().isoformat(),
        )
    return until


def response_looks_like_quota(
    status_code: int, body: Any = None, headers: dict[str, str] | None = None
) -> bool:
    """Heuristic: monthly/plan quota vs short-lived rate limit."""
    text_parts: list[str] = []
    if isinstance(body, dict):
        text_parts.append(json.dumps(body).lower())
    elif body is not None:
        text_parts.append(str(body).lower())
    if headers:
        text_parts.extend(str(v).lower() for v in headers.values())
    blob = " ".join(text_parts)

    quotaish = any(h in blob for h in _QUOTA_HINTS)
    if status_code == 402:
        return True
    if status_code == 403 and (quotaish or not blob.strip()):
        return True
    if status_code == 429 and quotaish:
        return True
    if status_code == 429:
        # Very long Retry-After (~day+) usually means quota, not burst throttle.
        retry = (headers or {}).get("retry-after") or (headers or {}).get("Retry-After")
        if retry:
            try:
                if int(str(retry).strip()) >= 86_400:
                    return True
            except ValueError:
                pass
    if isinstance(body, dict):
        status = str(body.get("status") or "").upper()
        message = str(body.get("message") or body.get("error") or "").lower()
        if status == "ERROR" and any(h in message for h in _QUOTA_HINTS):
            return True
    return False


def summarize_exhausted() -> list[str]:
    _load()
    now = _now()
    out: list[str] = []
    for slug, until in sorted(_exhausted_until.items()):
        if until > now:
            out.append(f"{slug} until {until.date().isoformat()}")
    return out
