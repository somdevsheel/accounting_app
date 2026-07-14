from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


@router.get("", response_model=list[schemas.AccountOut])
def list_accounts(
    include_inactive: bool = True,
    type: str | None = None,
    category: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.Account)
    if not include_inactive:
        q = q.filter(models.Account.is_active.is_(True))
    if type:
        q = q.filter(models.Account.type == type)
    if category:
        q = q.filter(models.Account.category == category)
    return q.order_by(models.Account.code).all()


@router.post("", response_model=schemas.AccountOut)
def create_account(payload: schemas.AccountIn, db: Session = Depends(get_db)):
    code = payload.code
    if not code:
        existing_codes = [int(a.code) for a in db.query(models.Account).all() if a.code.isdigit()]
        code = str((max(existing_codes) + 1) if existing_codes else 1000)
    if db.query(models.Account).filter(models.Account.code == code).first():
        raise HTTPException(400, f"Account code {code} already exists")
    acc = models.Account(
        code=code,
        name=payload.name,
        type=payload.type,
        category=payload.category,
        normal_balance=payload.normal_balance,
        is_active=True,
        is_system=False,
    )
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return acc


@router.put("/{account_id}", response_model=schemas.AccountOut)
def update_account(account_id: int, payload: schemas.AccountUpdate, db: Session = Depends(get_db)):
    acc = db.query(models.Account).get(account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(acc, field, value)
    db.commit()
    db.refresh(acc)
    return acc


@router.post("/{account_id}/deactivate", response_model=schemas.AccountOut)
def deactivate_account(account_id: int, db: Session = Depends(get_db)):
    acc = db.query(models.Account).get(account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    acc.is_active = False
    db.commit()
    db.refresh(acc)
    return acc


@router.post("/{account_id}/activate", response_model=schemas.AccountOut)
def activate_account(account_id: int, db: Session = Depends(get_db)):
    acc = db.query(models.Account).get(account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    acc.is_active = True
    db.commit()
    db.refresh(acc)
    return acc


@router.delete("/{account_id}")
def delete_account(account_id: int, db: Session = Depends(get_db)):
    acc = db.query(models.Account).get(account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    has_lines = db.query(models.JournalLine).filter(models.JournalLine.account_id == account_id).first()
    if has_lines:
        raise HTTPException(
            400,
            "This account has journal lines posted against it and cannot be deleted. Deactivate it instead.",
        )
    db.delete(acc)
    db.commit()
    return {"ok": True}
