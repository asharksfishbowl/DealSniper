from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Preference
from app.schemas import PreferenceIn, PreferenceOut
from app.services.refresh import apply_preference_payload, serialize_preference

router = APIRouter(prefix="/preferences", tags=["preferences"])


@router.get("/{device_id}", response_model=PreferenceOut)
def get_preferences(device_id: str, db: Session = Depends(get_db)):
    prefs = db.query(Preference).filter(Preference.device_id == device_id).one_or_none()
    if not prefs:
        prefs = Preference(device_id=device_id)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
    return PreferenceOut(**serialize_preference(prefs))


@router.put("/{device_id}", response_model=PreferenceOut)
def put_preferences(device_id: str, payload: PreferenceIn, db: Session = Depends(get_db)):
    prefs = db.query(Preference).filter(Preference.device_id == device_id).one_or_none()
    if not prefs:
        prefs = Preference(device_id=device_id)
        db.add(prefs)
    apply_preference_payload(prefs, payload)
    db.commit()
    db.refresh(prefs)
    return PreferenceOut(**serialize_preference(prefs))
