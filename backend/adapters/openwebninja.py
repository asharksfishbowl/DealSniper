from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, ClassVar, Optional

import httpx

from adapters.base import (
    NormalizedDeal,
    clean_title,
    compute_pct_off,
    make_ticker,
    parse_money,
    parse_rating,
    parse_review_count,
)

logger = logging.getLogger(__name__)

OPENWEBNINJA_HOST = "https://api.openwebninja.com"

# Same directory level as quota_state.json (backend/).
_BENCHMARK_LOG_PATH = Path(__file__).resolve().parent.parent / "benchmark_log.jsonl"


def dig(item: dict[str, Any], key: str) -> Any:
    """Resolve dotted paths like pricing.current_price."""
    if "." not in key:
        return item.get(key)
    cur: Any = item
    for part in key.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def first_present(item: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = dig(item, key)
        if value is not None and value != "":
            return value
    return None


@dataclass(frozen=True)
class FieldMap:
    """Declarative mapping from OpenWebNinja payload keys → NormalizedDeal fields."""

    id: tuple[str, ...]
    title: tuple[str, ...]
    price: tuple[str, ...]
    list_price: tuple[str, ...]
    url: tuple[str, ...] = ()
    image: tuple[str, ...] = ()
    category: tuple[str, ...] = ()
    rating: tuple[str, ...] = ()
    review_count: tuple[str, ...] = ()
    discount_pct: tuple[str, ...] = ()
    product_lists: tuple[str, ...] = ("products", "deals", "deal_products", "results", "items")


class OpenWebNinjaAdapter:
    """
    Shared HTTP + normalize pipeline for OpenWebNinja realtime-*-data APIs.

    To add a store: subclass, set class attrs, implement fetch_deals (and
    optionally override _parse_category / _fallback_url / _in_stock).
    """

    retailer: ClassVar[str]
    api_slug: ClassVar[str]  # e.g. "realtime-amazon-data"
    ticker_prefix: ClassVar[str]
    fields: ClassVar[FieldMap]
    supports_untargeted: ClassVar[bool] = False
    supported_countries: ClassVar[frozenset[str] | None] = None

    def __init__(self, api_key: str, timeout: float = 30.0):
        self.api_key = api_key
        self.timeout = timeout
        self.was_rate_limited = False
        self.was_quota_exhausted = False
        self.had_error = False
        # Set by refresh_deals() on each adapter instance before fetch_deals() runs.
        self.cycle_id: Optional[str] = None

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    @property
    def _base_url(self) -> str:
        return f"{OPENWEBNINJA_HOST}/{self.api_slug}"

    def _headers(self) -> dict[str, str]:
        return {"x-api-key": self.api_key}

    def normalize_country(self, country: str) -> str:
        country = (country or "US").upper()
        allowed = self.supported_countries
        if allowed is not None and country not in allowed:
            return "US" if "US" in allowed else sorted(allowed)[0]
        return country

    def _log_benchmark(self, path: str, started: float, outcome: str) -> None:
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "cycle_id": self.cycle_id,
            "api_slug": self.api_slug,
            "path": path,
            "latency_ms": int((time.monotonic() - started) * 1000),
            "outcome": outcome,
        }
        try:
            with open(_BENCHMARK_LOG_PATH, "a") as f:
                f.write(json.dumps(entry) + "\n")
        except Exception as exc:
            logger.warning("Failed to write benchmark log: %s", exc)

    async def _get(self, path: str, params: dict[str, Any]) -> Optional[Any]:
        if not self.enabled or self.was_rate_limited or self.was_quota_exhausted:
            return None

        from app import quota

        label = f"{self.retailer.title()} OpenWebNinja"
        if quota.is_quota_exhausted(self.api_slug):
            self.was_quota_exhausted = True
            reset = quota.quota_reset_at(self.api_slug)
            logger.warning(
                "%s monthly quota already hit — skipping %s (resets %s UTC)",
                label,
                path,
                reset.date().isoformat() if reset else "next month",
            )
            return None

        url = f"{self._base_url}{path}"
        quota.record_call(self.api_slug)
        started = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url, headers=self._headers(), params=params)
                headers = {k.lower(): v for k, v in resp.headers.items()}
                body: Any
                try:
                    body = resp.json()
                except Exception:
                    body = resp.text

                if quota.response_looks_like_quota(resp.status_code, body, headers):
                    self.was_quota_exhausted = True
                    quota.mark_quota_exhausted(
                        self.api_slug,
                        reason=f"HTTP {resp.status_code} on {path}",
                    )
                    self._log_benchmark(path, started, "quota_exhausted")
                    return None

                if resp.status_code == 429:
                    self.was_rate_limited = True
                    logger.warning(
                        "%s %s rate-limited (429); stopping further calls this refresh",
                        label,
                        path,
                    )
                    self._log_benchmark(path, started, "rate_limited")
                    return None
                resp.raise_for_status()
                payload = body if isinstance(body, (dict, list)) else resp.json()
        except httpx.TimeoutException as exc:
            self.had_error = True
            logger.warning("%s %s timed out: %s", label, path, exc)
            self._log_benchmark(path, started, "timeout")
            return None
        except Exception as exc:
            self.had_error = True
            logger.warning("%s %s failed: %s", label, path, exc)
            self._log_benchmark(path, started, "http_error")
            return None

        if isinstance(payload, dict) and payload.get("status") == "ERROR":
            if quota.response_looks_like_quota(200, payload):
                self.was_quota_exhausted = True
                quota.mark_quota_exhausted(
                    self.api_slug,
                    reason=str(payload.get("message") or payload.get("error") or "ERROR"),
                )
                self._log_benchmark(path, started, "quota_exhausted")
                return None
            self.had_error = True
            logger.warning("%s %s error payload: %s", label, path, payload)
            self._log_benchmark(path, started, "http_error")
            return None
        self._log_benchmark(path, started, "success")
        if isinstance(payload, dict):
            return payload.get("data", payload)
        return payload

    def _extract_products(self, data: Any) -> list[dict]:
        if data is None:
            return []
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
        if not isinstance(data, dict):
            return []
        for key in self.fields.product_lists:
            value = data.get(key)
            if isinstance(value, list):
                return [x for x in value if isinstance(x, dict)]
            if isinstance(value, dict):
                return [value]
        # Single-product payload
        if first_present(data, self.fields.id) or first_present(data, self.fields.title):
            return [data]
        return []

    def _parse_category(self, raw: Any) -> Optional[str]:
        if isinstance(raw, list) and raw:
            return str(raw[-1])
        if isinstance(raw, str) and raw.strip():
            return raw
        return None

    def _fallback_url(self, external_id: str, country: str) -> Optional[str]:
        return None

    def _in_stock(self, item: dict[str, Any]) -> Optional[bool]:
        return True

    def _normalize_product(
        self, item: dict[str, Any], country: str = "US"
    ) -> Optional[NormalizedDeal]:
        fields = self.fields
        external_id = first_present(item, fields.id)
        title = clean_title(str(first_present(item, fields.title) or "") or None)
        if not external_id or not title:
            return None

        price = parse_money(first_present(item, fields.price))
        list_price = parse_money(first_present(item, fields.list_price))
        if price is None and list_price is not None:
            price = list_price
        if price is None:
            return None

        pct_off = 0.0
        raw_pct = first_present(item, fields.discount_pct)
        if raw_pct is not None:
            try:
                pct_off = float(str(raw_pct).replace("%", "").strip())
            except ValueError:
                pct_off = compute_pct_off(price, list_price)
        else:
            pct_off = compute_pct_off(price, list_price)

        ext = str(external_id)
        url = first_present(item, fields.url) or self._fallback_url(ext, country)
        image = first_present(item, fields.image)
        if isinstance(image, list):
            image = next((x for x in image if isinstance(x, str) and x), None)

        return NormalizedDeal(
            retailer=self.retailer,
            external_id=ext,
            title=title,
            price=float(price),
            list_price=float(list_price) if list_price is not None else None,
            pct_off=float(pct_off or 0),
            url=url,
            image_url=image if isinstance(image, str) else None,
            category=self._parse_category(first_present(item, fields.category)),
            in_stock=self._in_stock(item),
            ticker=make_ticker(self.retailer, ext, title, prefix=self.ticker_prefix),
            rating=parse_rating(first_present(item, fields.rating)),
            review_count=parse_review_count(first_present(item, fields.review_count)),
            raw=item,
        )

    def _collect(
        self, data: Any, country: str, seen: set[str], deals: list[NormalizedDeal]
    ) -> None:
        for item in self._extract_products(data):
            normalized = self._normalize_product(item, country)
            if normalized and normalized.external_id not in seen:
                seen.add(normalized.external_id)
                deals.append(normalized)

    async def fetch_deals(
        self, queries: list[str], country: str = "US"
    ) -> list[NormalizedDeal]:
        raise NotImplementedError
