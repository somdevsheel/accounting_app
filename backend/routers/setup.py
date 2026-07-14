from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
import setup as setup_logic
from database import get_db

router = APIRouter(prefix="/api/setup", tags=["setup"])


@router.get("/status")
def get_status(db: Session = Depends(get_db)):
    return {"setup_complete": setup_logic.is_setup_complete(db)}


@router.get("/defaults")
def get_defaults(tax_name: str = "GST", country: str = "", db: Session = Depends(get_db)):
    fy_start_month = setup_logic.DEFAULT_FY_START_BY_COUNTRY.get(country, 1)
    return {
        "accounts": setup_logic.default_chart_of_accounts(tax_name),
        "tax_rates": [{"rate": r, "label": None} for r in setup_logic.DEFAULT_TAX_RATES],
        "fy_start_month": fy_start_month,
        "legal_structures": [
            "Sole Proprietorship",
            "Partnership",
            "LLP",
            "Private Limited",
            "Corporation",
        ],
        "currency_presets": [
            {"symbol": "₹", "code": "INR"},
            {"symbol": "$", "code": "USD"},
            {"symbol": "€", "code": "EUR"},
            {"symbol": "£", "code": "GBP"},
            {"symbol": "¥", "code": "JPY"},
            {"symbol": "A$", "code": "AUD"},
            {"symbol": "C$", "code": "CAD"},
            {"symbol": "$", "code": "SGD"},
            {"symbol": "AED", "code": "AED"},
        ],
    }


@router.post("/complete", response_model=schemas.CompanyOut)
def complete_setup(payload: schemas.SetupWizardIn, db: Session = Depends(get_db)):
    if setup_logic.is_setup_complete(db):
        raise HTTPException(400, "Setup has already been completed for this company")
    total_share = sum(o.share_percent for o in payload.owners)
    if payload.owners and abs(total_share - 100.0) > 0.01:
        pass  # warn-only, handled client-side; do not hard-block per spec
    company = setup_logic.apply_setup(db, payload)
    return company
