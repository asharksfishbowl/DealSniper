from __future__ import annotations

import logging

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)

_CAMPAIGN_SETTING = {
    "walmart": "walmart_impact_campaign_id",
    "homedepot": "homedepot_impact_campaign_id",
}


async def get_tracking_url(
    retailer: str, product_url: str, settings: Settings
) -> str | None:
    """Impact.com tracked deep link for product_url, or None.

    None covers two distinct cases the caller treats identically
    (fall back to the plain URL): (a) no CampaignId configured yet
    for this retailer — verified no-op, no network call at all —
    and (b) the API call was attempted and failed/timed out.
    """
    attr = _CAMPAIGN_SETTING.get(retailer.lower())
    campaign_id = getattr(settings, attr, "") if attr else ""
    if not campaign_id or not settings.impact_account_sid or not settings.impact_auth_token:
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
