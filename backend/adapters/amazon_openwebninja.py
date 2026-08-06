from __future__ import annotations

import logging
from typing import ClassVar

from adapters.openwebninja import FieldMap, OpenWebNinjaAdapter

logger = logging.getLogger(__name__)


class AmazonOpenWebNinjaAdapter(OpenWebNinjaAdapter):
    retailer: ClassVar[str] = "amazon"
    api_slug: ClassVar[str] = "realtime-amazon-data"
    ticker_prefix: ClassVar[str] = "AMZN"
    supports_untargeted: ClassVar[bool] = True
    fields: ClassVar[FieldMap] = FieldMap(
        id=("asin", "product_asin", "ASIN", "deal_id"),
        title=("product_title", "title", "deal_title", "product_name"),
        price=("product_price", "deal_price", "price", "product_original_price"),
        list_price=("product_original_price", "list_price", "product_price"),
        url=("product_url", "url"),
        image=("product_photo", "product_image", "deal_photo", "image"),
        category=("category_path", "product_byline", "categories"),
        rating=("product_star_rating", "star_rating", "rating"),
        review_count=("product_num_ratings", "num_ratings", "reviews_count", "review_count"),
        discount_pct=("product_discount_percentage", "deal_discount_percentage"),
        product_lists=("products", "deals", "deal_products", "results", "items"),
    )

    def _fallback_url(self, external_id: str, country: str) -> str:
        return f"https://www.amazon.com/dp/{external_id}"

    async def fetch_deals(self, queries: list[str], country: str = "US"):
        if not self.enabled:
            logger.info("Amazon adapter disabled (no API key)")
            return []

        country = self.normalize_country(country)
        deals: list = []
        seen: set[str] = set()

        # Untargeted: one deals-v2 page only — do NOT fan out /deal-products (burns quota).
        if not queries:
            data = await self._get(
                "/deals-v2",
                {"country": country, "discount_range": "3", "page": 1},
            )
            self._collect(data, country, seen, deals)
            return deals

        # "sort_by": "FEATURED" + "deals_and_discounts": "ALL_DISCOUNTS" used to be
        # sent here but neither is a documented value for this endpoint (the API's
        # own default sort is "RELEVANCE"; "deals_and_discounts" doesn't appear in
        # its docs at all) -- confirmed via live logs that every keyword search hit
        # a 400 Bad Request on exactly this param combo, every time, since this
        # adapter was written. Dropped both rather than guess a replacement value
        # we can't verify; the API's own defaults apply.
        data = await self._get(
            "/search",
            {
                "query": queries[0],
                "country": country,
                "page": 1,
            },
        )
        self._collect(data, country, seen, deals)
        return deals
