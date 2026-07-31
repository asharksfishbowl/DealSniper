from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    openwebninja_api_key: str = ""
    amazon_affiliate_tag: str = ""
    walmart_affiliate_id: str = ""
    homedepot_affiliate_id: str = ""
    database_url: str = "sqlite:///./dealsniper.db"
    match_alert_threshold: int = 70
    cors_origins: str = "*"
    # Keep default searches short — each query is an API call per retailer
    default_queries: str = "electronics"
    # Global pause between any live OpenWebNinja batch (unless force=true)
    refresh_min_interval_seconds: int = 300
    # After HTTP 429, pause live fetches
    rate_limit_cooldown_seconds: int = 600
    # Per retailer+query+country: reuse DB deals this long before another API search.
    # 28800s = 8h ≈ 3 searches/day for the same "tv" query.
    search_cache_ttl_seconds: int = 28800
    # Only persist products that are actually discounted (DealSniper is deals, not catalogs).
    min_ingest_pct_off: float = 5.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
