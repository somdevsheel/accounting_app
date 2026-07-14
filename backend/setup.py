"""First-run setup wizard logic: default Chart of Accounts template + applying the wizard payload."""
from sqlalchemy.orm import Session

import models
import schemas


def default_chart_of_accounts(tax_name: str = "GST"):
    """Generic default CoA template. Returns list of dicts (code/name/type/category/normal_balance)."""
    accounts = []

    def add(code, name, type_, category, normal_balance):
        accounts.append(
            {
                "code": code,
                "name": name,
                "type": type_,
                "category": category,
                "normal_balance": normal_balance,
            }
        )

    # Assets - Current
    add("1001", "Cash", "Asset", "Current Asset", "Debit")
    add("1002", "Bank", "Asset", "Current Asset", "Debit")
    add("1003", "Accounts Receivable", "Asset", "Current Asset", "Debit")
    add("1004", "Security Deposits", "Asset", "Current Asset", "Debit")
    add("1005", f"{tax_name} Input Credit", "Asset", "Current Asset", "Debit")

    # Assets - Fixed
    add("1101", "Equipment", "Asset", "Fixed Asset", "Debit")
    add("1102", "Furniture & Fixtures", "Asset", "Fixed Asset", "Debit")
    add("1103", "Computers & Software", "Asset", "Fixed Asset", "Debit")
    add("1104", "Vehicles", "Asset", "Fixed Asset", "Debit")
    add("1105", "Accumulated Depreciation", "Asset", "Fixed Asset", "Credit")

    # Liabilities - Current
    add("2001", "Accounts Payable", "Liability", "Current Liability", "Credit")
    add("2002", f"{tax_name} Payable", "Liability", "Current Liability", "Credit")
    add("2003", "TDS/Withholding Payable", "Liability", "Current Liability", "Credit")
    add("2004", "Accrued Expenses", "Liability", "Current Liability", "Credit")

    # Liabilities - Long Term
    add("2101", "Loans Payable", "Liability", "Long Term Liability", "Credit")

    # Capital
    add("3001", "Retained Earnings", "Capital", "Capital", "Credit")
    add("3002", "Owner Drawings", "Capital", "Capital", "Debit")

    # Income
    add("4001", "Service Revenue", "Income", "Income", "Credit")
    add("4002", "Product Sales", "Income", "Income", "Credit")
    add("4003", "Other Income", "Income", "Income", "Credit")
    add("4004", "Interest Income", "Income", "Income", "Credit")

    # Expenses
    add("5001", "Rent", "Expense", "Expense", "Debit")
    add("5002", "Utilities", "Expense", "Expense", "Debit")
    add("5003", "Salaries & Wages", "Expense", "Expense", "Debit")
    add("5004", "Marketing", "Expense", "Expense", "Debit")
    add("5005", "Professional Fees", "Expense", "Expense", "Debit")
    add("5006", "Software & Subscriptions", "Expense", "Expense", "Debit")
    add("5007", "Travel", "Expense", "Expense", "Debit")
    add("5008", "Office Supplies", "Expense", "Expense", "Debit")
    add("5009", "Depreciation", "Expense", "Expense", "Debit")
    add("5010", "Taxes", "Expense", "Expense", "Debit")
    add("5011", "Bank Charges", "Expense", "Expense", "Debit")
    add("5012", "Miscellaneous", "Expense", "Expense", "Debit")

    return accounts


DEFAULT_TAX_RATES = [0, 5, 12, 18, 28]

DEFAULT_FY_START_BY_COUNTRY = {
    "India": 4,
    "United Kingdom": 4,
    "Australia": 7,
    "New Zealand": 4,
    "Canada": 1,
    "United States": 1,
    "Japan": 4,
}


def is_setup_complete(db: Session) -> bool:
    company = db.query(models.Company).first()
    return bool(company and company.setup_complete)


def _next_account_code(db: Session, prefix_start: int = 3100) -> str:
    existing_codes = [
        int(a.code) for a in db.query(models.Account).all() if a.code.isdigit()
    ]
    candidate = prefix_start
    existing_set = set(existing_codes)
    while candidate in existing_set:
        candidate += 1
    return str(candidate)


def apply_setup(db: Session, payload: schemas.SetupWizardIn) -> models.Company:
    company = db.query(models.Company).first()
    if company is None:
        company = models.Company(id=1)
        db.add(company)

    profile = payload.profile
    company.name = profile.name
    company.legal_structure = profile.legal_structure
    company.country = profile.country
    company.currency_symbol = profile.currency_symbol
    company.currency_code = profile.currency_code
    company.fy_start_month = profile.fy_start_month
    company.registration_no = profile.registration_no
    company.tax_id = profile.tax_id
    company.tax_name = payload.tax_name
    company.setup_complete = True
    db.flush()

    # Tax rates
    for rate_in in payload.tax_rates:
        db.add(models.TaxRate(rate=rate_in.rate, label=rate_in.label, is_active=True))

    # Chart of accounts
    account_objs = []
    for acc_in in payload.accounts:
        code = acc_in.code or _next_account_code(db)
        acc = models.Account(
            code=code,
            name=acc_in.name,
            type=acc_in.type,
            category=acc_in.category,
            normal_balance=acc_in.normal_balance,
            is_active=True,
            is_system=True,
        )
        db.add(acc)
        account_objs.append(acc)
    db.flush()

    # Owners + auto-created capital accounts
    for owner_in in payload.owners:
        capital_code = _next_account_code(db)
        capital_account = models.Account(
            code=capital_code,
            name=f"{owner_in.name} Capital",
            type="Capital",
            category="Capital",
            normal_balance="Credit",
            is_active=True,
            is_system=True,
        )
        db.add(capital_account)
        db.flush()
        owner = models.Owner(
            name=owner_in.name,
            role=owner_in.role,
            share_percent=owner_in.share_percent,
            capital_account_id=capital_account.id,
            is_active=True,
        )
        db.add(owner)

    db.commit()
    db.refresh(company)
    return company
