import datetime
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from accounting.numbering import next_invoice_no
from accounting.recurring import FREQUENCIES, advance_date
from database import get_db

router = APIRouter(prefix="/api/recurring-invoices", tags=["recurring"])


def _serialize(r: models.RecurringInvoice) -> dict:
    return {
        "id": r.id,
        "doc_type": r.doc_type,
        "customer_id": r.customer_id,
        "vendor_id": r.vendor_id,
        "frequency": r.frequency,
        "next_run_date": r.next_run_date,
        "notes": r.notes,
        "is_active": r.is_active,
        "items": json.loads(r.items_json),
        "customer_name": r.customer.name if r.customer else None,
        "vendor_name": r.vendor.name if r.vendor else None,
    }


@router.get("", response_model=list[schemas.RecurringInvoiceOut])
def list_recurring(db: Session = Depends(get_db)):
    rows = db.query(models.RecurringInvoice).order_by(models.RecurringInvoice.next_run_date).all()
    return [_serialize(r) for r in rows]


@router.post("", response_model=schemas.RecurringInvoiceOut)
def create_recurring(payload: schemas.RecurringInvoiceIn, db: Session = Depends(get_db)):
    if payload.frequency not in FREQUENCIES:
        raise HTTPException(400, f"Frequency must be one of {FREQUENCIES}")
    if not payload.items:
        raise HTTPException(400, "Add at least one line item")
    r = models.RecurringInvoice(
        doc_type=payload.doc_type,
        customer_id=payload.customer_id,
        vendor_id=payload.vendor_id,
        frequency=payload.frequency,
        next_run_date=payload.next_run_date,
        notes=payload.notes,
        is_active=payload.is_active,
        items_json=json.dumps([item.model_dump() for item in payload.items]),
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return _serialize(r)


@router.put("/{recurring_id}", response_model=schemas.RecurringInvoiceOut)
def update_recurring(recurring_id: int, payload: schemas.RecurringInvoiceIn, db: Session = Depends(get_db)):
    r = db.query(models.RecurringInvoice).get(recurring_id)
    if not r:
        raise HTTPException(404, "Recurring template not found")
    r.doc_type = payload.doc_type
    r.customer_id = payload.customer_id
    r.vendor_id = payload.vendor_id
    r.frequency = payload.frequency
    r.next_run_date = payload.next_run_date
    r.notes = payload.notes
    r.is_active = payload.is_active
    r.items_json = json.dumps([item.model_dump() for item in payload.items])
    db.commit()
    db.refresh(r)
    return _serialize(r)


@router.delete("/{recurring_id}")
def delete_recurring(recurring_id: int, db: Session = Depends(get_db)):
    r = db.query(models.RecurringInvoice).get(recurring_id)
    if not r:
        raise HTTPException(404, "Recurring template not found")
    db.delete(r)
    db.commit()
    return {"ok": True}


@router.post("/generate-due")
def generate_due(db: Session = Depends(get_db)):
    """Called on app launch: turns every active template whose next_run_date has
    arrived into a real Invoice/Receipt, then advances it to the following run."""
    today = datetime.date.today()
    due = (
        db.query(models.RecurringInvoice)
        .filter(models.RecurringInvoice.is_active.is_(True), models.RecurringInvoice.next_run_date <= today)
        .all()
    )
    generated = []
    for r in due:
        items = json.loads(r.items_json)
        invoice_no = next_invoice_no(db, r.doc_type)
        invoice = models.Invoice(
            invoice_no=invoice_no,
            doc_type=r.doc_type,
            customer_id=r.customer_id,
            vendor_id=r.vendor_id,
            date=r.next_run_date,
            notes=r.notes,
            status="Unpaid",
        )
        db.add(invoice)
        db.flush()
        subtotal, tax_amount = 0.0, 0.0
        for item in items:
            line_amount = round(item["quantity"] * item["rate"], 2)
            line_tax = round(line_amount * item["tax_rate_percent"] / 100.0, 2)
            subtotal += line_amount
            tax_amount += line_tax
            db.add(
                models.InvoiceItem(
                    invoice_id=invoice.id,
                    description=item["description"],
                    quantity=item["quantity"],
                    rate=item["rate"],
                    tax_rate_percent=item["tax_rate_percent"],
                    amount=line_amount,
                )
            )
        invoice.subtotal = round(subtotal, 2)
        invoice.tax_amount = round(tax_amount, 2)
        invoice.total = round(subtotal + tax_amount, 2)
        r.next_run_date = advance_date(r.next_run_date, r.frequency)
        generated.append(invoice_no)
    db.commit()
    return {"generated": generated, "count": len(generated)}
