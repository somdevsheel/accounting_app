# User Guide

Everyday how-tos for using Ledger. For installing/running the app, see `README.md`.

## Contents

- [Getting started](#getting-started)
- [Core concepts](#core-concepts)
- [Screen by screen](#screen-by-screen)
- [Common workflows](#common-workflows)
- [Troubleshooting](#troubleshooting)

## Getting started

The very first time you launch the app (empty database), you land on a 4-step **Setup Wizard**
instead of the dashboard. Nothing here is permanent — every field is editable later from
**Settings**.

1. **Company Profile** — name, legal structure (Sole Proprietorship / Partnership / LLP / Private
   Limited / Corporation — this changes labels elsewhere, e.g. "Partners" vs "Shareholders"),
   country, base currency, financial year start month (auto-suggested from country, e.g. April
   for India, January for most others — override it if you like), registration/tax ID.
2. **Owners / Partners** — one row per owner. Each gets a matching `[Name] Capital` account
   created automatically in the Chart of Accounts. Shares should add to 100% but it's a warning,
   not a hard block — you can fix it later.
3. **Tax Configuration** — name your tax (GST, VAT, Sales Tax, …) and set the rates you charge/pay
   (defaults to 0/5/12/18/28, fully editable).
4. **Chart of Accounts** — a generic default template, pre-filled and editable right there:
   rename, delete, or add accounts before finishing, or just use the defaults and adjust later.

Click **Finish Setup** and you land on the (empty) Dashboard. The wizard never appears again once
a company exists — go to **Settings → Company Info / Settings** to change any of the above later.

## Core concepts

- **Everything flows from the Journal.** This is real double-entry bookkeeping: every transaction
  is a **Journal Entry** with ≥2 **lines**, and total debits must equal total credits. Every
  report, register, and ledger screen in the app is *computed* from journal entries — nothing is
  a separately-maintained number.
- **Read-only vs editable screens.** Dashboard, General Ledger, Trial Balance, P&L, Balance Sheet,
  Cash Flow, Ratios, all Registers, Cash/Bank Book, Tax Register, and Capital Accounts are all
  **reports** — there's no Save button because there's nothing to save; they recompute from the
  Journal every time you open them. Journal Entries, Chart of Accounts, Settings, Customers,
  Vendors, Fixed Assets, Loans, and Invoices are the actual **editable records**.
- **Void, don't delete.** Once a Journal Entry is posted, don't try to make it disappear — click
  **Void** on it instead (Journal Entries screen). A voided entry stays visible in history but is
  excluded from every balance and report. You can **Unvoid** it later if needed. You can also
  **Edit** a non-voided entry directly.
- **Deactivate vs delete for accounts/owners/customers/vendors.** Once something has journal
  lines posted against it, the app won't let you delete it (that would silently corrupt
  historical reports) — you'll only see a **Deactivate** option, which drops it out of dropdowns
  for new entries while keeping past reports intact. Brand-new, never-used accounts can still be
  deleted outright from the Chart of Accounts screen.
- **Voucher Types** (`Journal`, `Receipt`, `Payment`, `Sales`, `Purchase`, `Contra`) drive which
  register an entry shows up in (Sales Register reads `Sales` entries, Purchase Register reads
  `Purchase`, etc.) and how its voucher number is prefixed (e.g. `JV-0001`, `PU-0001`). Pick the
  type that matches what actually happened, not just "Journal" for everything.

## Screen by screen

### Overview
- **Dashboard** — KPI cards (Total Assets, Liabilities, Capital, Net Worth, Revenue, Expenses,
  Net Profit, Cash, Bank, Working Capital, Current Ratio, Debt-Equity, Net Profit Margin, ROA,
  Asset Turnover) and a 0–100 **Financial Health Score**, plus charts: monthly revenue/expense/
  profit trend, expense breakdown, asset breakdown, capital split by owner.

### Transactions
- **Journal Entries** — the main data-entry screen. **+ New Journal Entry** opens a multi-line
  form with a live "Balanced / out of balance by ₹X" indicator; **Post Entry** is disabled until
  it balances. **View** shows a read-only breakdown, **Edit** lets you change a non-voided entry,
  **Void** / **Unvoid** toggle its inclusion in reports.
- **Invoice Generator** / **Receipt Generator** — same screen, two labels. **+ New Invoice**
  builds a printable, itemized document (qty × rate + tax %) against a Customer (Invoices) or
  Vendor (Receipts). **Generate from Journal Entry** turns an existing `Sales` entry (for
  invoices) or `Receipt`/`Payment` entry (for receipts) into a printable document instead of
  re-entering the line items. **Print** opens a clean, no-chrome printable view (browser print
  dialog — no PDF library needed).

### Ledgers & Statements
- **General Ledger** — pick an account, optionally a date range, see every line posted to it with
  a running balance.
- **Trial Balance** — every account's debit/credit totals as of a date, with a balanced/
  out-of-balance badge.
- **Profit & Loss** — income and expenses for a period (This Month / Quarter / Financial Year /
  All Time / custom range).
- **Balance Sheet** — assets, liabilities, and capital as of a date, with an
  Assets = Liabilities + Capital check.
- **Cash Flow Statement** — Operating / Investing / Financing buckets, reconciled against the
  actual closing Cash + Bank balance.
- **Financial Ratios** — Current, Quick, Debt-Equity, Net/Gross Margin, ROA, ROE, Asset Turnover,
  Working Capital, each with a plain-English one-line explanation, plus the same Financial Health
  Score shown on the Dashboard.

### Registers
- **Sales Register** / **Purchase Register** — every `Sales` / `Purchase` voucher with a net /
  tax / total breakup and payment status.
- **Expense Register** — every line posted to any Expense-type account.
- **Cash Book** / **Bank Book** — every line posted to the Cash / Bank account, running balance.
- **Tax Register** — output tax (from Sales) vs input tax (from Purchases), grouped Monthly /
  Quarterly / Annually, with net payable/receivable.
- **Bank Reconciliation** — pick Cash or Bank, enter your bank statement's balance and date, tick
  off lines as "cleared" as they show up on the real statement; the screen computes outstanding
  deposits/withdrawals and the difference. **Save Reconciliation** logs a snapshot for the record.

### Capital
- **Capital Accounts** — a read-only per-owner summary (Capital Introduced, Drawings, Profit
  Allocation, Ledger Balance, Closing Balance). Use the **+ Record Contribution** button here for
  the fast path to adding capital (see [workflow](#record-a-capital-contribution) below).
- **Capital Contribution Log** — every credit ever posted to any owner's Capital account,
  auto-derived from the Journal — nothing to maintain manually here.

### Assets & Loans
- **Fixed Asset Register** — **+ Add Fixed Asset** (name, category/account, purchase date, cost,
  useful life in years, residual value). Depreciation is computed automatically —
  straight-line, prorated by days — you never enter a depreciation figure by hand. **Dispose**
  marks it disposed as of a date (stops further depreciation); **Delete** removes the record.
  The **Depreciation Schedule** tab shows the year-by-year breakdown per financial year.
- **Loan Register** — **+ Add Loan** (lender, principal, annual interest rate, tenure in months,
  start date). EMI and the full amortization **Schedule** (principal/interest split per
  installment, declining balance) are computed automatically from the standard amortization
  formula. **Close** marks a loan as paid off.

### Masters
- **Customer Register** / **Vendor Register** — contact/master data (name, contact person, email,
  phone, tax ID, address). **Outstanding** balance is computed automatically from unpaid Sales/
  Purchase entries tied to that party — not something you type in.

### Setup
- **Company Info / Settings** — everything from the wizard, editable anytime, in four tabs:
  - **Company Profile**: name, legal structure, country, currency, FY start month,
    registration/tax ID, and the company **logo** (shown in the sidebar and on invoices/receipts).
  - **Owners / Partners**: add/edit/deactivate owners, change name/role/share %.
  - **Tax Configuration**: tax name, add/remove tax rates.
  - **Chart of Accounts**: shortcuts to the same screen as below.
- **Chart of Accounts** — **+ Add Account** (code, name, type, category, normal balance),
  **Edit**, **Deactivate**/**Activate**, or **Delete** (only offered for accounts with no journal
  lines posted yet — otherwise Deactivate is your only option, on purpose, so history stays
  intact).

## Common workflows

### Record a sale with tax
Journal Entries → **+ New Journal Entry** → Voucher Type `Sales` → lines:

| Account | Debit | Credit |
|---|---|---|
| Accounts Receivable (or Bank/Cash if paid immediately) | Gross amount | |
| `[Tax name] Payable` | | Tax amount |
| Service Revenue / Product Sales | | Net amount |

Set **Party Name** to the customer and pick a **Tax** on the revenue line if you want it tracked
per-line. This shows up in Sales Register and Tax Register automatically.

### Record a purchase with tax
Same idea, reversed — Voucher Type `Purchase`:

| Account | Debit | Credit |
|---|---|---|
| Expense account (or a Fixed Asset account) | Net amount | |
| `[Tax name] Input Credit` | Tax amount | |
| Accounts Payable (or Bank/Cash if paid immediately) | | Gross amount |

### Record a capital contribution
**Fast path:** Capital Accounts → **+ Record Contribution** → pick the owner, pick Cash or Bank,
enter amount and date, post. This creates the correct journal entry for you.

**Manual path** (for anything the quick form doesn't cover, e.g. an owner contributing an asset
instead of cash): Journal Entries → **+ New Journal Entry**, Voucher Type `Receipt`:

| Account | Debit | Credit |
|---|---|---|
| Bank / Cash (or the asset received) | Amount | |
| `[Owner Name] Capital` | | Amount |

### Record an owner's drawings
Journal Entries → **+ New Journal Entry**:

| Account | Debit | Credit |
|---|---|---|
| `[Owner Name] Capital` (or the generic "Owner Drawings" account) | Amount | |
| Bank / Cash | | Amount |

### Add a fixed asset and see its depreciation
Fixed Asset Register → **+ Add Fixed Asset** → fill cost/useful life/residual value → save.
Depreciation, accumulated depreciation, and book value appear immediately in the register and in
the **Depreciation Schedule** tab. This only creates the asset *record* — if you also want the
purchase itself reflected in the ledger, post a Journal Entry (`Dr [Fixed Asset account], Cr
Bank/Accounts Payable`) for the purchase separately.

### Add a loan and see the EMI schedule
Loan Register → **+ Add Loan** → principal, annual rate, tenure, start date → save. EMI and
outstanding balance appear immediately; click **Schedule** for the full month-by-month
amortization table.

### Reconcile a bank account
Bank Reconciliation → pick account → enter the statement's closing balance and date → tick each
line as "cleared" as you match it against the real statement → **Save Reconciliation** once the
Difference reads ₹0.00 (or however far off you're comfortable leaving it, e.g. an outstanding
cheque).

### Add a company logo
Settings → Company Profile tab → **Upload logo**. It's resized client-side and shown in the
sidebar and on printed invoices/receipts; **Remove** clears it.

### Generate an invoice from a journal entry you already posted
Invoice Generator → **Generate from Journal Entry** → pick a `Sales` entry → it becomes a
printable invoice with the entry's amount, without re-typing line items. (Receipt Generator does
the same for `Receipt`/`Payment` entries.)

## Troubleshooting

- **A report/register shows nothing.** These are all computed from posted Journal Entries — check
  Journal Entries first; if it's empty (or everything in it is voided), every downstream screen
  will be empty too.
- **Balance Sheet / Trial Balance says "Out of Balance."** This should be structurally impossible
  given the entry-level validation (debits must equal credits to post at all) — if you see it,
  check for a voided entry that's still partially reflected somewhere, or file it as a bug.
- **I can't find a number I expected to edit directly** (e.g. Capital Introduced, an Outstanding
  balance, computed depreciation). These are intentionally derived from the Journal so the books
  stay internally consistent — post or correct the underlying Journal Entry instead of looking
  for a field to overwrite.
- **I want to undo a posted entry.** Void it (Journal Entries → Void) rather than deleting — this
  preserves the audit trail. Post a correcting entry alongside it if needed.
