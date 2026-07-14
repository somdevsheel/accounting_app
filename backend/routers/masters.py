from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from accounting import ledger
from database import get_db

router = APIRouter(prefix="/api", tags=["masters"])


# ---------- Company ----------


@router.get("/company", response_model=schemas.CompanyOut)
def get_company(db: Session = Depends(get_db)):
    company = db.query(models.Company).first()
    if not company:
        raise HTTPException(404, "Company has not been set up yet")
    return company


@router.put("/company", response_model=schemas.CompanyOut)
def update_company(payload: schemas.CompanyUpdate, db: Session = Depends(get_db)):
    company = db.query(models.Company).first()
    if not company:
        raise HTTPException(404, "Company has not been set up yet")
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(company, field, value)
    db.commit()
    db.refresh(company)
    return company


# ---------- Tax rates ----------


@router.get("/tax-rates", response_model=list[schemas.TaxRateOut])
def list_tax_rates(db: Session = Depends(get_db)):
    return db.query(models.TaxRate).order_by(models.TaxRate.rate).all()


@router.post("/tax-rates", response_model=schemas.TaxRateOut)
def create_tax_rate(payload: schemas.TaxRateIn, db: Session = Depends(get_db)):
    rate = models.TaxRate(rate=payload.rate, label=payload.label, is_active=True)
    db.add(rate)
    db.commit()
    db.refresh(rate)
    return rate


@router.put("/tax-rates/{rate_id}", response_model=schemas.TaxRateOut)
def update_tax_rate(rate_id: int, payload: schemas.TaxRateIn, db: Session = Depends(get_db)):
    rate = db.query(models.TaxRate).get(rate_id)
    if not rate:
        raise HTTPException(404, "Tax rate not found")
    rate.rate = payload.rate
    rate.label = payload.label
    db.commit()
    db.refresh(rate)
    return rate


@router.delete("/tax-rates/{rate_id}")
def delete_tax_rate(rate_id: int, db: Session = Depends(get_db)):
    rate = db.query(models.TaxRate).get(rate_id)
    if not rate:
        raise HTTPException(404, "Tax rate not found")
    db.delete(rate)
    db.commit()
    return {"ok": True}


# ---------- Owners ----------


@router.get("/owners", response_model=list[schemas.OwnerOut])
def list_owners(db: Session = Depends(get_db)):
    return db.query(models.Owner).order_by(models.Owner.id).all()


@router.post("/owners", response_model=schemas.OwnerOut)
def create_owner(payload: schemas.OwnerIn, db: Session = Depends(get_db)):
    existing_codes = [int(a.code) for a in db.query(models.Account).all() if a.code.isdigit()]
    code = str((max(existing_codes) + 1) if existing_codes else 3100)
    capital_account = models.Account(
        code=code,
        name=f"{payload.name} Capital",
        type="Capital",
        category="Capital",
        normal_balance="Credit",
        is_active=True,
        is_system=True,
    )
    db.add(capital_account)
    db.flush()
    owner = models.Owner(
        name=payload.name,
        role=payload.role,
        share_percent=payload.share_percent,
        capital_account_id=capital_account.id,
        is_active=True,
    )
    db.add(owner)
    db.commit()
    db.refresh(owner)
    return owner


@router.put("/owners/{owner_id}", response_model=schemas.OwnerOut)
def update_owner(owner_id: int, payload: schemas.OwnerIn, db: Session = Depends(get_db)):
    owner = db.query(models.Owner).get(owner_id)
    if not owner:
        raise HTTPException(404, "Owner not found")
    owner.name = payload.name
    owner.role = payload.role
    owner.share_percent = payload.share_percent
    if owner.capital_account_id:
        acc = db.query(models.Account).get(owner.capital_account_id)
        if acc:
            acc.name = f"{payload.name} Capital"
    db.commit()
    db.refresh(owner)
    return owner


@router.delete("/owners/{owner_id}")
def deactivate_owner(owner_id: int, db: Session = Depends(get_db)):
    owner = db.query(models.Owner).get(owner_id)
    if not owner:
        raise HTTPException(404, "Owner not found")
    owner.is_active = False
    db.commit()
    return {"ok": True}


# ---------- Customers ----------


def _customer_outstanding(db: Session, customer_id: int) -> float:
    entries = (
        db.query(models.JournalEntry)
        .filter(
            models.JournalEntry.customer_id == customer_id,
            models.JournalEntry.voucher_type == "Sales",
            models.JournalEntry.payment_status != "Paid",
            models.JournalEntry.is_void.is_(False),
        )
        .all()
    )
    total = 0.0
    for e in entries:
        total += sum(l.debit_amount for l in e.lines)
    return round(total, 2)


@router.get("/customers", response_model=list[schemas.CustomerOut])
def list_customers(include_inactive: bool = True, db: Session = Depends(get_db)):
    q = db.query(models.Customer)
    if not include_inactive:
        q = q.filter(models.Customer.is_active.is_(True))
    customers = q.order_by(models.Customer.name).all()
    result = []
    for c in customers:
        out = schemas.CustomerOut.model_validate(c)
        out.outstanding_balance = _customer_outstanding(db, c.id)
        result.append(out)
    return result


@router.post("/customers", response_model=schemas.CustomerOut)
def create_customer(payload: schemas.CustomerIn, db: Session = Depends(get_db)):
    customer = models.Customer(**payload.model_dump(), is_active=True)
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.put("/customers/{customer_id}", response_model=schemas.CustomerOut)
def update_customer(customer_id: int, payload: schemas.CustomerIn, db: Session = Depends(get_db)):
    customer = db.query(models.Customer).get(customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    for field, value in payload.model_dump().items():
        setattr(customer, field, value)
    db.commit()
    db.refresh(customer)
    out = schemas.CustomerOut.model_validate(customer)
    out.outstanding_balance = _customer_outstanding(db, customer.id)
    return out


@router.delete("/customers/{customer_id}")
def deactivate_customer(customer_id: int, db: Session = Depends(get_db)):
    customer = db.query(models.Customer).get(customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    customer.is_active = False
    db.commit()
    return {"ok": True}


# ---------- Vendors ----------


def _vendor_outstanding(db: Session, vendor_id: int) -> float:
    entries = (
        db.query(models.JournalEntry)
        .filter(
            models.JournalEntry.vendor_id == vendor_id,
            models.JournalEntry.voucher_type == "Purchase",
            models.JournalEntry.payment_status != "Paid",
            models.JournalEntry.is_void.is_(False),
        )
        .all()
    )
    total = 0.0
    for e in entries:
        total += sum(l.credit_amount for l in e.lines)
    return round(total, 2)


@router.get("/vendors", response_model=list[schemas.VendorOut])
def list_vendors(include_inactive: bool = True, db: Session = Depends(get_db)):
    q = db.query(models.Vendor)
    if not include_inactive:
        q = q.filter(models.Vendor.is_active.is_(True))
    vendors = q.order_by(models.Vendor.name).all()
    result = []
    for v in vendors:
        out = schemas.VendorOut.model_validate(v)
        out.outstanding_balance = _vendor_outstanding(db, v.id)
        result.append(out)
    return result


@router.post("/vendors", response_model=schemas.VendorOut)
def create_vendor(payload: schemas.VendorIn, db: Session = Depends(get_db)):
    vendor = models.Vendor(**payload.model_dump(), is_active=True)
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return vendor


@router.put("/vendors/{vendor_id}", response_model=schemas.VendorOut)
def update_vendor(vendor_id: int, payload: schemas.VendorIn, db: Session = Depends(get_db)):
    vendor = db.query(models.Vendor).get(vendor_id)
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    for field, value in payload.model_dump().items():
        setattr(vendor, field, value)
    db.commit()
    db.refresh(vendor)
    out = schemas.VendorOut.model_validate(vendor)
    out.outstanding_balance = _vendor_outstanding(db, vendor.id)
    return out


@router.delete("/vendors/{vendor_id}")
def deactivate_vendor(vendor_id: int, db: Session = Depends(get_db)):
    vendor = db.query(models.Vendor).get(vendor_id)
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    vendor.is_active = False
    db.commit()
    return {"ok": True}
