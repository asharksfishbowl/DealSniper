from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Deal(Base):
    __tablename__ = "deals"
    __table_args__ = (UniqueConstraint("retailer", "external_id", name="uq_retailer_external"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    retailer: Mapped[str] = mapped_column(String(32), index=True)
    external_id: Mapped[str] = mapped_column(String(128), index=True)
    title: Mapped[str] = mapped_column(String(512))
    ticker: Mapped[str] = mapped_column(String(32), default="")
    category: Mapped[str | None] = mapped_column(String(128), nullable=True)
    price: Mapped[float] = mapped_column(Float)
    list_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    pct_off: Mapped[float] = mapped_column(Float, default=0.0)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    in_stock: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    review_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    search_queries: Mapped[str] = mapped_column(Text, default="")
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class Preference(Base):
    __tablename__ = "preferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    keywords: Mapped[str] = mapped_column(Text, default="")  # comma-separated
    categories: Mapped[str] = mapped_column(Text, default="")  # comma-separated
    min_pct_off: Mapped[float] = mapped_column(Float, default=10.0)
    max_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    retailers: Mapped[str] = mapped_column(String(128), default="amazon,costco")
    country: Mapped[str] = mapped_column(String(8), default="US")
    alerts_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    expo_push_token: Mapped[str | None] = mapped_column(String(256), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class AlertLog(Base):
    __tablename__ = "alert_logs"
    __table_args__ = (UniqueConstraint("device_id", "deal_id", name="uq_device_deal_alert"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[str] = mapped_column(String(128), index=True)
    deal_id: Mapped[int] = mapped_column(Integer, ForeignKey("deals.id"), index=True)
    match_score: Mapped[float] = mapped_column(Float, default=0.0)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    deal: Mapped[Deal] = relationship("Deal")


class SearchFetch(Base):
    """Last successful OpenWebNinja fetch per retailer + query + country.

    Product rows live in `deals`; this table is the throttle so the same
    search (e.g. amazon/tv/US) only hits the API a few times per day.
    """

    __tablename__ = "search_fetches"
    __table_args__ = (
        UniqueConstraint("retailer", "query_key", "country", name="uq_search_fetch"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    retailer: Mapped[str] = mapped_column(String(32), index=True)
    query_key: Mapped[str] = mapped_column(String(128), default="")  # "" = untargeted / hot deals
    country: Mapped[str] = mapped_column(String(8), default="US")
    result_count: Mapped[int] = mapped_column(Integer, default=0)
    last_fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
