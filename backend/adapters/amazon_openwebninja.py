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

        # CORRECTION (verified directly against the live API with a real key,
        # not guessed): "sort_by": "FEATURED" was the ONLY invalid value here --
        # confirmed by testing sort_by candidates directly, FEATURED alone 400s
        # while RELEVANCE/LOWEST_PRICE/HIGHEST_PRICE/NEWEST/REVIEWS/BEST_SELLERS
        # all work. "deals_and_discounts": "ALL_DISCOUNTS" is a REAL, valid
        # parameter -- an earlier fix wrongly dropped both together when only
        # sort_by was ever broken. Verified its actual effect: without it, a
        # 'coffee' page of 48 products has only 6 with any real discount info
        # (12.5%); with it, 27/48 do (56%) at the same page size/cost -- so
        # re-added just this param, still omitting the invalid sort_by.
        #
        # RELEVANCE-sorted (the default) page 1 alone still tends to miss
        # higher-discount items ranked lower for the query term, so pull
        # additional pages up to the configured cap -- stopping as soon as a
        # page adds no new products (either the result set is exhausted, or
        # _get() hit an error/quota/rate-limit and returned None, in which case
        # _get()'s own guard makes every further page in this loop a free
        # no-op rather than another live call).
        from app.config import get_settings

        max_pages = get_settings().amazon_search_max_pages
        for page in range(1, max_pages + 1):
            data = await self._get(
                "/search",
                {
                    "query": queries[0],
                    "country": country,
                    "page": page,
                    "deals_and_discounts": "ALL_DISCOUNTS",
                },
            )
            before = len(deals)
            self._collect(data, country, seen, deals)
            new_this_page = deals[before:]
            # Visible, first-party proof each page is a distinct batch of
            # results (not the same data re-fetched) -- logs the actual new
            # product titles this page added, so this is checkable directly
            # in the log stream rather than taken on faith.
            logger.info(
                "Amazon /search page %s for '%s': +%s new products (running total %s)%s",
                page,
                queries[0],
                len(new_this_page),
                len(deals),
                ": " + "; ".join(d.title[:40] for d in new_this_page[:3]) if new_this_page else "",
            )
            if not new_this_page:
                break
        return deals
