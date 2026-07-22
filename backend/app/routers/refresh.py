from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import RefreshIn, RefreshOut
from app.services.refresh import refresh_deals

router = APIRouter(tags=["refresh"])


@router.post("/refresh", response_model=RefreshOut)
async def refresh(payload: RefreshIn | None = None, db: Session = Depends(get_db)):
    body = payload or RefreshIn()
    result = await refresh_deals(db, device_id=body.device_id, force=body.force)
    return RefreshOut(**result)
