from __future__ import annotations

import asyncio
import logging

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)

_CAMPAIGN_SETTING = {
    "walmart": "walmart_impact_campaign_id",
    "homedepot": "homedepot_impact_campaign_id",
}


def _campaign_id(retailer: str, settings: Settings) -> str:
    attr = _CAMPAIGN_SETTING.get(retailer.lower())
    return getattr(settings, attr, "") if attr else ""


def _is_configured(campaign_id: str, settings: Settings) -> bool:
    """The one copy of the "can we call Impact" rule.

    Takes the campaign id rather than the retailer so callers that already
    looked it up do not repeat the mapping lookup.
    """
    return bool(campaign_id and settings.impact_account_sid and settings.impact_auth_token)


def is_configured(retailer: str, settings: Settings) -> bool:
    """True when this retailer has everything needed for a live TrackingLinks call.

    Public so a caller can ask the question without building a coroutine.
    get_tracking_url() keeps its own identical guard -- it must stay safe to
    call directly.
    """
    return _is_configured(_campaign_id(retailer, settings), settings)


async def get_tracking_urls(
    items: list[tuple[str, str, str]], settings: Settings
) -> dict[tuple[str, str], str | None]:
    """Tracked deep links for many deals at once, keyed by (retailer, external_id).

    `items` are (retailer, external_id, product_url) triples. Retailers without
    a configured campaign are dropped *before* any coroutine is constructed, so
    the not-yet-enrolled case costs zero calls and zero coroutines -- it returns
    an empty dict without ever reaching asyncio.

    Concurrency lives here rather than in the caller because how many Impact
    calls may run at once is a fact about this integration, not about whatever
    happens to be looping over deals. A missing key and a None value mean the
    same thing to callers: fall back to the plain URL.
    """
    eligible = [
        (retailer, external_id, url)
        for retailer, external_id, url in items
        if url and is_configured(retailer, settings)
    ]
    if not eligible:
        return {}

    sem = asyncio.Semaphore(settings.impact_max_concurrent_requests)

    async def _one(retailer: str, product_url: str) -> str | None:
        async with sem:
            return await get_tracking_url(retailer, product_url, settings)

    urls = await asyncio.gather(*(_one(r, url) for r, _, url in eligible))
    return {(retailer, ext_id): url for (retailer, ext_id, _), url in zip(eligible, urls)}


async def get_tracking_url(
    retailer: str, product_url: str, settings: Settings
) -> str | None:
    """Impact.com tracked deep link for product_url, or None.

    None covers two distinct cases the caller treats identically
    (fall back to the plain URL): (a) no CampaignId configured yet
    for this retailer — verified no-op, no network call at all —
    and (b) the API call was attempted and failed/timed out.
    """
    campaign_id = _campaign_id(retailer, settings)
    if not _is_configured(campaign_id, settings):
        return None

    url = (
        f"https://api.impact.com/Mediapartners/{settings.impact_account_sid}"
        f"/Programs/{campaign_id}/TrackingLinks"
    )
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                url,
                params={"DeepLink": product_url},
                auth=(settings.impact_account_sid, settings.impact_auth_token),
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning(
            "Impact.com TrackingLinks call failed for %s: %s", retailer, exc
        )
        return None

    tracking_url = data.get("TrackingURL")
    if not tracking_url:
        logger.warning(
            "Impact.com TrackingLinks for %s returned no TrackingURL: %s",
            retailer, data,
        )
        return None
    return tracking_url
