import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from accounting import depreciation
from database import get_db

router = APIRouter(prefix="/api/assets", tags=["assets"])


def _get_company(db: Session) -> models.Company:
    company = db.query(models.Company).first()
    if not company:
        raise HTTPException(400, "Company setup has not been completed yet")
    return company


def _serialize(asset: models.FixedAsset) -> dict:
    snap = depreciation.asset_snapshot(asset)
    return {
        "id": asset.id,
        "name": asset.name,
        "category": asset.category,
        "purchase_date": asset.purchase_date,
        "cost": asset.cost,
        "useful_life_years": asset.useful_life_years,
        "residual_value": asset.residual_value,
        "account_id": asset.account_id,
        "notes": asset.notes,
        "is_disposed": asset.is_disposed,
        "disposed_date": asset.disposed_date,
        "accumulated_depreciation": snap["accumulated_depreciation"],
        "book_value": snap["book_value"],
        "annual_depreciation": snap["annual_depreciation"],
    }


@router.get("")
def list_assets(db: Session = Depends(get_db)):
    assets = db.query(models.FixedAsset).order_by(models.FixedAsset.purchase_date.desc()).all()
    return [_serialize(a) for a in assets]


@router.post("")
def create_asset(payload: schemas.FixedAssetIn, db: Session = Depends(get_db)):
    asset = models.FixedAsset(**payload.model_dump())
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return _serialize(asset)


@router.put("/{asset_id}")
def update_asset(asset_id: int, payload: schemas.FixedAssetIn, db: Session = Depends(get_db)):
    asset = db.query(models.FixedAsset).get(asset_id)
    if not asset:
        raise HTTPException(404, "Asset not found")
    for field, value in payload.model_dump().items():
        setattr(asset, field, value)
    db.commit()
    db.refresh(asset)
    return _serialize(asset)


@router.post("/{asset_id}/dispose")
def dispose_asset(asset_id: int, disposed_date: datetime.date, db: Session = Depends(get_db)):
    asset = db.query(models.FixedAsset).get(asset_id)
    if not asset:
        raise HTTPException(404, "Asset not found")
    asset.is_disposed = True
    asset.disposed_date = disposed_date
    db.commit()
    return _serialize(asset)


@router.delete("/{asset_id}")
def delete_asset(asset_id: int, db: Session = Depends(get_db)):
    asset = db.query(models.FixedAsset).get(asset_id)
    if not asset:
        raise HTTPException(404, "Asset not found")
    db.delete(asset)
    db.commit()
    return {"ok": True}


@router.get("/{asset_id}/depreciation-schedule")
def asset_depreciation_schedule(asset_id: int, db: Session = Depends(get_db)):
    asset = db.query(models.FixedAsset).get(asset_id)
    if not asset:
        raise HTTPException(404, "Asset not found")
    company = _get_company(db)
    schedule = depreciation.depreciation_schedule(asset, company.fy_start_month)
    return {"asset": _serialize(asset), "schedule": schedule}
