"""Higher level reports: P&L, Balance Sheet, Cash Flow, Ratios, Dashboard KPIs."""
import datetime
from typing import Optional

from sqlalchemy.orm import Session

import models
from accounting import ledger
from accounting.fy import period_key


def _clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))


def net_profit(db: Session, start_date=None, end_date=None):
    income_accounts = db.query(models.Account).filter(models.Account.type == "Income").all()
    expense_accounts = db.query(models.Account).filter(models.Account.type == "Expense").all()

    def period_total(accounts):
        total = 0.0
        for acc in accounts:
            debit_end, credit_end = ledger.account_raw_totals(db, acc, end_date)
            bal_end = ledger.signed_balance(acc.normal_balance, debit_end, credit_end)
            if start_date:
                start_before = start_date - datetime.timedelta(days=1)
                debit_start, credit_start = ledger.account_raw_totals(db, acc, start_before)
                bal_start = ledger.signed_balance(acc.normal_balance, debit_start, credit_start)
                total += bal_end - bal_start
            else:
                total += bal_end
        return round(total, 2)

    income = period_total(income_accounts)
    expense = period_total(expense_accounts)
    return round(income - expense, 2), income, expense


def profit_and_loss(db: Session, start_date=None, end_date=None):
    income_accounts = db.query(models.Account).filter(models.Account.type == "Income").order_by(models.Account.code).all()
    expense_accounts = db.query(models.Account).filter(models.Account.type == "Expense").order_by(models.Account.code).all()

    def line_items(accounts):
        items = []
        for acc in accounts:
            debit_end, credit_end = ledger.account_raw_totals(db, acc, end_date)
            bal_end = ledger.signed_balance(acc.normal_balance, debit_end, credit_end)
            if start_date:
                start_before = start_date - datetime.timedelta(days=1)
                debit_start, credit_start = ledger.account_raw_totals(db, acc, start_before)
                bal_start = ledger.signed_balance(acc.normal_balance, debit_start, credit_start)
                amount = bal_end - bal_start
            else:
                amount = bal_end
            if abs(amount) > 0.001:
                items.append({"account_id": acc.id, "code": acc.code, "name": acc.name, "amount": round(amount, 2)})
        return items

    income_items = line_items(income_accounts)
    expense_items = line_items(expense_accounts)
    total_income = round(sum(i["amount"] for i in income_items), 2)
    total_expense = round(sum(i["amount"] for i in expense_items), 2)
    return {
        "income": income_items,
        "expenses": expense_items,
        "total_income": total_income,
        "total_expense": total_expense,
        "net_profit": round(total_income - total_expense, 2),
        "start_date": start_date,
        "end_date": end_date,
    }


def balance_sheet(db: Session, as_of=None):
    as_of = as_of or datetime.date.today()
    asset_accounts = db.query(models.Account).filter(models.Account.type == "Asset").order_by(models.Account.code).all()
    liability_accounts = db.query(models.Account).filter(models.Account.type == "Liability").order_by(models.Account.code).all()
    capital_accounts = db.query(models.Account).filter(models.Account.type == "Capital").order_by(models.Account.code).all()

    def bucket(accounts):
        items = []
        total = 0.0
        for acc in accounts:
            bal = ledger.account_balance(db, acc, as_of)
            if abs(bal) > 0.001:
                items.append({"account_id": acc.id, "code": acc.code, "name": acc.name, "category": acc.category, "amount": bal})
            total += bal
        return items, round(total, 2)

    assets, total_assets = bucket(asset_accounts)
    liabilities, total_liabilities = bucket(liability_accounts)
    capital_items, total_capital_accounts = bucket(capital_accounts)

    profit, _, _ = net_profit(db, start_date=None, end_date=as_of)
    total_capital = round(total_capital_accounts + profit, 2)

    return {
        "as_of": as_of,
        "assets": assets,
        "total_assets": total_assets,
        "liabilities": liabilities,
        "total_liabilities": total_liabilities,
        "capital": capital_items,
        "current_period_profit": profit,
        "total_capital": total_capital,
        "total_liabilities_and_capital": round(total_liabilities + total_capital, 2),
        "is_balanced": abs(total_assets - round(total_liabilities + total_capital, 2)) < 0.01,
    }


def cash_flow_statement(db: Session, start_date=None, end_date=None):
    cash_bank_accounts = (
        db.query(models.Account)
        .filter(models.Account.name.in_(["Cash", "Bank"]))
        .all()
    )
    cash_ids = {a.id for a in cash_bank_accounts}
    q = (
        db.query(models.JournalEntry)
        .filter(models.JournalEntry.is_void.is_(False))
    )
    if start_date:
        q = q.filter(models.JournalEntry.date >= start_date)
    if end_date:
        q = q.filter(models.JournalEntry.date <= end_date)

    operating, investing, financing = 0.0, 0.0, 0.0
    for entry in q.all():
        cash_lines = [l for l in entry.lines if l.account_id in cash_ids]
        if not cash_lines:
            continue
        other_lines = [l for l in entry.lines if l.account_id not in cash_ids]
        cash_delta = sum(l.debit_amount - l.credit_amount for l in cash_lines)
        if abs(cash_delta) < 0.001:
            continue
        category = "operating"
        for l in other_lines:
            if l.account.category == "Fixed Asset":
                category = "investing"
                break
            if l.account.category == "Long Term Liability" or l.account.type == "Capital":
                category = "financing"
                break
        if category == "operating":
            operating += cash_delta
        elif category == "investing":
            investing += cash_delta
        else:
            financing += cash_delta

    net_change = round(operating + investing + financing, 2)
    closing_cash = 0.0
    for acc in cash_bank_accounts:
        closing_cash += ledger.account_balance(db, acc, end_date)

    return {
        "operating": round(operating, 2),
        "investing": round(investing, 2),
        "financing": round(financing, 2),
        "net_change_in_cash": net_change,
        "closing_cash_and_bank": round(closing_cash, 2),
        "reconciles": abs(net_change - round(closing_cash, 2)) < 0.01 if not start_date else True,
        "start_date": start_date,
        "end_date": end_date,
    }


def financial_ratios(db: Session, as_of=None):
    as_of = as_of or datetime.date.today()
    current_assets = sum(
        ledger.account_balance(db, a, as_of)
        for a in db.query(models.Account).filter(models.Account.category == "Current Asset").all()
    )
    inventory_like = sum(
        ledger.account_balance(db, a, as_of)
        for a in db.query(models.Account)
        .filter(models.Account.category == "Current Asset", models.Account.name.ilike("%inventory%"))
        .all()
    )
    current_liabilities = sum(
        ledger.account_balance(db, a, as_of)
        for a in db.query(models.Account).filter(models.Account.category == "Current Liability").all()
    )
    total_liabilities = sum(
        ledger.account_balance(db, a, as_of)
        for a in db.query(models.Account).filter(models.Account.type == "Liability").all()
    )
    total_assets = sum(
        ledger.account_balance(db, a, as_of)
        for a in db.query(models.Account).filter(models.Account.type == "Asset").all()
    )
    capital_accounts_total = sum(
        ledger.account_balance(db, a, as_of)
        for a in db.query(models.Account).filter(models.Account.type == "Capital").all()
    )
    profit, income, expense = net_profit(db, start_date=None, end_date=as_of)
    total_capital = capital_accounts_total + profit

    def safe_div(n, d):
        return round(n / d, 4) if d not in (0, 0.0) else None

    current_ratio = safe_div(current_assets, current_liabilities)
    quick_ratio = safe_div(current_assets - inventory_like, current_liabilities)
    working_capital = round(current_assets - current_liabilities, 2)
    debt_equity = safe_div(total_liabilities, total_capital)
    net_profit_margin = safe_div(profit, income)
    gross_margin = safe_div(income - expense, income)
    roa = safe_div(profit, total_assets)
    roe = safe_div(profit, total_capital)
    asset_turnover = safe_div(income, total_assets)

    ratios = [
        {"key": "current_ratio", "label": "Current Ratio", "value": current_ratio,
         "explanation": "How many times over current assets cover current liabilities; above 1 is generally healthy."},
        {"key": "quick_ratio", "label": "Quick Ratio", "value": quick_ratio,
         "explanation": "Like the current ratio but excludes inventory — a stricter test of short-term liquidity."},
        {"key": "working_capital", "label": "Working Capital", "value": working_capital, "is_currency": True,
         "explanation": "Current assets minus current liabilities — the cash cushion available for day-to-day operations."},
        {"key": "debt_equity", "label": "Debt-Equity Ratio", "value": debt_equity,
         "explanation": "Total liabilities divided by total capital — lower means less reliance on borrowed money."},
        {"key": "net_profit_margin", "label": "Net Profit Margin", "value": net_profit_margin, "is_percent": True,
         "explanation": "Net profit as a share of revenue — how much of every sale becomes profit."},
        {"key": "gross_margin", "label": "Gross Margin", "value": gross_margin, "is_percent": True,
         "explanation": "Revenue minus expenses as a share of revenue (add a Cost of Goods account to refine this)."},
        {"key": "roa", "label": "Return on Assets", "value": roa, "is_percent": True,
         "explanation": "Net profit as a share of total assets — how efficiently assets generate profit."},
        {"key": "roe", "label": "Return on Equity", "value": roe, "is_percent": True,
         "explanation": "Net profit as a share of owners' capital — the return earned on owners' investment."},
        {"key": "asset_turnover", "label": "Asset Turnover", "value": asset_turnover,
         "explanation": "Revenue generated per unit of total assets — higher means assets are used more efficiently."},
    ]
    return ratios


def financial_health_score(db: Session, as_of=None):
    as_of = as_of or datetime.date.today()
    current_assets = sum(
        ledger.account_balance(db, a, as_of)
        for a in db.query(models.Account).filter(models.Account.category == "Current Asset").all()
    )
    current_liabilities = sum(
        ledger.account_balance(db, a, as_of)
        for a in db.query(models.Account).filter(models.Account.category == "Current Liability").all()
    )
    total_liabilities = sum(
        ledger.account_balance(db, a, as_of)
        for a in db.query(models.Account).filter(models.Account.type == "Liability").all()
    )
    total_assets = sum(
        ledger.account_balance(db, a, as_of)
        for a in db.query(models.Account).filter(models.Account.type == "Asset").all()
    )
    capital_accounts_total = sum(
        ledger.account_balance(db, a, as_of)
        for a in db.query(models.Account).filter(models.Account.type == "Capital").all()
    )
    profit, income, expense = net_profit(db, start_date=None, end_date=as_of)
    total_capital = capital_accounts_total + profit

    margin = (profit / income) if income else 0.0
    current_ratio = (current_assets / current_liabilities) if current_liabilities else (2.0 if current_assets > 0 else 0.0)
    debt_equity = (total_liabilities / total_capital) if total_capital else (1.0 if total_liabilities > 0 else 0.0)
    roa = (profit / total_assets) if total_assets else 0.0

    margin_score = _clamp(margin / 0.20) * 25
    current_ratio_score = _clamp(current_ratio / 2.0) * 25
    leverage_score = _clamp(1 - debt_equity) * 25
    roa_score = _clamp(roa / 0.15) * 25

    total = round(margin_score + current_ratio_score + leverage_score + roa_score, 1)
    return {
        "score": total,
        "components": {
            "net_profit_margin": round(margin_score, 1),
            "current_ratio": round(current_ratio_score, 1),
            "leverage": round(leverage_score, 1),
            "return_on_assets": round(roa_score, 1),
        },
    }


def dashboard_kpis(db: Session):
    as_of = datetime.date.today()
    bs = balance_sheet(db, as_of)
    profit, income, expense = net_profit(db)
    cash_acc = db.query(models.Account).filter(models.Account.name == "Cash").first()
    bank_acc = db.query(models.Account).filter(models.Account.name == "Bank").first()
    cash_bal = ledger.account_balance(db, cash_acc, as_of) if cash_acc else 0.0
    bank_bal = ledger.account_balance(db, bank_acc, as_of) if bank_acc else 0.0
    ratios = {r["key"]: r["value"] for r in financial_ratios(db, as_of)}
    health = financial_health_score(db, as_of)

    return {
        "total_assets": bs["total_assets"],
        "total_liabilities": bs["total_liabilities"],
        "total_capital": bs["total_capital"],
        "net_worth": round(bs["total_assets"] - bs["total_liabilities"], 2),
        "revenue": income,
        "expenses": expense,
        "net_profit": profit,
        "cash": round(cash_bal, 2),
        "bank": round(bank_bal, 2),
        "working_capital": ratios.get("working_capital"),
        "current_ratio": ratios.get("current_ratio"),
        "debt_equity_ratio": ratios.get("debt_equity"),
        "net_profit_margin": ratios.get("net_profit_margin"),
        "return_on_assets": ratios.get("roa"),
        "asset_turnover": ratios.get("asset_turnover"),
        "financial_health_score": health["score"],
        "financial_health_components": health["components"],
    }


def monthly_trend(db: Session, fy_start_month: int, months_back: int = 12):
    """Revenue/expense/profit grouped by calendar month for charting."""
    today = datetime.date.today()
    buckets = {}
    order = []
    for i in range(months_back - 1, -1, -1):
        year = today.year
        month = today.month - i
        while month <= 0:
            month += 12
            year -= 1
        key = f"{year}-{month:02d}"
        order.append(key)
        buckets[key] = {"income": 0.0, "expense": 0.0}

    entries = (
        db.query(models.JournalEntry)
        .filter(models.JournalEntry.is_void.is_(False))
        .all()
    )
    for entry in entries:
        key = entry.date.strftime("%Y-%m")
        if key not in buckets:
            continue
        for line in entry.lines:
            if line.account.type == "Income":
                buckets[key]["income"] += line.credit_amount - line.debit_amount
            elif line.account.type == "Expense":
                buckets[key]["expense"] += line.debit_amount - line.credit_amount

    result = []
    for key in order:
        income = round(buckets[key]["income"], 2)
        expense = round(buckets[key]["expense"], 2)
        result.append({"period": key, "income": income, "expense": expense, "profit": round(income - expense, 2)})
    return result


def expense_breakdown(db: Session):
    accounts = db.query(models.Account).filter(models.Account.type == "Expense").all()
    items = []
    for acc in accounts:
        bal = ledger.account_balance(db, acc)
        if bal > 0.001:
            items.append({"name": acc.name, "amount": round(bal, 2)})
    return sorted(items, key=lambda x: -x["amount"])


def asset_breakdown(db: Session):
    accounts = db.query(models.Account).filter(models.Account.type == "Asset").all()
    items = []
    for acc in accounts:
        bal = ledger.account_balance(db, acc)
        if bal > 0.001:
            items.append({"name": acc.name, "amount": round(bal, 2)})
    return sorted(items, key=lambda x: -x["amount"])


def capital_split_by_owner(db: Session):
    owners = db.query(models.Owner).filter(models.Owner.is_active.is_(True)).all()
    items = []
    for owner in owners:
        if not owner.capital_account_id:
            continue
        acc = db.query(models.Account).get(owner.capital_account_id)
        if not acc:
            continue
        bal = ledger.account_balance(db, acc)
        items.append({"name": owner.name, "amount": round(bal, 2)})
    return items
