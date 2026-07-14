import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from accounting.numbering import next_voucher_no
from database import get_db

router = APIRouter(prefix="/api/journal", tags=["journal"])


def _serialize(entry: models.JournalEntry) -> dict:
    lines = []
    total_debit = 0.0
    total_credit = 0.0
    for line in entry.lines:
        total_debit += line.debit_amount
        total_credit += line.credit_amount
        lines.append(
            {
                "id": line.id,
                "account_id": line.account_id,
                "account_name": line.account.name if line.account else None,
                "account_code": line.account.code if line.account else None,
                "debit_amount": line.debit_amount,
                "credit_amount": line.credit_amount,
                "description": line.description,
                "tax_rate_id": line.tax_rate_id,
                "is_cleared": line.is_cleared,
                "currency_code": line.currency_code,
                "exchange_rate": line.exchange_rate,
                "foreign_debit_amount": line.foreign_debit_amount,
                "foreign_credit_amount": line.foreign_credit_amount,
            }
        )
    attachments = [
        {
            "id": a.id,
            "journal_entry_id": a.journal_entry_id,
            "filename": a.filename,
            "mime_type": a.mime_type,
            "data": a.data,
            "uploaded_at": a.uploaded_at,
        }
        for a in entry.attachments
    ]
    return {
        "id": entry.id,
        "voucher_no": entry.voucher_no,
        "voucher_type": entry.voucher_type,
        "date": entry.date,
        "narration": entry.narration,
        "reference": entry.reference,
        "party_name": entry.party_name,
        "customer_id": entry.customer_id,
        "vendor_id": entry.vendor_id,
        "payment_mode": entry.payment_mode,
        "payment_status": entry.payment_status,
        "is_void": entry.is_void,
        "lines": lines,
        "attachments": attachments,
        "total_debit": round(total_debit, 2),
        "total_credit": round(total_credit, 2),
    }


def _validate_lines(lines: list[schemas.JournalLineIn], db: Session):
    if len(lines) < 2:
        raise HTTPException(400, "A journal entry needs at least 2 lines")
    total_debit = 0.0
    total_credit = 0.0
    for line in lines:
        if (line.debit_amount > 0) == (line.credit_amount > 0):
            raise HTTPException(
                400, "Each line must have exactly one non-zero amount (debit OR credit)"
            )
        acc = db.query(models.Account).get(line.account_id)
        if not acc:
            raise HTTPException(400, f"Account {line.account_id} does not exist")
        if not acc.is_active:
            raise HTTPException(400, f"Account '{acc.name}' is inactive")
        total_debit += line.debit_amount
        total_credit += line.credit_amount
    if abs(round(total_debit, 2) - round(total_credit, 2)) > 0.01:
        raise HTTPException(
            400,
            f"Entry is not balanced: total debit {round(total_debit,2)} != total credit {round(total_credit,2)}",
        )


@router.get("")
def list_entries(
    voucher_type: str | None = None,
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
    include_void: bool = False,
    account_type: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.JournalEntry).options(
        joinedload(models.JournalEntry.lines).joinedload(models.JournalLine.account)
    )
    if voucher_type:
        q = q.filter(models.JournalEntry.voucher_type == voucher_type)
    if start_date:
        q = q.filter(models.JournalEntry.date >= start_date)
    if end_date:
        q = q.filter(models.JournalEntry.date <= end_date)
    if not include_void:
        q = q.filter(models.JournalEntry.is_void.is_(False))
    entries = q.order_by(models.JournalEntry.date.desc(), models.JournalEntry.id.desc()).all()
    results = [_serialize(e) for e in entries]
    if account_type:
        results = [
            r for r in results if any(
                db.query(models.Account).get(l["account_id"]).type == account_type
                for l in r["lines"]
            )
        ]
    return results


@router.get("/{entry_id}")
def get_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(models.JournalEntry).get(entry_id)
    if not entry:
        raise HTTPException(404, "Journal entry not found")
    return _serialize(entry)


@router.post("")
def create_entry(payload: schemas.JournalEntryIn, db: Session = Depends(get_db)):
    _validate_lines(payload.lines, db)
    voucher_no = next_voucher_no(db, payload.voucher_type)
    entry = models.JournalEntry(
        voucher_no=voucher_no,
        voucher_type=payload.voucher_type,
        date=payload.date,
        narration=payload.narration,
        reference=payload.reference,
        party_name=payload.party_name,
        customer_id=payload.customer_id,
        vendor_id=payload.vendor_id,
        payment_mode=payload.payment_mode,
        payment_status=payload.payment_status,
    )
    db.add(entry)
    db.flush()
    for line_in in payload.lines:
        db.add(
            models.JournalLine(
                journal_entry_id=entry.id,
                account_id=line_in.account_id,
                debit_amount=line_in.debit_amount,
                credit_amount=line_in.credit_amount,
                description=line_in.description,
                tax_rate_id=line_in.tax_rate_id,
                currency_code=line_in.currency_code,
                exchange_rate=line_in.exchange_rate,
                foreign_debit_amount=line_in.foreign_debit_amount,
                foreign_credit_amount=line_in.foreign_credit_amount,
            )
        )
    db.commit()
    db.refresh(entry)
    return _serialize(entry)


@router.put("/{entry_id}")
def update_entry(entry_id: int, payload: schemas.JournalEntryIn, db: Session = Depends(get_db)):
    entry = db.query(models.JournalEntry).get(entry_id)
    if not entry:
        raise HTTPException(404, "Journal entry not found")
    if entry.is_void:
        raise HTTPException(400, "Cannot edit a voided entry")
    _validate_lines(payload.lines, db)

    entry.date = payload.date
    entry.voucher_type = payload.voucher_type
    entry.narration = payload.narration
    entry.reference = payload.reference
    entry.party_name = payload.party_name
    entry.customer_id = payload.customer_id
    entry.vendor_id = payload.vendor_id
    entry.payment_mode = payload.payment_mode
    entry.payment_status = payload.payment_status

    for line in list(entry.lines):
        db.delete(line)
    db.flush()
    for line_in in payload.lines:
        db.add(
            models.JournalLine(
                journal_entry_id=entry.id,
                account_id=line_in.account_id,
                debit_amount=line_in.debit_amount,
                credit_amount=line_in.credit_amount,
                description=line_in.description,
                tax_rate_id=line_in.tax_rate_id,
                currency_code=line_in.currency_code,
                exchange_rate=line_in.exchange_rate,
                foreign_debit_amount=line_in.foreign_debit_amount,
                foreign_credit_amount=line_in.foreign_credit_amount,
            )
        )
    db.commit()
    db.refresh(entry)
    return _serialize(entry)


@router.post("/{entry_id}/void")
def void_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(models.JournalEntry).get(entry_id)
    if not entry:
        raise HTTPException(404, "Journal entry not found")
    entry.is_void = True
    db.commit()
    return {"ok": True}


@router.post("/{entry_id}/unvoid")
def unvoid_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(models.JournalEntry).get(entry_id)
    if not entry:
        raise HTTPException(404, "Journal entry not found")
    entry.is_void = False
    db.commit()
    return {"ok": True}


@router.patch("/lines/{line_id}/toggle-cleared")
def toggle_cleared(line_id: int, db: Session = Depends(get_db)):
    line = db.query(models.JournalLine).get(line_id)
    if not line:
        raise HTTPException(404, "Journal line not found")
    line.is_cleared = not line.is_cleared
    db.commit()
    return {"id": line.id, "is_cleared": line.is_cleared}


MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024


@router.post("/{entry_id}/attachments", response_model=schemas.AttachmentOut)
def add_attachment(entry_id: int, payload: schemas.AttachmentIn, db: Session = Depends(get_db)):
    entry = db.query(models.JournalEntry).get(entry_id)
    if not entry:
        raise HTTPException(404, "Journal entry not found")
    if len(payload.data) > MAX_ATTACHMENT_BYTES * 4 // 3:  # base64 overhead
        raise HTTPException(400, "Attachment is too large (max 8MB)")
    attachment = models.Attachment(
        journal_entry_id=entry_id,
        filename=payload.filename,
        mime_type=payload.mime_type,
        data=payload.data,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


@router.delete("/attachments/{attachment_id}")
def delete_attachment(attachment_id: int, db: Session = Depends(get_db)):
    attachment = db.query(models.Attachment).get(attachment_id)
    if not attachment:
        raise HTTPException(404, "Attachment not found")
    db.delete(attachment)
    db.commit()
    return {"ok": True}
