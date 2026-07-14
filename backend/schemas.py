"""Pydantic request/response schemas."""
import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, field_validator


# ---------- Company / Setup ----------


class TaxRateIn(BaseModel):
    rate: float
    label: Optional[str] = None


class TaxRateOut(TaxRateIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_active: bool = True


class OwnerIn(BaseModel):
    name: str
    role: Optional[str] = None
    share_percent: float = 0.0


class OwnerOut(OwnerIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    capital_account_id: Optional[int] = None
    is_active: bool = True


class AccountIn(BaseModel):
    code: Optional[str] = None
    name: str
    type: str
    category: str
    normal_balance: str


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    type: str
    category: str
    normal_balance: str
    is_active: bool
    is_system: bool


class AccountUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    type: Optional[str] = None
    category: Optional[str] = None
    normal_balance: Optional[str] = None
    is_active: Optional[bool] = None


class CompanyProfileIn(BaseModel):
    name: str
    legal_structure: str = "Sole Proprietorship"
    country: Optional[str] = None
    currency_symbol: str = "$"
    currency_code: str = "USD"
    fy_start_month: int = 1
    registration_no: Optional[str] = None
    tax_id: Optional[str] = None


class CompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    legal_structure: str
    country: Optional[str] = None
    currency_symbol: str
    currency_code: str
    fy_start_month: int
    registration_no: Optional[str] = None
    tax_id: Optional[str] = None
    tax_name: str
    logo_data: Optional[str] = None
    setup_complete: bool


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    legal_structure: Optional[str] = None
    country: Optional[str] = None
    currency_symbol: Optional[str] = None
    currency_code: Optional[str] = None
    fy_start_month: Optional[int] = None
    registration_no: Optional[str] = None
    tax_id: Optional[str] = None
    tax_name: Optional[str] = None
    logo_data: Optional[str] = None


class SetupWizardIn(BaseModel):
    profile: CompanyProfileIn
    tax_name: str = "GST"
    tax_rates: List[TaxRateIn] = []
    owners: List[OwnerIn] = []
    accounts: List[AccountIn] = []


# ---------- Journal ----------


class JournalLineIn(BaseModel):
    account_id: int
    debit_amount: float = 0.0
    credit_amount: float = 0.0
    description: Optional[str] = None
    tax_rate_id: Optional[int] = None
    currency_code: Optional[str] = None
    exchange_rate: Optional[float] = None
    foreign_debit_amount: Optional[float] = None
    foreign_credit_amount: Optional[float] = None

    @field_validator("debit_amount", "credit_amount")
    @classmethod
    def non_negative(cls, v):
        if v < 0:
            raise ValueError("Amounts must be non-negative")
        return round(v, 2)


class JournalLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    account_id: int
    account_name: Optional[str] = None
    account_code: Optional[str] = None
    debit_amount: float
    credit_amount: float
    description: Optional[str] = None
    tax_rate_id: Optional[int] = None
    is_cleared: bool = False
    currency_code: Optional[str] = None
    exchange_rate: Optional[float] = None
    foreign_debit_amount: Optional[float] = None
    foreign_credit_amount: Optional[float] = None


class AttachmentIn(BaseModel):
    filename: str
    mime_type: str
    data: str


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    journal_entry_id: int
    filename: str
    mime_type: str
    data: str
    uploaded_at: datetime.datetime


class JournalEntryIn(BaseModel):
    date: datetime.date
    voucher_type: str = "Journal"
    narration: Optional[str] = None
    reference: Optional[str] = None
    party_name: Optional[str] = None
    customer_id: Optional[int] = None
    vendor_id: Optional[int] = None
    payment_mode: Optional[str] = None
    payment_status: str = "Unpaid"
    lines: List[JournalLineIn]


class JournalEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    voucher_no: str
    voucher_type: str
    date: datetime.date
    narration: Optional[str] = None
    reference: Optional[str] = None
    party_name: Optional[str] = None
    customer_id: Optional[int] = None
    vendor_id: Optional[int] = None
    payment_mode: Optional[str] = None
    payment_status: str
    is_void: bool
    lines: List[JournalLineOut] = []
    attachments: List[AttachmentOut] = []
    total_debit: float = 0.0
    total_credit: float = 0.0


# ---------- Masters ----------


class CustomerIn(BaseModel):
    name: str
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    tax_id: Optional[str] = None


class CustomerOut(CustomerIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_active: bool = True
    outstanding_balance: float = 0.0


class VendorIn(BaseModel):
    name: str
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    tax_id: Optional[str] = None


class VendorOut(VendorIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_active: bool = True
    outstanding_balance: float = 0.0


# ---------- Fixed Assets ----------


class FixedAssetIn(BaseModel):
    name: str
    category: Optional[str] = None
    purchase_date: datetime.date
    cost: float
    useful_life_years: float
    residual_value: float = 0.0
    account_id: Optional[int] = None
    notes: Optional[str] = None


class FixedAssetOut(FixedAssetIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_disposed: bool = False
    disposed_date: Optional[datetime.date] = None
    accumulated_depreciation: float = 0.0
    book_value: float = 0.0
    annual_depreciation: float = 0.0


# ---------- Loans ----------


class LoanIn(BaseModel):
    lender_name: str
    principal: float
    interest_rate_annual: float
    tenure_months: int
    start_date: datetime.date
    account_id: Optional[int] = None
    notes: Optional[str] = None


class LoanOut(LoanIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_active: bool = True
    emi: float = 0.0
    outstanding_balance: float = 0.0
    total_interest_paid: float = 0.0
    installments_paid: int = 0


# ---------- Invoices ----------


class InvoiceItemIn(BaseModel):
    description: str
    quantity: float = 1.0
    rate: float = 0.0
    tax_rate_percent: float = 0.0
    item_id: Optional[int] = None


class InvoiceItemOut(InvoiceItemIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    amount: float = 0.0


class InvoiceIn(BaseModel):
    doc_type: str = "Invoice"
    journal_entry_id: Optional[int] = None
    customer_id: Optional[int] = None
    vendor_id: Optional[int] = None
    date: datetime.date
    due_date: Optional[datetime.date] = None
    notes: Optional[str] = None
    status: str = "Unpaid"
    items: List[InvoiceItemIn] = []


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    invoice_no: str
    doc_type: str
    journal_entry_id: Optional[int] = None
    customer_id: Optional[int] = None
    vendor_id: Optional[int] = None
    date: datetime.date
    due_date: Optional[datetime.date] = None
    subtotal: float
    tax_amount: float
    total: float
    notes: Optional[str] = None
    status: str
    items: List[InvoiceItemOut] = []
    customer_name: Optional[str] = None
    vendor_name: Optional[str] = None
    converted_invoice_id: Optional[int] = None


# ---------- Inventory ----------


class ItemIn(BaseModel):
    sku: Optional[str] = None
    name: str
    category: Optional[str] = None
    unit: str = "pcs"
    sale_price: float = 0.0
    purchase_price: float = 0.0
    reorder_point: float = 0.0
    is_stock_tracked: bool = True


class ItemOut(ItemIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    sku: str
    is_active: bool = True
    stock_on_hand: float = 0.0
    stock_value: float = 0.0
    below_reorder_point: bool = False


class StockMovementIn(BaseModel):
    date: datetime.date
    movement_type: str
    quantity: float
    unit_cost: Optional[float] = None
    reference: Optional[str] = None
    notes: Optional[str] = None


class StockMovementOut(StockMovementIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    item_id: int
    running_balance: float = 0.0


# ---------- Auth ----------


class AuthStatusOut(BaseModel):
    auth_enabled: bool


class BootstrapAdminIn(BaseModel):
    username: str
    password: str


class LoginIn(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    role: str
    is_active: bool


class LoginOut(BaseModel):
    token: str
    user: UserOut


class UserCreateIn(BaseModel):
    username: str
    password: str
    role: str = "Accountant"


class UserUpdateIn(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


# ---------- Payroll ----------


class EmployeeIn(BaseModel):
    name: str
    role: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    bank_account: Optional[str] = None
    basic_salary: float = 0.0
    joining_date: Optional[datetime.date] = None


class EmployeeOut(EmployeeIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_active: bool = True


class PayrollDeductionTypeIn(BaseModel):
    name: str
    calc_type: str = "Percent"
    value: float = 0.0
    applies_to: str = "Employee"


class PayrollDeductionTypeOut(PayrollDeductionTypeIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_active: bool = True


class PayslipDeductionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    name: str
    applies_to: str
    amount: float


class PayslipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    employee_id: int
    employee_name: Optional[str] = None
    gross_pay: float
    employee_deductions_total: float
    employer_contributions_total: float
    net_pay: float
    deductions: List[PayslipDeductionOut] = []


class PayrollRunIn(BaseModel):
    month: str
    run_date: datetime.date


class PayrollRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    month: str
    run_date: datetime.date
    status: str
    journal_entry_id: Optional[int] = None
    payslips: List[PayslipOut] = []
    total_gross: float = 0.0
    total_net: float = 0.0


# ---------- Recurring Invoices ----------


class RecurringInvoiceIn(BaseModel):
    doc_type: str = "Invoice"
    customer_id: Optional[int] = None
    vendor_id: Optional[int] = None
    frequency: str = "Monthly"
    next_run_date: datetime.date
    notes: Optional[str] = None
    is_active: bool = True
    items: List[InvoiceItemIn] = []


class RecurringInvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    doc_type: str
    customer_id: Optional[int] = None
    vendor_id: Optional[int] = None
    frequency: str
    next_run_date: datetime.date
    notes: Optional[str] = None
    is_active: bool
    items: List[InvoiceItemIn] = []
    customer_name: Optional[str] = None
    vendor_name: Optional[str] = None


# ---------- Bank Statement Import ----------


class BankStatementParseIn(BaseModel):
    account_id: int
    filename: str
    content: str


class BankStatementClearIn(BaseModel):
    line_ids: List[int]


class BankStatementCreateEntriesIn(BaseModel):
    account_id: int
    offset_account_id: int
    rows: List[dict]


# ---------- Bank Reconciliation ----------


class BankReconciliationIn(BaseModel):
    account_id: int
    statement_date: datetime.date
    statement_balance: float
    notes: Optional[str] = None


class BankReconciliationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    account_id: int
    statement_date: datetime.date
    statement_balance: float
    book_balance: float
    difference: float
    notes: Optional[str] = None
