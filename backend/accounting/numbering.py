"""Auto-numbering for vouchers and invoices/receipts."""
from sqlalchemy.orm import Session

import models

VOUCHER_PREFIX = {
    "Journal": "JV",
    "Receipt": "RV",
    "Payment": "PY",
    "Sales": "SV",
    "Purchase": "PU",
    "Contra": "CV",
    "Bank Import": "BI",
}


def next_voucher_no(db: Session, voucher_type: str) -> str:
    prefix = VOUCHER_PREFIX.get(voucher_type, "JV")
    count = (
        db.query(models.JournalEntry)
        .filter(models.JournalEntry.voucher_type == voucher_type)
        .count()
    )
    return f"{prefix}-{count + 1:04d}"


INVOICE_PREFIX = {
    "Invoice": "INV",
    "Receipt": "RCT",
    "Quote": "QT",
    "Purchase Order": "PO",
}


def next_invoice_no(db: Session, doc_type: str) -> str:
    prefix = INVOICE_PREFIX.get(doc_type, "INV")
    count = (
        db.query(models.Invoice).filter(models.Invoice.doc_type == doc_type).count()
    )
    return f"{prefix}-{count + 1:04d}"
