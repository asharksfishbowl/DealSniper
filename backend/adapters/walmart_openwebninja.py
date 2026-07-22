from __future__ import annotations

import logging
from typing import Any, ClassVar, Optional

from adapters.base import NormalizedDeal
from adapters.openwebninja import FieldMap, OpenWebNinjaAdapter

logger = logging.getLogger(__name__)


class WalmartOpenWebNinjaAdapter(OpenWebNinjaAdapter):
    retailer: ClassVar[str] = "walmart"
    api_slug: ClassVar[str] = "real-time-walmart-data"
    ticker_prefix: ClassVar[str] = "WMT"
    supports_untargeted: ClassVar[bool] = False
    supported_countries: ClassVar[frozenset[str] | None] = frozenset({"US", "CA"})
    fields: ClassVar[FieldMap] = FieldMap(
        id=("us_item_id", "product_id", "id", "item_id"),
        title=("product_title", "title", "name", "product_name"),
        price=(
            "price",
            "product_price",
            "current_price",
            "price_info.current_price.price",
            "price_info.line_price",
            "offer_price",
        ),
        list_price=(
            "list_price",
            "product_original_price",
            "was_price",
            "price_info.was_price.price",
            "price_info.was_price",
            "price",
        ),
        url=("product_url", "url", "product_page_url"),
        image=(
            "product_photo",
            "thumbnail",
            "image",
            "product_image",
            "images",
        ),
        category=("categories", "category", "product_category"),
        rating=("rating", "product_rating", "average_rating", "product_star_rating"),
        review_count=(
            "review_count",
            "reviews_count",
            "num_reviews",
            "product_num_reviews",
            "number_of_reviews",
        ),
        discount_pct=("discount_percentage", "savings_percent", "percent_off"),
        product_lists=("products", "results", "items", "search_results"),
    )

    def _domain(self, country: str) -> str:
        return "ca" if country.upper() == "CA" else "us"

    def _parse_category(self, raw: Any) -> Optional[str]:
        if isinstance(raw, list) and raw:
            last = raw[-1]
            if isinstance(last, dict):
                name = last.get("name") or last.get("label")
                return str(name) if name else None
            return str(last)
        if isinstance(raw, dict):
            name = raw.get("name") or raw.get("label")
            return str(name) if name else None
        if isinstance(raw, str) and raw.strip():
            return raw
        return None

    def _fallback_url(self, external_id: str, country: str) -> str:
        host = "www.walmart.ca" if country.upper() == "CA" else "www.walmart.com"
        return f"https://{host}/ip/{external_id}"

    def _in_stock(self, item: dict[str, Any]) -> Optional[bool]:
        if "out_of_stock" in item:
            return not bool(item.get("out_of_stock"))
        availability = str(item.get("availability") or item.get("stock_status") or "").lower()
        if not availability:
            return True
        if "out" in availability:
            return False
        if "in stock" in availability or availability == "available":
            return True
        return None

    async def fetch_deals(self, queries: list[str], country: str = "US"):
        if not self.enabled:
            logger.info("Walmart adapter disabled (no API key)")
            return []
        if not queries:
            return []

        country = self.normalize_country(country)
        deals: list[NormalizedDeal] = []
        seen: set[str] = set()

        data = await self._get(
            "/search",
            {
                "query": queries[0],
                "domain": self._domain(country),
                "page": 1,
                "sort_by": "best_match",
            },
        )
        self._collect(data, country, seen, deals)
        return deals
