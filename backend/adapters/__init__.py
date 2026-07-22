from __future__ import annotations

from typing import Type

from adapters.amazon_openwebninja import AmazonOpenWebNinjaAdapter
from adapters.base import TICKER_PREFIXES
from adapters.costco_openwebninja import CostcoOpenWebNinjaAdapter
from adapters.homedepot_openwebninja import HomeDepotOpenWebNinjaAdapter
from adapters.openwebninja import OpenWebNinjaAdapter
from adapters.walmart_openwebninja import WalmartOpenWebNinjaAdapter

# Register stores here — refresh iterates this map automatically.
STORE_ADAPTERS: dict[str, Type[OpenWebNinjaAdapter]] = {
    AmazonOpenWebNinjaAdapter.retailer: AmazonOpenWebNinjaAdapter,
    CostcoOpenWebNinjaAdapter.retailer: CostcoOpenWebNinjaAdapter,
    WalmartOpenWebNinjaAdapter.retailer: WalmartOpenWebNinjaAdapter,
    HomeDepotOpenWebNinjaAdapter.retailer: HomeDepotOpenWebNinjaAdapter,
}

# Keep ticker prefixes in sync with registered adapters.
for _cls in STORE_ADAPTERS.values():
    TICKER_PREFIXES[_cls.retailer] = _cls.ticker_prefix

__all__ = [
    "AmazonOpenWebNinjaAdapter",
    "CostcoOpenWebNinjaAdapter",
    "WalmartOpenWebNinjaAdapter",
    "HomeDepotOpenWebNinjaAdapter",
    "OpenWebNinjaAdapter",
    "STORE_ADAPTERS",
]
