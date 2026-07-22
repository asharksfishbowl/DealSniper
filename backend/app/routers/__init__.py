from __future__ import annotations

from fastapi import APIRouter

from app.routers import deals, devices, preferences, refresh

api_router = APIRouter()
api_router.include_router(deals.router)
api_router.include_router(preferences.router)
api_router.include_router(devices.router)
api_router.include_router(refresh.router)
