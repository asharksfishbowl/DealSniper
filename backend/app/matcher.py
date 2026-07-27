from __future__ import annotations

import re

from app.models import Deal, Preference

# Expand short filter chips into title match terms.
# Keep OLED/QLED tied to "tv" so laptop OLED panels don't match.
KEYWORD_ALIASES: dict[str, list[str]] = {
    "tv": ["tv", "tvs", "television", "smart tv", "fire tv", "roku tv"],
    "laptop": ["laptop", "notebook", "macbook", "chromebook"],
    "headphones": ["headphone", "headphones", "earbuds", "earbud", "airpods"],
    "tablet": ["tablet", "ipad"],
    "monitor": ["monitor", "display"],
    "phone": ["phone", "iphone", "galaxy", "pixel", "smartphone"],
    "groceries": [
        "grocery",
        "groceries",
        "grocery deals",
        "organic",
        "snack",
        "pantry",
        "produce",
    ],
    "vitamins": ["vitamin", "vitamins", "supplement", "multivitamin"],
    "coffee": ["coffee", "espresso", "k-cup", "kcup"],
    "vacuum": ["vacuum", "dyson", "roomba"],
    "mattress": ["mattress", "bed-in-a-box", "memory foam"],
    "tools": ["tool", "drill", "dewalt", "milwaukee"],
}

# Home Depot is useless for pantry/food chips (returns carts/bags).
SKIP_RETAILERS_FOR_KEYWORDS: dict[str, frozenset[str]] = {
    "homedepot": frozenset(
        {
            "grocery deals",
            "coffee deals",
            "vitamins deals",
        }
    ),
}


def search_term_for_keyword(keyword: str) -> str:
    key = keyword.lower().strip()
    if key == "groceries":
        # SEARCH_ALIASES used to map this to the singular "grocery deals" —
        # every other keyword's plain "{key} deals" form matches its old
        # SEARCH_ALIASES entry byte-for-byte, this is the one exception.
        key = "grocery"
    return f"{key} deals"


def should_skip_retailer_for_query(retailer: str, query_key: str) -> bool:
    blocked = SKIP_RETAILERS_FOR_KEYWORDS.get(retailer.lower())
    if not blocked:
        return False
    return query_key.strip().lower() in blocked



def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip().lower() for part in value.split(",") if part.strip()]


def _match_terms(keyword: str) -> list[str]:
    key = keyword.lower().strip()
    return KEYWORD_ALIASES.get(key, [key])


def _term_in_text(term: str, haystack: str) -> bool:
    """Word-aware match so 'tv' does not hit inside random tokens."""
    term = term.lower().strip()
    if not term:
        return False
    if " " in term:
        return term in haystack
    return re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", haystack) is not None


def _text_matches_keywords(text: str, keywords: list[str]) -> bool:
    if not keywords:
        return True
    haystack = text.lower()
    for kw in keywords:
        for term in _match_terms(kw):
            if _term_in_text(term, haystack):
                return True
        # TVs often labeled OLED/QLED; require an explicit TV signal too
        if kw.lower().strip() == "tv":
            if (
                _term_in_text("oled", haystack) or _term_in_text("qled", haystack)
            ) and (
                _term_in_text("tv", haystack)
                or _term_in_text("tvs", haystack)
                or "television" in haystack
            ):
                return True
    return False


def score_deal(deal: Deal, prefs: Preference | None) -> float:
    """Return match score 0-100 for a deal against preferences.

    When keywords / categories / min % off / max price are set, mismatches
    are hard-excluded (score 0) so the board only shows matching deals.
    """
    if prefs is None:
        return min(100.0, max(0.0, deal.pct_off * 1.5))

    retailers = _split_csv(prefs.retailers)
    if retailers and deal.retailer.lower() not in retailers:
        return 0.0

    if prefs.max_price is not None and deal.price > prefs.max_price:
        return 0.0

    min_pct = prefs.min_pct_off or 0
    if deal.pct_off < min_pct:
        return 0.0

    title = (deal.title or "").lower()
    category = (deal.category or "").lower()
    # `search_queries` records why this cached product was fetched. This makes
    # arbitrary custom searches reliable even when the exact query words are
    # absent from a product title/category returned by the retailer.
    search_queries = (deal.search_queries or "").lower()
    blob = f"{title} {category} {search_queries}"

    keywords = _split_csv(prefs.keywords)
    if any(
        should_skip_retailer_for_query(
            deal.retailer, search_term_for_keyword(keyword)
        )
        for keyword in keywords
    ):
        return 0.0
    if keywords and not _text_matches_keywords(blob, keywords):
        return 0.0

    categories = _split_csv(prefs.categories)
    if categories and not any(cat in blob for cat in categories):
        return 0.0

    score = 0.0
    score += min(50.0, 20.0 + (deal.pct_off - min_pct) * 1.2)

    if keywords:
        hits = sum(1 for kw in keywords if _text_matches_keywords(blob, [kw]))
        score += min(30.0, hits * 15.0)
    else:
        score += 10.0

    if categories:
        score += 20.0
    else:
        score += 10.0

    return round(min(100.0, score), 1)
