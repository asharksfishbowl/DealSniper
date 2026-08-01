from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class DealOut(BaseModel):
    id: int
    retailer: str
    external_id: str
    title: str
    ticker: str
    category: Optional[str] = None
    price: float
    list_price: Optional[float] = None
    pct_off: float
    url: Optional[str] = None
    image_url: Optional[str] = None
    in_stock: Optional[bool] = None
    last_seen: datetime
    rating: Optional[float] = None
    review_count: Optional[int] = None
    match_score: Optional[float] = None
    is_demo: bool = False

    model_config = {"from_attributes": True}


class PreferenceIn(BaseModel):
    keywords: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    min_pct_off: float = 10.0
    max_price: Optional[float] = None
    retailers: list[str] = Field(default_factory=lambda: ["amazon", "costco"])
    country: str = "US"
    alerts_enabled: bool = True


class PreferenceOut(PreferenceIn):
    device_id: str


class DeviceRegisterIn(BaseModel):
    device_id: str
    expo_push_token: Optional[str] = None


class DeviceOut(BaseModel):
    device_id: str
    expo_push_token: Optional[str] = None

    model_config = {"from_attributes": True}


class RefreshIn(BaseModel):
    device_id: Optional[str] = None
    # User-initiated refresh (Save & Refresh / pull / button). Still blocked during 429 cooldown.
    force: bool = False


class RefreshOut(BaseModel):
    upserted: int
    amazon: int = 0
    costco: int = 0
    walmart: int = 0
    homedepot: int = 0
    alerts_sent: int
    used_cache_only: bool = False
    skipped_external: bool = False
    retry_after_seconds: int = 0
    message: str = "ok"
    cache_hits: list[str] = Field(default_factory=list)
    refresh_state: str = "cached"
    cache_age_seconds: Optional[int] = None
    cooldown_seconds: Optional[int] = None
    quota_reset_date: Optional[str] = None

    model_config = {"extra": "ignore"}
