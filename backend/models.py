"""SQLAlchemy ORM models for the accounting app."""
import datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from database import Base


def utcnow():
    return datetime.datetime.utcnow()


class Company(Base):
    """Single-row table holding the company profile created by the setup wizard."""

    __tablename__ = "company"

    id = Column(Integer, primary_key=True, default=1)
    name = Column(String, nullable=False)
    legal_structure = Column(String, nullable=False, default="Sole Proprietorship")
    country = Column(String, nullable=True)
    currency_symbol = Column(String, nullable=False, default="$")
    currency_code = Column(String, nullable=False, default="USD")
    fy_start_month = Column(Integer, nullable=False, default=1)  # 1-12
    registration_no = Column(String, nullable=True)
    tax_id = Column(String, nullable=True)
    tax_name = Column(String, nullable=False, default="GST")
    logo_data = Column(Text, nullable=True)  # data: URI (base64), resized client-side before upload
    setup_complete = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class TaxRate(Base):
    __tablename__ = "tax_rates"

    id = Column(Integer, primary_key=True)
    rate = Column(Float, nullable=False)
    label = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)


class Owner(Base):
    __tablename__ = "owners"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    role = Column(String, nullable=True)
    share_percent = Column(Float, nullable=False, default=0.0)
    capital_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=utcnow)

    capital_account = relationship("Account", foreign_keys=[capital_account_id])


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True)
    code = Column(String, nullable=False, unique=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)  # Asset/Liability/Capital/Income/Expense
    category = Column(String, nullable=False)
    normal_balance = Column(String, nullable=False)  # Debit/Credit
    is_active = Column(Boolean, nullable=False, default=True)
    is_system = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=utcnow)

    lines = relationship("JournalLine", back_populates="account")


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id = Column(Integer, primary_key=True)
    voucher_no = Column(String, nullable=False, unique=True)
    voucher_type = Column(String, nullable=False, default="Journal")
    date = Column(Date, nullable=False)
    narration = Column(Text, nullable=True)
    reference = Column(String, nullable=True)
    party_name = Column(String, nullable=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=True)
    payment_mode = Column(String, nullable=True)
    payment_status = Column(String, nullable=False, default="Unpaid")
    is_void = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    lines = relationship(
        "JournalLine",
        back_populates="journal_entry",
        cascade="all, delete-orphan",
        order_by="JournalLine.id",
    )
    customer = relationship("Customer", foreign_keys=[customer_id])
    vendor = relationship("Vendor", foreign_keys=[vendor_id])
    attachments = relationship(
        "Attachment", back_populates="journal_entry", cascade="all, delete-orphan"
    )


class Attachment(Base):
    """A receipt/invoice image or PDF attached to a Journal Entry, stored inline as base64."""

    __tablename__ = "attachments"

    id = Column(Integer, primary_key=True)
    journal_entry_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=False)
    filename = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)
    data = Column(Text, nullable=False)  # data: URI, base64
    uploaded_at = Column(DateTime, default=utcnow)

    journal_entry = relationship("JournalEntry", back_populates="attachments")


class JournalLine(Base):
    __tablename__ = "journal_lines"

    id = Column(Integer, primary_key=True)
    journal_entry_id = Column(
        Integer, ForeignKey("journal_entries.id"), nullable=False
    )
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    debit_amount = Column(Float, nullable=False, default=0.0)
    credit_amount = Column(Float, nullable=False, default=0.0)
    description = Column(String, nullable=True)
    tax_rate_id = Column(Integer, ForeignKey("tax_rates.id"), nullable=True)
    is_cleared = Column(Boolean, nullable=False, default=False)
    # Multi-currency (optional): debit_amount/credit_amount above are ALWAYS in the
    # company's base currency and drive every report unchanged. When a line was
    # entered in a foreign currency, these record what was actually keyed in, for
    # display only — base-currency amount = foreign_amount * exchange_rate.
    currency_code = Column(String, nullable=True)
    exchange_rate = Column(Float, nullable=True)
    foreign_debit_amount = Column(Float, nullable=True)
    foreign_credit_amount = Column(Float, nullable=True)

    journal_entry = relationship("JournalEntry", back_populates="lines")
    account = relationship("Account", back_populates="lines")
    tax_rate = relationship("TaxRate", foreign_keys=[tax_rate_id])


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    contact_person = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    tax_id = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=utcnow)


class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    contact_person = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    tax_id = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=utcnow)


class FixedAsset(Base):
    __tablename__ = "fixed_assets"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=True)
    purchase_date = Column(Date, nullable=False)
    cost = Column(Float, nullable=False)
    useful_life_years = Column(Float, nullable=False)
    residual_value = Column(Float, nullable=False, default=0.0)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    is_disposed = Column(Boolean, nullable=False, default=False)
    disposed_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    account = relationship("Account", foreign_keys=[account_id])


class Loan(Base):
    __tablename__ = "loans"

    id = Column(Integer, primary_key=True)
    lender_name = Column(String, nullable=False)
    principal = Column(Float, nullable=False)
    interest_rate_annual = Column(Float, nullable=False)
    tenure_months = Column(Integer, nullable=False)
    start_date = Column(Date, nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    account = relationship("Account", foreign_keys=[account_id])


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True)
    invoice_no = Column(String, nullable=False, unique=True)
    doc_type = Column(String, nullable=False, default="Invoice")  # Invoice/Receipt
    journal_entry_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=True)
    date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=True)
    subtotal = Column(Float, nullable=False, default=0.0)
    tax_amount = Column(Float, nullable=False, default=0.0)
    total = Column(Float, nullable=False, default=0.0)
    notes = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="Unpaid")
    converted_invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    items = relationship(
        "InvoiceItem", back_populates="invoice", cascade="all, delete-orphan"
    )
    customer = relationship("Customer", foreign_keys=[customer_id])
    vendor = relationship("Vendor", foreign_keys=[vendor_id])
    journal_entry = relationship("JournalEntry", foreign_keys=[journal_entry_id])
    converted_invoice = relationship("Invoice", remote_side=[id], foreign_keys=[converted_invoice_id])


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=True)
    description = Column(String, nullable=False)
    quantity = Column(Float, nullable=False, default=1.0)
    rate = Column(Float, nullable=False, default=0.0)
    tax_rate_percent = Column(Float, nullable=False, default=0.0)
    amount = Column(Float, nullable=False, default=0.0)

    invoice = relationship("Invoice", back_populates="items")
    item = relationship("Item", foreign_keys=[item_id])


class Item(Base):
    """Product/service master for the Inventory module."""

    __tablename__ = "items"

    id = Column(Integer, primary_key=True)
    sku = Column(String, nullable=False, unique=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=True)
    unit = Column(String, nullable=False, default="pcs")
    sale_price = Column(Float, nullable=False, default=0.0)
    purchase_price = Column(Float, nullable=False, default=0.0)
    reorder_point = Column(Float, nullable=False, default=0.0)
    is_stock_tracked = Column(Boolean, nullable=False, default=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=utcnow)

    movements = relationship(
        "StockMovement", back_populates="item", cascade="all, delete-orphan"
    )


class StockMovement(Base):
    """One line of an item's stock ledger. quantity is signed: +in, -out."""

    __tablename__ = "stock_movements"

    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    date = Column(Date, nullable=False)
    movement_type = Column(String, nullable=False)  # Opening/Purchase/Sale/Adjustment
    quantity = Column(Float, nullable=False)
    unit_cost = Column(Float, nullable=True)
    reference = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    item = relationship("Item", back_populates="movements")


class RecurringInvoice(Base):
    """A template that periodically generates a real Invoice/Receipt on app launch."""

    __tablename__ = "recurring_invoices"

    id = Column(Integer, primary_key=True)
    doc_type = Column(String, nullable=False, default="Invoice")  # Invoice/Receipt
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=True)
    frequency = Column(String, nullable=False, default="Monthly")  # Weekly/Monthly/Quarterly/Annually
    next_run_date = Column(Date, nullable=False)
    notes = Column(Text, nullable=True)
    items_json = Column(Text, nullable=False, default="[]")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=utcnow)

    customer = relationship("Customer", foreign_keys=[customer_id])
    vendor = relationship("Vendor", foreign_keys=[vendor_id])


class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    role = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    bank_account = Column(String, nullable=True)
    basic_salary = Column(Float, nullable=False, default=0.0)
    joining_date = Column(Date, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=utcnow)


class PayrollDeductionType(Base):
    """A configurable withholding/contribution rule — e.g. 'Provident Fund' 12%
    (Employee-side, deducted from pay) or 'Employer PF Contribution' 12%
    (Employer-side, a cost on top of pay). Deliberately generic, not tied to
    any one country's statutory scheme."""

    __tablename__ = "payroll_deduction_types"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    calc_type = Column(String, nullable=False, default="Percent")  # Percent/Fixed
    value = Column(Float, nullable=False, default=0.0)
    applies_to = Column(String, nullable=False, default="Employee")  # Employee/Employer
    is_active = Column(Boolean, nullable=False, default=True)


class PayrollRun(Base):
    __tablename__ = "payroll_runs"

    id = Column(Integer, primary_key=True)
    month = Column(String, nullable=False)  # "2026-07"
    run_date = Column(Date, nullable=False)
    status = Column(String, nullable=False, default="Draft")  # Draft/Finalized
    journal_entry_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    payslips = relationship("Payslip", back_populates="payroll_run", cascade="all, delete-orphan")
    journal_entry = relationship("JournalEntry", foreign_keys=[journal_entry_id])


class Payslip(Base):
    __tablename__ = "payslips"

    id = Column(Integer, primary_key=True)
    payroll_run_id = Column(Integer, ForeignKey("payroll_runs.id"), nullable=False)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    gross_pay = Column(Float, nullable=False, default=0.0)
    employee_deductions_total = Column(Float, nullable=False, default=0.0)
    employer_contributions_total = Column(Float, nullable=False, default=0.0)
    net_pay = Column(Float, nullable=False, default=0.0)

    payroll_run = relationship("PayrollRun", back_populates="payslips")
    employee = relationship("Employee", foreign_keys=[employee_id])
    deductions = relationship("PayslipDeduction", back_populates="payslip", cascade="all, delete-orphan")


class PayslipDeduction(Base):
    __tablename__ = "payslip_deductions"

    id = Column(Integer, primary_key=True)
    payslip_id = Column(Integer, ForeignKey("payslips.id"), nullable=False)
    name = Column(String, nullable=False)
    applies_to = Column(String, nullable=False)
    amount = Column(Float, nullable=False, default=0.0)

    payslip = relationship("Payslip", back_populates="deductions")


class User(Base):
    """Optional local login. If this table has zero rows, the app runs in its
    original single-user, no-login mode — creating the first user (from Settings
    -> Users & Access) is what opts a company into requiring login at all."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String, nullable=False, unique=True)
    password_hash = Column(String, nullable=False)
    password_salt = Column(String, nullable=False)
    role = Column(String, nullable=False, default="Accountant")  # Admin/Accountant/Viewer
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=utcnow)


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True)
    token = Column(String, nullable=False, unique=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow)
    expires_at = Column(DateTime, nullable=False)

    user = relationship("User", foreign_keys=[user_id])


class BankReconciliation(Base):
    __tablename__ = "bank_reconciliations"

    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    statement_date = Column(Date, nullable=False)
    statement_balance = Column(Float, nullable=False)
    book_balance = Column(Float, nullable=False)
    difference = Column(Float, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    account = relationship("Account", foreign_keys=[account_id])
