from __future__ import annotations

from dataclasses import dataclass, field
from html import unescape
from typing import Optional, Protocol


@dataclass
class NormalizedDeal:
    retailer: str
    external_id: str
    title: str
    price: float
    list_price: Optional[float] = None
    pct_off: float = 0.0
    url: Optional[str] = None
    image_url: Optional[str] = None
    category: Optional[str] = None
    in_stock: Optional[bool] = None
    ticker: Optional[str] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    raw: dict = field(default_factory=dict)


def clean_title(value: str | None) -> str:
    if not value:
        return ""
    return unescape(str(value)).strip()


def compute_pct_off(price: Optional[float], list_price: Optional[float]) -> float:
    if price is None or list_price is None or list_price <= 0 or price >= list_price:
        return 0.0
    return round(((list_price - price) / list_price) * 100, 1)


def parse_money(value) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    cleaned = (
        text.replace("$", "")
        .replace(",", "")
        .replace("USD", "")
        .replace("CAD", "")
        .strip()
    )
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_rating(value) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        rating = float(value)
        return rating if 0 < rating <= 5.5 else None
    text = str(value).strip().replace(",", "")
    if not text:
        return None
    # Handle "4.6 out of 5" style strings
    for part in text.replace("stars", " ").split():
        try:
            rating = float(part)
            if 0 < rating <= 5.5:
                return rating
        except ValueError:
            continue
    return None


def parse_review_count(value) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value >= 0 else None
    if isinstance(value, float):
        return int(value) if value >= 0 else None
    text = str(value).strip().lower().replace(",", "").replace("+", "")
    if not text:
        return None
    mult = 1
    if text.endswith("k"):
        mult = 1000
        text = text[:-1]
    elif text.endswith("m"):
        mult = 1_000_000
        text = text[:-1]
    try:
        return int(float(text) * mult)
    except ValueError:
        return None


TICKER_PREFIXES: dict[str, str] = {
    "amazon": "AMZN",
    "costco": "COST",
    "walmart": "WMT",
    "homedepot": "HD",
}


def make_ticker(
    retailer: str,
    external_id: str,
    title: str,
    *,
    prefix: str | None = None,
) -> str:
    resolved = prefix or TICKER_PREFIXES.get(retailer) or retailer[:4].upper()
    words = [w for w in title.upper().replace("-", " ").split() if w.isalnum()]
    stem = "".join(w[:3] for w in words[:2]) or external_id[:6].upper()
    return f"{resolved}:{stem[:8]}"


class DealAdapter(Protocol):
    retailer: str

    async def fetch_deals(
        self, queries: list[str], country: str = "US"
    ) -> list[NormalizedDeal]: ...
