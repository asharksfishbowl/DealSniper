from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from adapters.base import clean_title
from app.bootstrap import is_demo_deal
from app.database import get_db
from app.matcher import score_deal
from app.models import Deal, Preference
from app.schemas import DealOut

router = APIRouter(prefix="/deals", tags=["deals"])


def _deal_out(deal: Deal, match: float) -> DealOut:
    out = DealOut.model_validate(deal)
    out.title = clean_title(deal.title)
    out.match_score = match
    out.is_demo = is_demo_deal(deal.retailer, deal.external_id)
    return out


@router.get("", response_model=list[DealOut])
def list_deals(
    device_id: str | None = Query(default=None),
    retailer: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    prefs = None
    if device_id:
        prefs = db.query(Preference).filter(Preference.device_id == device_id).one_or_none()

    q = db.query(Deal)
    if retailer:
        q = q.filter(Deal.retailer == retailer.lower())

    # Score a wide recent pool so keyword matches aren't dropped by a top-% pre-limit.
    deals = q.order_by(Deal.last_seen.desc(), Deal.pct_off.desc()).limit(2000).all()

    scored: list[DealOut] = []
    for deal in deals:
        match = score_deal(deal, prefs)
        # Hard-exclude non-matches whenever device prefs exist.
        if prefs is not None and match <= 0:
            continue
        scored.append(_deal_out(deal, match))

    scored.sort(key=lambda d: (d.match_score or 0, d.pct_off), reverse=True)
    return scored[:limit]


@router.get("/{deal_id}", response_model=DealOut)
def get_deal(
    deal_id: int,
    device_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    deal = db.query(Deal).filter(Deal.id == deal_id).one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    prefs = None
    if device_id:
        prefs = db.query(Preference).filter(Preference.device_id == device_id).one_or_none()
    return _deal_out(deal, score_deal(deal, prefs))
