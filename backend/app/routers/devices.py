from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Device
from app.schemas import DeviceOut, DeviceRegisterIn

router = APIRouter(prefix="/devices", tags=["devices"])


@router.post("/register", response_model=DeviceOut)
def register_device(payload: DeviceRegisterIn, db: Session = Depends(get_db)):
    device = db.query(Device).filter(Device.device_id == payload.device_id).one_or_none()
    if not device:
        device = Device(device_id=payload.device_id)
        db.add(device)
    if payload.expo_push_token is not None:
        device.expo_push_token = payload.expo_push_token
    db.commit()
    db.refresh(device)
    return device
