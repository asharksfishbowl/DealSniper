from __future__ import annotations

import logging
from typing import Any, ClassVar, Optional

from adapters.base import NormalizedDeal
from adapters.openwebninja import FieldMap, OpenWebNinjaAdapter

logger = logging.getLogger(__name__)

# Substrings that disqualify a listing's `condition` as "new".
#
# Matched as substrings rather than compared against an allowlist because the
# API's exact condition vocabulary is not published, and an allowlist would
# silently drop every listing the moment eBay used a phrasing we had not
# enumerated. Rejecting on known not-new markers fails the safe way: an
# unrecognised condition is kept and shows up in the ingest ratio, rather than
# quietly emptying the retailer.
#
# "like new" is deliberately in this list even though it contains "new" -- it
# is a used-item grade.
_NOT_NEW_MARKERS = (
    "used",
    "refurb",
    # Written space-separated, not hyphenated: _is_new() normalizes "-" and "_"
    # to spaces before matching, so a hyphenated marker could never match.
    "pre owned",
    "preowned",
    "open box",
    "for parts",
    "not working",
    "like new",
    "damaged",
)

# Tokens in a listing's returned `buying_format` that disqualify it.
#
# Phrased as a reject-list rather than a "must look like Buy It Now" allowlist
# on purpose. The request already pins buying_format=buy_it_now server-side, so
# this is the second line of defence; if the returned value used a spelling we
# had not enumerated ("BIN", say), an allowlist would silently drop every
# listing and empty the retailer. Rejecting on explicit auction wording cannot
# fail that way.
_NOT_PURCHASABLE_MARKERS = ("auction", "bid", "offer", "best offer")


class EbayOpenWebNinjaAdapter(OpenWebNinjaAdapter):
    retailer: ClassVar[str] = "ebay"
    api_slug: ClassVar[str] = "real-time-ebay-data"
    ticker_prefix: ClassVar[str] = "EBAY"
    supports_untargeted: ClassVar[bool] = False
    supported_countries: ClassVar[frozenset[str] | None] = frozenset({"US"})
    fields: ClassVar[FieldMap] = FieldMap(
        # item_id only -- deliberately NOT epid. An epid is eBay's CATALOG id:
        # many different sellers' listings of the same product share one. Using
        # it as external_id would break two things at once. _collect() dedups on
        # external_id (openwebninja.py), so two genuinely different listings
        # that share a catalog match would collapse into one and the second
        # would be silently discarded. And _fallback_url() builds
        # ebay.com/itm/{external_id}, which is a LISTING path -- an epid there
        # 404s. A listing with no item_id has no identity we can use, so
        # _normalize_product() dropping it is the right outcome.
        id=("item_id", "id"),
        title=("title", "product_title"),
        # price is numeric, price_raw a string -- parse_money() handles both.
        price=("price", "price_raw"),
        list_price=("original_price", "list_price", "was_price"),
        url=("url", "item_url", "product_url"),
        # image first: this feeds a dense list row, not a detail hero.
        image=("image", "image_high_res", "thumbnail"),
        # Deliberately empty: eBay search results carry no category field.
        # score_deal() builds its match blob from title + category +
        # search_queries (app/matcher.py), and search_queries records the query
        # that fetched the row, so keyword matching still works without it.
        category=(),
        rating=("rating",),
        review_count=("review_count",),
        # Deliberately empty. The API types `discount` as string|null with no
        # sample value. _normalize_product() does
        # float(str(raw).replace("%","").strip()), so "20% off" raises and falls
        # back to compute_pct_off() harmlessly -- but a "$50 off"-style value
        # would parse as 50 PERCENT and overstate the discount. Leaving it
        # unmapped makes pct_off derive from price vs original_price, which is
        # unambiguous. Map it only once a live payload shows `discount` is
        # reliably a bare percent.
        discount_pct=(),
        product_lists=("products", "results", "items", "search_results", "listings"),
    )

    def _domain(self, country: str) -> str:
        # eBay's domain values are hostnames ("com", "co.uk", "de", "ca"), NOT
        # Walmart's "us"/"ca" country codes. supported_countries is US-only, so
        # this is always "com" today; kept as a method to match the base class
        # and to make adding co.uk/de a one-line change.
        return "com"

    def _fallback_url(self, external_id: str, country: str) -> str:
        return f"https://www.ebay.com/itm/{external_id}"

    # No _in_stock override: the base returns True, which is already right here.
    # A listing returned by search is live by definition -- eBay drops sold and
    # ended fixed-price listings from search results. The sibling adapters
    # override it because they have real per-item stock signals; eBay has none.

    def _extract_products(self, data: Any) -> list[dict]:
        return [x for x in super()._extract_products(data) if self._is_ingestable(x)]

    def _is_buy_it_now(self, item: dict[str, Any]) -> bool:
        """True when this listing has a fixed price you can actually pay.

        Auctions are excluded because their `price` is the CURRENT BID, not a
        purchase price -- it rises over time. Ranking that by "% off" on the
        board would state something false.
        """
        fmt = str(item.get("buying_format") or "").strip().lower()
        if fmt:
            return not any(marker in fmt for marker in _NOT_PURCHASABLE_MARKERS)

        # No buying_format on this listing: fall back to auction signals. Only
        # consulted when the format is absent -- a fixed-price listing can
        # legitimately carry a time_left (30-day listings do), so these must not
        # override an explicit format.
        #
        # Both are truthiness checks, not `is not None`: if the API emits
        # bid_count as a typed integer defaulting to 0 on every listing, then
        # testing for presence would drop every fixed-price listing and silently
        # empty the retailer. An auction that genuinely has no bids yet is still
        # caught by time_left, which every auction carries.
        if item.get("bid_count"):
            return False
        if item.get("time_left"):
            return False
        return True

    def _is_new(self, item: dict[str, Any]) -> bool:
        """True when the listing is not used, refurbished or damaged."""
        if item.get("is_ebay_refurbished"):
            return False
        # Separators normalized rather than enumerating every punctuation
        # variant per marker: "Open Box", "Open-Box" and "open_box" all have to
        # match the single "open box" marker.
        condition = (
            str(item.get("condition") or "")
            .strip()
            .lower()
            .replace("-", " ")
            .replace("_", " ")
        )
        if not condition:
            # Condition absent: keep it. Being wrong here shows up as a stray
            # used item, whereas dropping every condition-less listing could
            # silently empty the retailer.
            return True
        return not any(marker in condition for marker in _NOT_NEW_MARKERS)

    def _is_ingestable(self, item: dict[str, Any]) -> bool:
        """Whether a raw eBay listing belongs on the board at all.

        Kept as one named predicate so the policy is readable in one place and
        the new-vs-used decision is a single-line change.
        """
        return self._is_buy_it_now(item) and self._is_new(item)

    async def fetch_deals(self, queries: list[str], country: str = "US"):
        if not self.enabled:
            logger.info("eBay adapter disabled (no API key)")
            return []
        if not queries:
            return []

        country = self.normalize_country(country)
        deals: list[NormalizedDeal] = []
        seen: set[str] = set()

        # Filtering happens server-side so we don't pay for results we discard.
        # _is_ingestable() still re-checks every listing -- the API filters and
        # the response fields are two different surfaces, and a silently
        # ignored param would otherwise put auctions on the board.
        #
        # buying_format is buy_it_now only. "accepts_offers" is excluded even
        # though such listings usually also carry a fixed price: the board
        # ranks by % off a purchase price, and an offer listing's price is a
        # starting point for negotiation.
        #
        # sort_by is omitted -- the API already defaults to BEST_MATCH.
        data = await self._get(
            "/search",
            {
                "query": queries[0],
                "domain": self._domain(country),
                "page": 1,
                "condition": "new",
                "buying_format": "buy_it_now",
            },
        )
        self._collect(data, country, seen, deals)
        return deals
