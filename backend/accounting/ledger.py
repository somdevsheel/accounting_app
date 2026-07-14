"""Core double-entry ledger primitives: account balances, trial balance, general ledger."""
import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

import models


def signed_balance(normal_balance: str, total_debit: float, total_credit: float) -> float:
    if normal_balance == "Debit":
        return round(total_debit - total_credit, 2)
    return round(total_credit - total_debit, 2)


def _base_query(db: Session, as_of: Optional[datetime.date] = None):
    q = (
        db.query(models.JournalLine)
        .join(models.JournalEntry)
        .filter(models.JournalEntry.is_void.is_(False))
    )
    if as_of is not None:
        q = q.filter(models.JournalEntry.date <= as_of)
    return q


def account_raw_totals(db: Session, account: models.Account, as_of=None):
    q = _base_query(db, as_of).filter(models.JournalLine.account_id == account.id)
    total_debit = 0.0
    total_credit = 0.0
    for line in q.all():
        total_debit += line.debit_amount
        total_credit += line.credit_amount
    return round(total_debit, 2), round(total_credit, 2)


def account_balance(db: Session, account: models.Account, as_of=None) -> float:
    total_debit, total_credit = account_raw_totals(db, account, as_of)
    return signed_balance(account.normal_balance, total_debit, total_credit)


def accounts_balance_map(db: Session, as_of=None, account_type: Optional[str] = None):
    """Return {account: signed_balance} for all accounts (optionally filtered by type)."""
    q = db.query(models.Account)
    if account_type:
        q = q.filter(models.Account.type == account_type)
    accounts = q.all()
    result = {}
    for acc in accounts:
        result[acc] = account_balance(db, acc, as_of)
    return result


def trial_balance(db: Session, as_of=None):
    accounts = db.query(models.Account).order_by(models.Account.code).all()
    rows = []
    total_debit_col = 0.0
    total_credit_col = 0.0
    for acc in accounts:
        total_debit, total_credit = account_raw_totals(db, acc, as_of)
        if total_debit == 0 and total_credit == 0:
            continue
        net = round(total_debit - total_credit, 2)
        debit_col = net if net > 0 else 0.0
        credit_col = -net if net < 0 else 0.0
        total_debit_col += debit_col
        total_credit_col += credit_col
        rows.append(
            {
                "account_id": acc.id,
                "code": acc.code,
                "name": acc.name,
                "type": acc.type,
                "total_debit": total_debit,
                "total_credit": total_credit,
                "debit_balance": round(debit_col, 2),
                "credit_balance": round(credit_col, 2),
            }
        )
    return {
        "rows": rows,
        "total_debit": round(total_debit_col, 2),
        "total_credit": round(total_credit_col, 2),
        "is_balanced": abs(total_debit_col - total_credit_col) < 0.01,
    }


def general_ledger(db: Session, account: models.Account, as_of=None, start_date=None):
    q = _base_query(db, as_of).filter(models.JournalLine.account_id == account.id)
    if start_date is not None:
        q = q.filter(models.JournalEntry.date >= start_date)
    q = q.order_by(models.JournalEntry.date, models.JournalEntry.id)
    running = 0.0
    rows = []
    for line in q.all():
        entry = line.journal_entry
        if account.normal_balance == "Debit":
            running += line.debit_amount - line.credit_amount
        else:
            running += line.credit_amount - line.debit_amount
        other_accounts = [
            l.account.name for l in entry.lines if l.account_id != account.id
        ]
        rows.append(
            {
                "date": entry.date,
                "voucher_no": entry.voucher_no,
                "voucher_type": entry.voucher_type,
                "narration": entry.narration,
                "particulars": ", ".join(other_accounts) if other_accounts else "-",
                "debit_amount": line.debit_amount,
                "credit_amount": line.credit_amount,
                "running_balance": round(running, 2),
                "is_cleared": line.is_cleared,
                "journal_entry_id": entry.id,
                "line_id": line.id,
            }
        )
    return rows
