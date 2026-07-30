from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from app.config import Settings


def _apply_amazon(url: str, settings: Settings) -> str:
    if not settings.amazon_affiliate_tag:
        return url
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["tag"] = settings.amazon_affiliate_tag
    return urlunsplit(parts._replace(query=urlencode(query)))


def _apply_walmart(url: str, settings: Settings) -> str:
    # Walmart affiliate links are typically routed through a third-party
    # network (Impact, CJ, Rakuten, etc.), not a simple URL query param.
    # Mechanism unconfirmed — pass through unchanged until the user has a
    # real affiliate network account and the actual link format is known.
    return url


def _apply_homedepot(url: str, settings: Settings) -> str:
    # Same situation as Walmart — third-party network, mechanism unconfirmed.
    return url


_TRANSFORMS = {
    "amazon": _apply_amazon,
    "walmart": _apply_walmart,
    "homedepot": _apply_homedepot,
}


def apply_affiliate_tag(retailer: str, url: str, settings: Settings) -> str:
    transform = _TRANSFORMS.get(retailer.lower())
    if transform is None:
        return url
    return transform(url, settings)
