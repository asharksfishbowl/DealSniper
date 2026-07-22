from __future__ import annotations

import logging
from typing import Any, ClassVar, Optional

from adapters.base import NormalizedDeal
from adapters.openwebninja import FieldMap, OpenWebNinjaAdapter

logger = logging.getLogger(__name__)


class HomeDepotOpenWebNinjaAdapter(OpenWebNinjaAdapter):
    retailer: ClassVar[str] = "homedepot"
    api_slug: ClassVar[str] = "realtime-homedepot-data"
    ticker_prefix: ClassVar[str] = "HD"
    supports_untargeted: ClassVar[bool] = False
    supported_countries: ClassVar[frozenset[str] | None] = frozenset({"US"})
    fields: ClassVar[FieldMap] = FieldMap(
        id=("item_id", "product_id", "sku_id", "id"),
        title=("title", "product_title", "name"),
        price=(
            "pricing.current_price",
            "current_price",
            "price",
            "product_price",
        ),
        list_price=(
            "pricing.original_price",
            "original_price",
            "list_price",
            "was_price",
            "pricing.current_price",
        ),
        url=("url", "product_url"),
        image=("thumbnail", "image", "images", "product_image"),
        category=("breadcrumbs", "categories", "category"),
        rating=("rating", "average_rating", "product_rating"),
        review_count=("total_reviews", "review_count", "reviews_count", "num_reviews"),
        discount_pct=("discount_percentage", "percent_off"),
        product_lists=("products", "results", "items", "search_results"),
    )

    def _parse_category(self, raw: Any) -> Optional[str]:
        if isinstance(raw, list) and raw:
            last = raw[-1]
            if isinstance(last, dict):
                label = last.get("label") or last.get("name")
                return str(label) if label else None
            return str(last)
        if isinstance(raw, dict):
            label = raw.get("label") or raw.get("name")
            return str(label) if label else None
        if isinstance(raw, str) and raw.strip():
            return raw
        return None

    def _fallback_url(self, external_id: str, country: str) -> str:
        return f"https://www.homedepot.com/p/{external_id}"

    def _in_stock(self, item: dict[str, Any]) -> Optional[bool]:
        if "in_stock" in item:
            return bool(item.get("in_stock"))
        if "is_buyable" in item:
            return bool(item.get("is_buyable"))
        return True

    async def fetch_deals(self, queries: list[str], country: str = "US"):
        if not self.enabled:
            logger.info("Home Depot adapter disabled (no API key)")
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
                "page": 1,
            },
        )
        self._collect(data, country, seen, deals)
        return deals
