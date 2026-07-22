from __future__ import annotations

import logging
from typing import ClassVar, Optional

from adapters.base import NormalizedDeal
from adapters.openwebninja import FieldMap, OpenWebNinjaAdapter

logger = logging.getLogger(__name__)


class CostcoOpenWebNinjaAdapter(OpenWebNinjaAdapter):
    retailer: ClassVar[str] = "costco"
    api_slug: ClassVar[str] = "realtime-costco-data"
    ticker_prefix: ClassVar[str] = "COST"
    supports_untargeted: ClassVar[bool] = False
    supported_countries: ClassVar[frozenset[str] | None] = frozenset({"US", "CA"})
    fields: ClassVar[FieldMap] = FieldMap(
        id=("item_number", "product_id", "group_id", "id"),
        title=("item_product_name", "name", "item_short_description", "description"),
        price=("item_location_pricing_salePrice", "salePrice", "price"),
        list_price=(
            "item_location_pricing_listPrice",
            "listPrice",
            "item_location_pricing_salePrice",
        ),
        url=("url",),
        image=("item_product_primary_image", "image", "thumbnail"),
        category=("categoryPath_ss", "categories"),
        rating=("item_review_ratings", "item_rating", "rating"),
        review_count=("item_product_review_count", "item_review_count", "review_count"),
        product_lists=("products", "results", "items", "product"),
    )

    def _language(self, country: str) -> str:
        return "en-CA" if country.upper() == "CA" else "en-US"

    def _parse_category(self, raw) -> Optional[str]:
        if isinstance(raw, list) and raw:
            path = str(raw[-1]).replace(".html", "").strip("/")
            return path.split("/")[-1].replace("-", " ").title() if path else None
        if isinstance(raw, str) and raw.strip():
            return raw
        return None

    def _fallback_url(self, external_id: str, country: str) -> str:
        domain = "www.costco.ca" if country.upper() == "CA" else "www.costco.com"
        return f"https://{domain}/.product.{external_id}.html"

    def _in_stock(self, item: dict) -> Optional[bool]:
        delivery = str(item.get("deliveryStatus") or "").lower()
        return None if not delivery else ("out" not in delivery)

    async def fetch_deals(self, queries: list[str], country: str = "US"):
        if not self.enabled:
            logger.info("Costco adapter disabled (no API key)")
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
                "country": country,
                "language": self._language(country),
                "start": 0,
            },
        )
        self._collect(data, country, seen, deals)
        return deals

    async def fetch_product_details(
        self, product_id: str, country: str = "US"
    ) -> Optional[NormalizedDeal]:
        country = self.normalize_country(country)
        data = await self._get(
            "/product-details",
            {
                "product_id": product_id,
                "country": country,
                "language": self._language(country),
            },
        )
        products = self._extract_products(data)
        if not products:
            return None
        return self._normalize_product(products[0], country)
