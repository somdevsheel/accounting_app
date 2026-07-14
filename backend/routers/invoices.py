from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from accounting.numbering import next_invoice_no
from database import get_db

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


def _serialize(invoice: models.Invoice) -> dict:
    return {
        "id": invoice.id,
        "invoice_no": invoice.invoice_no,
        "doc_type": invoice.doc_type,
        "journal_entry_id": invoice.journal_entry_id,
        "customer_id": invoice.customer_id,
        "vendor_id": invoice.vendor_id,
        "date": invoice.date,
        "due_date": invoice.due_date,
        "subtotal": invoice.subtotal,
        "tax_amount": invoice.tax_amount,
        "total": invoice.total,
        "notes": invoice.notes,
        "status": invoice.status,
        "converted_invoice_id": invoice.converted_invoice_id,
        "customer_name": invoice.customer.name if invoice.customer else None,
        "vendor_name": invoice.vendor.name if invoice.vendor else None,
        "items": [
            {
                "id": item.id,
                "item_id": item.item_id,
                "description": item.description,
                "quantity": item.quantity,
                "rate": item.rate,
                "tax_rate_percent": item.tax_rate_percent,
                "amount": item.amount,
            }
            for item in invoice.items
        ],
    }


@router.get("")
def list_invoices(doc_type: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Invoice)
    if doc_type:
        q = q.filter(models.Invoice.doc_type == doc_type)
    invoices = q.order_by(models.Invoice.date.desc(), models.Invoice.id.desc()).all()
    return [_serialize(i) for i in invoices]


@router.get("/{invoice_id}")
def get_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.query(models.Invoice).get(invoice_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    return _serialize(invoice)


@router.post("")
def create_invoice(payload: schemas.InvoiceIn, db: Session = Depends(get_db)):
    invoice_no = next_invoice_no(db, payload.doc_type)
    items_data = payload.model_dump(exclude={"items"})
    invoice = models.Invoice(**items_data, invoice_no=invoice_no)
    db.add(invoice)
    db.flush()

    subtotal = 0.0
    tax_amount = 0.0
    for item_in in payload.items:
        line_amount = round(item_in.quantity * item_in.rate, 2)
        line_tax = round(line_amount * item_in.tax_rate_percent / 100.0, 2)
        subtotal += line_amount
        tax_amount += line_tax
        db.add(
            models.InvoiceItem(
                invoice_id=invoice.id,
                item_id=item_in.item_id,
                description=item_in.description,
                quantity=item_in.quantity,
                rate=item_in.rate,
                tax_rate_percent=item_in.tax_rate_percent,
                amount=line_amount,
            )
        )
        # Selling a stock-tracked item on an Invoice deducts it from stock automatically.
        if item_in.item_id and payload.doc_type == "Invoice":
            stock_item = db.query(models.Item).get(item_in.item_id)
            if stock_item and stock_item.is_stock_tracked:
                db.add(
                    models.StockMovement(
                        item_id=item_in.item_id,
                        date=payload.date,
                        movement_type="Sale",
                        quantity=-abs(item_in.quantity),
                        unit_cost=stock_item.purchase_price,
                        reference=invoice_no,
                    )
                )
    invoice.subtotal = round(subtotal, 2)
    invoice.tax_amount = round(tax_amount, 2)
    invoice.total = round(subtotal + tax_amount, 2)
    db.commit()
    db.refresh(invoice)
    return _serialize(invoice)


@router.post("/from-journal-entry/{entry_id}")
def generate_from_journal_entry(entry_id: int, doc_type: str = "Invoice", db: Session = Depends(get_db)):
    entry = db.query(models.JournalEntry).get(entry_id)
    if not entry:
        raise HTTPException(404, "Journal entry not found")
    company = db.query(models.Company).first()
    tax_account_names = {f"{company.tax_name} Payable", f"{company.tax_name} Input Credit"}
    gross_account_names = {"Accounts Receivable", "Accounts Payable", "Cash", "Bank"}

    item_lines = [
        l for l in entry.lines
        if l.account.name not in tax_account_names and l.account.name not in gross_account_names
    ]
    tax_lines = [l for l in entry.lines if l.account.name in tax_account_names]

    invoice_no = next_invoice_no(db, doc_type)
    invoice = models.Invoice(
        invoice_no=invoice_no,
        doc_type=doc_type,
        journal_entry_id=entry.id,
        customer_id=entry.customer_id,
        vendor_id=entry.vendor_id,
        date=entry.date,
        status=entry.payment_status,
        notes=entry.narration,
    )
    db.add(invoice)
    db.flush()

    subtotal = 0.0
    for l in item_lines:
        amount = round(max(l.debit_amount, l.credit_amount), 2)
        subtotal += amount
        db.add(
            models.InvoiceItem(
                invoice_id=invoice.id,
                description=l.description or l.account.name,
                quantity=1,
                rate=amount,
                tax_rate_percent=0,
                amount=amount,
            )
        )
    tax_amount = round(sum(max(l.debit_amount, l.credit_amount) for l in tax_lines), 2)
    invoice.subtotal = round(subtotal, 2)
    invoice.tax_amount = tax_amount
    invoice.total = round(subtotal + tax_amount, 2)
    db.commit()
    db.refresh(invoice)
    return _serialize(invoice)


@router.post("/{quote_id}/convert-to-invoice")
def convert_quote_to_invoice(quote_id: int, db: Session = Depends(get_db)):
    quote = db.query(models.Invoice).get(quote_id)
    if not quote:
        raise HTTPException(404, "Quote not found")
    if quote.doc_type != "Quote":
        raise HTTPException(400, "Only a Quote can be converted to an Invoice")
    if quote.converted_invoice_id:
        raise HTTPException(400, "This quote has already been converted")

    invoice_no = next_invoice_no(db, "Invoice")
    invoice = models.Invoice(
        invoice_no=invoice_no,
        doc_type="Invoice",
        customer_id=quote.customer_id,
        date=quote.date,
        notes=quote.notes,
        status="Unpaid",
        subtotal=quote.subtotal,
        tax_amount=quote.tax_amount,
        total=quote.total,
    )
    db.add(invoice)
    db.flush()
    for item in quote.items:
        db.add(
            models.InvoiceItem(
                invoice_id=invoice.id,
                description=item.description,
                quantity=item.quantity,
                rate=item.rate,
                tax_rate_percent=item.tax_rate_percent,
                amount=item.amount,
            )
        )
    quote.status = "Converted"
    quote.converted_invoice_id = invoice.id
    db.commit()
    db.refresh(invoice)
    return _serialize(invoice)


@router.put("/{invoice_id}")
def update_invoice_status(invoice_id: int, status: str, db: Session = Depends(get_db)):
    invoice = db.query(models.Invoice).get(invoice_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    invoice.status = status
    db.commit()
    return _serialize(invoice)


@router.delete("/{invoice_id}")
def delete_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.query(models.Invoice).get(invoice_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    db.delete(invoice)
    db.commit()
    return {"ok": True}
