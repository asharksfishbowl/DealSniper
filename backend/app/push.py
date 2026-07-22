from __future__ import annotations

import logging
from typing import Iterable

import httpx

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_expo_push(
    tokens: Iterable[str],
    title: str,
    body: str,
    data: dict | None = None,
) -> int:
    messages = [
        {
            "to": token,
            "sound": "default",
            "title": title,
            "body": body,
            "data": data or {},
        }
        for token in tokens
        if token and token.startswith("ExponentPushToken")
    ]
    if not messages:
        return 0

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(EXPO_PUSH_URL, json=messages)
            resp.raise_for_status()
        return len(messages)
    except Exception as exc:
        logger.warning("Expo push failed: %s", exc)
        return 0
