import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from accounting import bank_import, ledger, reports as reports_logic, tax as tax_logic
from accounting.numbering import next_voucher_no
from database import get_db

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _get_company(db: Session) -> models.Company:
    company = db.query(models.Company).first()
    if not company:
        raise HTTPException(400, "Company setup has not been completed yet")
    return company


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    kpis = reports_logic.dashboard_kpis(db)
    fy_start_month = _get_company(db).fy_start_month
    return {
        "kpis": kpis,
        "monthly_trend": reports_logic.monthly_trend(db, fy_start_month),
        "expense_breakdown": reports_logic.expense_breakdown(db),
        "asset_breakdown": reports_logic.asset_breakdown(db),
        "capital_split": reports_logic.capital_split_by_owner(db),
    }


@router.get("/trial-balance")
def trial_balance(as_of: datetime.date | None = None, db: Session = Depends(get_db)):
    return ledger.trial_balance(db, as_of)


@router.get("/general-ledger/{account_id}")
def general_ledger(
    account_id: int,
    as_of: datetime.date | None = None,
    start_date: datetime.date | None = None,
    db: Session = Depends(get_db),
):
    account = db.query(models.Account).get(account_id)
    if not account:
        raise HTTPException(404, "Account not found")
    rows = ledger.general_ledger(db, account, as_of, start_date)
    return {
        "account": {"id": account.id, "code": account.code, "name": account.name, "normal_balance": account.normal_balance},
        "lines": rows,
        "closing_balance": rows[-1]["running_balance"] if rows else 0.0,
    }


@router.get("/profit-loss")
def profit_loss(
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
    db: Session = Depends(get_db),
):
    return reports_logic.profit_and_loss(db, start_date, end_date)


@router.get("/balance-sheet")
def balance_sheet(as_of: datetime.date | None = None, db: Session = Depends(get_db)):
    return reports_logic.balance_sheet(db, as_of)


@router.get("/cash-flow")
def cash_flow(
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
    db: Session = Depends(get_db),
):
    return reports_logic.cash_flow_statement(db, start_date, end_date)


@router.get("/ratios")
def ratios(as_of: datetime.date | None = None, db: Session = Depends(get_db)):
    return {"ratios": reports_logic.financial_ratios(db, as_of), "health": reports_logic.financial_health_score(db, as_of)}


@router.get("/tax-register")
def tax_register(granularity: str = "monthly", db: Session = Depends(get_db)):
    company = _get_company(db)
    return tax_logic.tax_register(db, company, granularity)


def _register(db: Session, voucher_type: str, start_date=None, end_date=None):
    company = _get_company(db)
    q = db.query(models.JournalEntry).filter(
        models.JournalEntry.voucher_type == voucher_type,
        models.JournalEntry.is_void.is_(False),
    )
    if start_date:
        q = q.filter(models.JournalEntry.date >= start_date)
    if end_date:
        q = q.filter(models.JournalEntry.date <= end_date)
    entries = q.order_by(models.JournalEntry.date.desc()).all()
    tax_account_names = {f"{company.tax_name} Payable", f"{company.tax_name} Input Credit"}
    rows = []
    for entry in entries:
        total = round(sum(l.debit_amount for l in entry.lines), 2)
        tax_amount = 0.0
        for l in entry.lines:
            if l.tax_rate_id is not None or (l.account and l.account.name in tax_account_names):
                tax_amount += max(l.debit_amount, l.credit_amount)
        tax_amount = round(tax_amount, 2)
        net = round(total - tax_amount, 2)
        rows.append(
            {
                "id": entry.id,
                "voucher_no": entry.voucher_no,
                "date": entry.date,
                "party_name": entry.party_name,
                "narration": entry.narration,
                "net": net,
                "tax": tax_amount,
                "total": total,
                "payment_status": entry.payment_status,
                "payment_mode": entry.payment_mode,
            }
        )
    return {
        "rows": rows,
        "total_net": round(sum(r["net"] for r in rows), 2),
        "total_tax": round(sum(r["tax"] for r in rows), 2),
        "total_gross": round(sum(r["total"] for r in rows), 2),
    }


@router.get("/sales-register")
def sales_register(
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
    db: Session = Depends(get_db),
):
    return _register(db, "Sales", start_date, end_date)


@router.get("/purchase-register")
def purchase_register(
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
    db: Session = Depends(get_db),
):
    return _register(db, "Purchase", start_date, end_date)


@router.get("/expense-register")
def expense_register(
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
    db: Session = Depends(get_db),
):
    q = (
        db.query(models.JournalLine)
        .join(models.JournalEntry)
        .join(models.Account)
        .filter(models.Account.type == "Expense", models.JournalEntry.is_void.is_(False))
    )
    if start_date:
        q = q.filter(models.JournalEntry.date >= start_date)
    if end_date:
        q = q.filter(models.JournalEntry.date <= end_date)
    rows = []
    for line in q.order_by(models.JournalEntry.date.desc()).all():
        rows.append(
            {
                "date": line.journal_entry.date,
                "voucher_no": line.journal_entry.voucher_no,
                "account_name": line.account.name,
                "description": line.description or line.journal_entry.narration,
                "amount": round(line.debit_amount - line.credit_amount, 2),
            }
        )
    return {"rows": rows, "total": round(sum(r["amount"] for r in rows), 2)}


def _cash_or_bank_book(db: Session, account_name: str, start_date=None, end_date=None):
    account = db.query(models.Account).filter(models.Account.name == account_name).first()
    if not account:
        return {"account": None, "lines": [], "closing_balance": 0.0}
    rows = ledger.general_ledger(db, account, end_date, start_date)
    return {
        "account": {"id": account.id, "name": account.name},
        "lines": rows,
        "closing_balance": rows[-1]["running_balance"] if rows else 0.0,
    }


@router.get("/cash-book")
def cash_book(
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
    db: Session = Depends(get_db),
):
    return _cash_or_bank_book(db, "Cash", start_date, end_date)


@router.get("/bank-book")
def bank_book(
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
    db: Session = Depends(get_db),
):
    return _cash_or_bank_book(db, "Bank", start_date, end_date)


@router.get("/capital-accounts")
def capital_accounts(db: Session = Depends(get_db)):
    company = _get_company(db)
    net_profit, _, _ = reports_logic.net_profit(db)
    owners = db.query(models.Owner).filter(models.Owner.is_active.is_(True)).all()

    drawings_account = db.query(models.Account).filter(models.Account.name == "Owner Drawings").first()

    label = "Owner's Equity"
    if company.legal_structure in ("Partnership", "LLP"):
        label = "Partner Capital Accounts"
    elif company.legal_structure in ("Private Limited", "Corporation"):
        label = "Shareholder Equity"

    rows = []
    for owner in owners:
        acc = db.query(models.Account).get(owner.capital_account_id) if owner.capital_account_id else None
        introduced, drawings, ledger_balance = 0.0, 0.0, 0.0
        if acc:
            debit_total, credit_total = ledger.account_raw_totals(db, acc)
            introduced = round(credit_total, 2)
            drawings = round(debit_total, 2)
            ledger_balance = ledger.signed_balance(acc.normal_balance, debit_total, credit_total)
        shared_drawings = 0.0
        if drawings_account:
            debit_total, _ = ledger.account_raw_totals(db, drawings_account)
            shared_drawings = round(debit_total * (owner.share_percent / 100.0), 2)
        profit_allocation = round(net_profit * (owner.share_percent / 100.0), 2)
        rows.append(
            {
                "owner_id": owner.id,
                "name": owner.name,
                "role": owner.role,
                "share_percent": owner.share_percent,
                "capital_introduced": introduced,
                "drawings": round(drawings + shared_drawings, 2),
                "profit_allocation": profit_allocation,
                "ledger_balance": round(ledger_balance, 2),
                "closing_balance_with_profit": round(ledger_balance + profit_allocation, 2),
            }
        )
    return {"label": label, "rows": rows, "company_net_profit": net_profit}


@router.get("/capital-contributions")
def capital_contributions(db: Session = Depends(get_db)):
    owners = db.query(models.Owner).all()
    owner_account_ids = {o.capital_account_id: o.name for o in owners if o.capital_account_id}
    if not owner_account_ids:
        return {"rows": []}
    lines = (
        db.query(models.JournalLine)
        .join(models.JournalEntry)
        .filter(
            models.JournalLine.account_id.in_(owner_account_ids.keys()),
            models.JournalLine.credit_amount > 0,
            models.JournalEntry.is_void.is_(False),
        )
        .order_by(models.JournalEntry.date.desc())
        .all()
    )
    rows = [
        {
            "date": l.journal_entry.date,
            "voucher_no": l.journal_entry.voucher_no,
            "owner_name": owner_account_ids.get(l.account_id),
            "amount": l.credit_amount,
            "narration": l.journal_entry.narration,
        }
        for l in lines
    ]
    return {"rows": rows, "total": round(sum(r["amount"] for r in rows), 2)}


@router.get("/monthly-trend")
def monthly_trend(months_back: int = 12, db: Session = Depends(get_db)):
    company = _get_company(db)
    return reports_logic.monthly_trend(db, company.fy_start_month, months_back)


@router.get("/bank-reconciliation/{account_id}")
def bank_reconciliation_preview(
    account_id: int,
    statement_balance: float,
    statement_date: datetime.date,
    db: Session = Depends(get_db),
):
    account = db.query(models.Account).get(account_id)
    if not account:
        raise HTTPException(404, "Account not found")
    rows = ledger.general_ledger(db, account, as_of=statement_date)
    book_balance = rows[-1]["running_balance"] if rows else 0.0
    uncleared = [r for r in rows if not r["is_cleared"]]
    outstanding_deposits = round(sum(r["debit_amount"] for r in uncleared), 2)
    outstanding_withdrawals = round(sum(r["credit_amount"] for r in uncleared), 2)
    adjusted_statement_balance = round(statement_balance + outstanding_deposits - outstanding_withdrawals, 2)
    difference = round(book_balance - adjusted_statement_balance, 2)
    return {
        "account": {"id": account.id, "name": account.name},
        "book_balance": round(book_balance, 2),
        "statement_balance": statement_balance,
        "outstanding_deposits": outstanding_deposits,
        "outstanding_withdrawals": outstanding_withdrawals,
        "adjusted_statement_balance": adjusted_statement_balance,
        "difference": difference,
        "is_reconciled": abs(difference) < 0.01,
        "lines": rows,
    }


@router.post("/bank-reconciliation", response_model=schemas.BankReconciliationOut)
def save_bank_reconciliation(payload: schemas.BankReconciliationIn, db: Session = Depends(get_db)):
    account = db.query(models.Account).get(payload.account_id)
    if not account:
        raise HTTPException(404, "Account not found")
    rows = ledger.general_ledger(db, account, as_of=payload.statement_date)
    book_balance = rows[-1]["running_balance"] if rows else 0.0
    difference = round(book_balance - payload.statement_balance, 2)
    rec = models.BankReconciliation(
        account_id=payload.account_id,
        statement_date=payload.statement_date,
        statement_balance=payload.statement_balance,
        book_balance=round(book_balance, 2),
        difference=difference,
        notes=payload.notes,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.get("/bank-reconciliation-history", response_model=list[schemas.BankReconciliationOut])
def bank_reconciliation_history(account_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(models.BankReconciliation)
    if account_id:
        q = q.filter(models.BankReconciliation.account_id == account_id)
    return q.order_by(models.BankReconciliation.statement_date.desc()).all()


@router.post("/bank-statement/parse")
def parse_bank_statement(payload: schemas.BankStatementParseIn, db: Session = Depends(get_db)):
    account = db.query(models.Account).get(payload.account_id)
    if not account:
        raise HTTPException(404, "Account not found")
    try:
        rows = bank_import.parse_statement(payload.filename, payload.content)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not rows:
        return {"rows": [], "matched_count": 0, "unmatched_count": 0}

    unreconciled = (
        db.query(models.JournalLine)
        .join(models.JournalEntry)
        .filter(
            models.JournalLine.account_id == payload.account_id,
            models.JournalLine.is_cleared.is_(False),
            models.JournalEntry.is_void.is_(False),
        )
        .all()
    )
    candidates = [
        (l.id, l.journal_entry.date, round(l.debit_amount - l.credit_amount, 2))
        for l in unreconciled
    ]
    matched = bank_import.match_rows(candidates, rows)
    matched_count = sum(1 for r in matched if r["matched_line_id"] is not None)
    return {
        "rows": matched,
        "matched_count": matched_count,
        "unmatched_count": len(matched) - matched_count,
    }


@router.post("/bank-statement/clear-matched")
def clear_matched(payload: schemas.BankStatementClearIn, db: Session = Depends(get_db)):
    count = 0
    for line_id in payload.line_ids:
        line = db.query(models.JournalLine).get(line_id)
        if line and not line.is_cleared:
            line.is_cleared = True
            count += 1
    db.commit()
    return {"cleared": count}


@router.post("/bank-statement/create-entries")
def create_entries_from_statement(payload: schemas.BankStatementCreateEntriesIn, db: Session = Depends(get_db)):
    offset_account = db.query(models.Account).get(payload.offset_account_id)
    if not offset_account:
        raise HTTPException(404, "Offset account not found")
    created = []
    for row in payload.rows:
        amount = round(float(row["amount"]), 2)
        if amount == 0:
            continue
        row_date = datetime.date.fromisoformat(row["date"]) if isinstance(row["date"], str) else row["date"]
        voucher_no = next_voucher_no(db, "Bank Import")
        entry = models.JournalEntry(
            voucher_no=voucher_no,
            voucher_type="Bank Import",
            date=row_date,
            narration=row.get("description") or "Imported from bank statement",
            payment_status="Paid",
        )
        db.add(entry)
        db.flush()
        # amount > 0 = money in (Dr Bank, Cr offset); amount < 0 = money out (Dr offset, Cr Bank)
        db.add(models.JournalLine(
            journal_entry_id=entry.id, account_id=payload.account_id,
            debit_amount=max(amount, 0), credit_amount=max(-amount, 0), is_cleared=True,
        ))
        db.add(models.JournalLine(
            journal_entry_id=entry.id, account_id=payload.offset_account_id,
            debit_amount=max(-amount, 0), credit_amount=max(amount, 0),
        ))
        created.append(voucher_no)
    db.commit()
    return {"created": created, "count": len(created)}
