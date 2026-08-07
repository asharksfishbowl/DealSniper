from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from adapters.base import NormalizedDeal, compute_pct_off, make_ticker
from app.models import Deal
from app.services.refresh import upsert_deals

logger = logging.getLogger(__name__)

DEMO_DEALS: list[NormalizedDeal] = [
    NormalizedDeal(
        retailer="amazon",
        external_id="B0BOOT001",
        title="Sony WH-1000XM5 Wireless Noise Cancelling Headphones",
        price=278.00,
        list_price=399.99,
        pct_off=compute_pct_off(278.00, 399.99),
        url="https://www.amazon.com/dp/B0BOOT001",
        category="Electronics",
        ticker=make_ticker("amazon", "B0BOOT001", "Sony WH-1000XM5 Wireless"),
        rating=4.6,
        review_count=28431,
    ),
    NormalizedDeal(
        retailer="amazon",
        external_id="B0BOOT002",
        title="Instant Pot Duo Plus 9-in-1 Electric Pressure Cooker 6 Qt",
        price=89.95,
        list_price=149.99,
        pct_off=compute_pct_off(89.95, 149.99),
        url="https://www.amazon.com/dp/B0BOOT002",
        category="Home",
        ticker=make_ticker("amazon", "B0BOOT002", "Instant Pot Duo Plus"),
        rating=4.7,
        review_count=91204,
    ),
    NormalizedDeal(
        retailer="costco",
        external_id="1644523",
        title="Kirkland Signature Organic Extra Virgin Olive Oil 2L",
        price=17.99,
        list_price=22.99,
        pct_off=compute_pct_off(17.99, 22.99),
        url="https://www.costco.com/.product.1644523.html",
        category="Groceries",
        ticker=make_ticker("costco", "1644523", "Kirkland Olive Oil"),
        rating=4.8,
        review_count=412,
    ),
    NormalizedDeal(
        retailer="costco",
        external_id="100384650",
        title="Samsung 65-Inch Class QLED 4K Smart TV",
        price=797.99,
        list_price=1099.99,
        pct_off=compute_pct_off(797.99, 1099.99),
        url="https://www.costco.com/.product.100384650.html",
        category="Electronics",
        ticker=make_ticker("costco", "100384650", "Samsung QLED TV"),
        rating=4.5,
        review_count=1288,
    ),
    NormalizedDeal(
        retailer="amazon",
        external_id="B0BOOT003",
        title="Apple AirPods Pro (2nd Generation) USB-C",
        price=189.00,
        list_price=249.00,
        pct_off=compute_pct_off(189.00, 249.00),
        url="https://www.amazon.com/dp/B0BOOT003",
        category="Electronics",
        ticker=make_ticker("amazon", "B0BOOT003", "Apple AirPods Pro"),
        rating=4.7,
        review_count=156002,
    ),
]

DEMO_KEYS = frozenset((deal.retailer, deal.external_id) for deal in DEMO_DEALS)


def is_demo_deal(retailer: str, external_id: str) -> bool:
    return (retailer.lower(), external_id) in DEMO_KEYS


async def ensure_bootstrap_deals(db: Session) -> int:
    """Seed clearly labeled demo data only when the deal database is empty."""
    if db.query(Deal).count() > 0:
        return 0
    saved = await upsert_deals(db, DEMO_DEALS)
    logger.info("Seeded %s labeled demo deal(s)", len(saved))
    return len(saved)
