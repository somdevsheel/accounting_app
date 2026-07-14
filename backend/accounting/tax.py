"""Tax Register: output tax (sales) vs input tax (purchases), by period."""
from sqlalchemy.orm import Session

import models
from accounting.fy import period_key


def tax_register(db: Session, company, granularity: str = "monthly"):
    tax_name = company.tax_name
    payable_account = (
        db.query(models.Account).filter(models.Account.name == f"{tax_name} Payable").first()
    )
    input_credit_account = (
        db.query(models.Account)
        .filter(models.Account.name == f"{tax_name} Input Credit")
        .first()
    )

    buckets = {}

    def add(account, field, sign_attr):
        if not account:
            return
        lines = (
            db.query(models.JournalLine)
            .join(models.JournalEntry)
            .filter(
                models.JournalLine.account_id == account.id,
                models.JournalEntry.is_void.is_(False),
            )
            .all()
        )
        for line in lines:
            entry = line.journal_entry
            key = period_key(entry.date, company.fy_start_month, granularity)
            buckets.setdefault(key, {"period": key, "output_tax": 0.0, "input_tax": 0.0})
            amount = getattr(line, sign_attr)
            buckets[key][field] += amount

    add(payable_account, "output_tax", "credit_amount")
    add(input_credit_account, "input_tax", "debit_amount")

    rows = []
    for key in sorted(buckets.keys()):
        b = buckets[key]
        output_tax = round(b["output_tax"], 2)
        input_tax = round(b["input_tax"], 2)
        rows.append(
            {
                "period": key,
                "output_tax": output_tax,
                "input_tax": input_tax,
                "net_payable": round(output_tax - input_tax, 2),
            }
        )
    total_output = round(sum(r["output_tax"] for r in rows), 2)
    total_input = round(sum(r["input_tax"] for r in rows), 2)
    return {
        "tax_name": tax_name,
        "rows": rows,
        "total_output_tax": total_output,
        "total_input_tax": total_input,
        "net_payable": round(total_output - total_input, 2),
    }
