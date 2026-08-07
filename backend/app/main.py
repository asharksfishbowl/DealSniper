from __future__ import annotations

import logging
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure backend root is on path for `adapters` package
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import get_settings
from app.database import init_db
from app.routers import api_router

logging.basicConfig(level=logging.INFO)

settings = get_settings()
app = FastAPI(title="DealSniper API", version="0.1.0")

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.on_event("startup")
async def on_startup() -> None:
    from app.bootstrap import ensure_bootstrap_deals
    from app.config import get_settings
    from app.database import SessionLocal
    from app.services.refresh import purge_full_price_deals

    init_db()
    db = SessionLocal()
    try:
        await ensure_bootstrap_deals(db)
        purge_full_price_deals(db, min_pct=get_settings().min_ingest_pct_off)
    finally:
        db.close()


@app.get("/health")
def health():
    return {"status": "ok", "has_api_key": bool(settings.openwebninja_api_key)}
