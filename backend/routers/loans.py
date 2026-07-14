from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from accounting import loans as loans_logic
from database import get_db

router = APIRouter(prefix="/api/loans", tags=["loans"])


def _serialize(loan: models.Loan) -> dict:
    status = loans_logic.loan_status(loan)
    return {
        "id": loan.id,
        "lender_name": loan.lender_name,
        "principal": loan.principal,
        "interest_rate_annual": loan.interest_rate_annual,
        "tenure_months": loan.tenure_months,
        "start_date": loan.start_date,
        "account_id": loan.account_id,
        "notes": loan.notes,
        "is_active": loan.is_active,
        "emi": status["emi"],
        "outstanding_balance": status["outstanding_balance"],
        "total_interest_paid": status["total_interest_paid"],
        "installments_paid": status["installments_paid"],
    }


@router.get("")
def list_loans(db: Session = Depends(get_db)):
    loans = db.query(models.Loan).order_by(models.Loan.start_date.desc()).all()
    return [_serialize(l) for l in loans]


@router.post("")
def create_loan(payload: schemas.LoanIn, db: Session = Depends(get_db)):
    loan = models.Loan(**payload.model_dump(), is_active=True)
    db.add(loan)
    db.commit()
    db.refresh(loan)
    return _serialize(loan)


@router.put("/{loan_id}")
def update_loan(loan_id: int, payload: schemas.LoanIn, db: Session = Depends(get_db)):
    loan = db.query(models.Loan).get(loan_id)
    if not loan:
        raise HTTPException(404, "Loan not found")
    for field, value in payload.model_dump().items():
        setattr(loan, field, value)
    db.commit()
    db.refresh(loan)
    return _serialize(loan)


@router.delete("/{loan_id}")
def close_loan(loan_id: int, db: Session = Depends(get_db)):
    loan = db.query(models.Loan).get(loan_id)
    if not loan:
        raise HTTPException(404, "Loan not found")
    loan.is_active = False
    db.commit()
    return {"ok": True}


@router.get("/{loan_id}/schedule")
def loan_schedule(loan_id: int, db: Session = Depends(get_db)):
    loan = db.query(models.Loan).get(loan_id)
    if not loan:
        raise HTTPException(404, "Loan not found")
    status = loans_logic.loan_status(loan)
    return status
