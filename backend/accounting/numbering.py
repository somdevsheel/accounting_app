"""Auto-numbering for vouchers and invoices/receipts.

Numbers are derived from the highest numeric suffix already used for a given
prefix (e.g. "JV-0004" -> next is "JV-0005"), not from a row count filtered by
the record's *current* type/doc_type. A plain count breaks the moment a
record's type can change after creation (editing a Journal Entry's Voucher
Type, for instance): the count of "Journal"-type rows and the highest JV-####
actually assigned drift apart, and a future entry collides with one already
in use, which fails with a UNIQUE constraint error at insert time. Keying off
the voucher_no string itself sidesteps that regardless of what the type field
says now.
"""
import re

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


def _next_number(existing_codes: list[str], prefix: str) -> str:
    max_n = 0
    pattern = re.compile(rf"^{re.escape(prefix)}-(\d+)$")
    for code in existing_codes:
        m = pattern.match(code or "")
        if m:
            max_n = max(max_n, int(m.group(1)))
    return f"{prefix}-{max_n + 1:04d}"


def next_voucher_no(db: Session, voucher_type: str) -> str:
    prefix = VOUCHER_PREFIX.get(voucher_type, "JV")
    existing = [
        row[0]
        for row in db.query(models.JournalEntry.voucher_no)
        .filter(models.JournalEntry.voucher_no.like(f"{prefix}-%"))
        .all()
    ]
    return _next_number(existing, prefix)


INVOICE_PREFIX = {
    "Invoice": "INV",
    "Receipt": "RCT",
    "Quote": "QT",
    "Purchase Order": "PO",
}


def next_invoice_no(db: Session, doc_type: str) -> str:
    prefix = INVOICE_PREFIX.get(doc_type, "INV")
    existing = [
        row[0]
        for row in db.query(models.Invoice.invoice_no)
        .filter(models.Invoice.invoice_no.like(f"{prefix}-%"))
        .all()
    ]
    return _next_number(existing, prefix)
