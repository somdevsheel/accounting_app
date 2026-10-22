# Changelog / Session Log

A durable record of what's been built, decided, and deliberately deferred — written so this
context survives even if chat history doesn't. Organized by theme, not strictly chronological.
See `README.md` (architecture), `USER_GUIDE.md` (how to use it), `SETUP_GUIDE.md` (how to
install/build it) for the living docs this log feeds into.

## Starting point

Inherited a fully-built local-first desktop accounting app ("Ledger" at the time) matching a
detailed original spec: FastAPI + SQLAlchemy + SQLite backend, vanilla HTML/CSS/JS frontend,
Electron shell. Audited it screen-by-screen and endpoint-by-endpoint against the spec (Setup
Wizard, Chart of Accounts, Journal Entries with hard double-entry validation, every ledger/report
screen, Fixed Assets, Loans, Invoices) and verified it end-to-end via live API calls (posted real
journal entries, confirmed Trial Balance/Balance Sheet/registers all reconciled correctly) —
found it essentially 100% complete against spec.

## Gap analysis vs. commercial tools

Published an Artifact report comparing this app against QuickBooks Online, Xero, Zoho Books,
Tally Prime, and Wave — a feature matrix plus a fixability assessment (which gaps are buildable
within the "local-first, no server" philosophy vs. which require an architecture change). Full
report: ask to see it re-published, or see the "8 fixable gaps" list below, which came directly
out of that analysis.

**Where this app already led**: stricter double-entry enforcement than Wave (the closest free
comparison), a built-in financial ratio suite + computed Financial Health Score that none of the
five ship for free, automated depreciation/EMI schedules usually paid-tier elsewhere, zero
recurring cost, fully auditable source.

## Features added (the "8 fixable gaps")

All eight verified end-to-end against isolated copies of the real database before merging —
never against the live company data directly.

1. **Attachments** on Journal Entries — receipts/PDFs stored as base64 in SQLite (same pattern as
   the company logo), with upload/view/delete UI.
2. **Multi-currency** — an "🌐 FX" toggle per journal line; base-currency amounts (which every
   existing report already reads) computed automatically from foreign amount × exchange rate.
   Base debit/credit columns stay authoritative, so no existing report logic needed to change.
3. **Quotes/Estimates & Purchase Orders** — new doc types alongside Invoice/Receipt, reusing the
   existing invoice line-item/print infrastructure. Quotes get a "Convert to Invoice" action.
4. **Recurring invoices** — templates that generate real invoices/receipts automatically, checked
   on every app launch (no background process — Electron only runs when open, so "recurring"
   means "generate what's due since last launch").
5. **Inventory** — Item master + signed-quantity stock ledger; selling a stock-tracked item on an
   Invoice auto-creates a "Sale" stock movement; Stock Register report with reorder alerts.
6. **Bank statement import** — CSV/OFX parser (hand-written, no new dependency) that auto-matches
   statement rows against unreconciled ledger lines (same amount, within 5 days), with one-click
   journal entry creation for anything left unmatched.
7. **Payroll** — Employee master + configurable deduction/contribution types (Percent or Fixed;
   Employee-side withheld from pay, Employer-side a cost on top) — deliberately generic, not
   hardcoded to any country's statutory scheme. Monthly payroll runs post a correctly-balancing
   journal entry (Dr Salaries & Wages, Cr Bank for net pay, Cr TDS/Withholding Payable for
   everything withheld).
8. **Multi-user login** — strictly opt-in: the app works exactly as before (no login at all) until
   someone explicitly creates the first Admin from Settings → Users & Access. Only then does a
   login wall + Admin/Accountant/Viewer roles activate. Session tokens via a local `UserSession`
   table, PBKDF2 password hashing (stdlib only, no new dependency).

**Also added**: universal CSV/Excel export — one generic mechanism at the app-shell level (reads
whatever `<table>` is on screen) rather than per-screen export code, so it works on every
report/register uniformly, including future ones.

## Branding: Ledger → Accrued

Full rename (window title, sidebar, README, error messages, npm package name, appId) plus real
brand assets: app icon and an animated logo-reveal startup screen (replacing the generic spinner),
built from user-supplied artwork. Went through two real design iterations on the startup screen
(white card → soft blurred glow) to keep the navy wordmark legible once the background was made
transparent.

## Packaging: from "run npm start" to a real standalone installer

This was the largest chunk of work, and where most of the subtle, real bugs were.

- **Backend now freezes into a standalone executable** via PyInstaller (`backend/build_backend.py`,
  `backend/run_server.py`) — the packaged app needs **no Python installed on the target machine
  at all**. `electron/main.js` prefers the frozen build, falls back to system/venv Python for
  source-mode dev.
- **Windows `.exe`** (NSIS) — switched from electron-builder's silent one-click default to a
  traditional Next→Next→Install wizard (user's explicit request), still per-user install (no
  admin rights needed).
- **Linux**: both `.deb` (real `apt install`/`apt remove` lifecycle) and `.AppImage` (portable, no
  install) built from the same `npm run dist`.
- **GitHub Actions workflow** (`.github/workflows/build-windows.yml`) builds the Windows installer
  on GitHub's own runners — added specifically because the target Windows machine has neither
  Python nor Node installed. Manual trigger only (`workflow_dispatch`), so it doesn't spend
  Actions minutes unassisted.

### Real bugs found and fixed along the way (worth knowing about before touching packaging again)

- **PyInstaller silently dropped the whole app.** `uvicorn.run("main:app")`'s string-based app
  loading is invisible to PyInstaller's static import analysis — `main.py` and everything it
  imports (models, routers, database) never got bundled. Fixed by importing the app object
  directly in `run_server.py` instead of passing a string.
- **Packaged app had no window icon or startup logo.** `electron/build/` is only ever used by
  `electron-builder` itself at *build time* to brand the installer — it was never bundled as a
  runtime resource, and `BrowserWindow`'s icon option needs a real file on disk anyway (can't be
  read from inside an asar archive). Fixed via a dedicated `extraResources` → `resources/branding/`
  copy, with `main.js` pointing there specifically when packaged.
- **Linux app-launcher icon showed a generic gear**, not the real icon. electron-builder's
  single-PNG auto-resize-to-multiple-sizes step was failing silently, dumping everything into a
  bogus `hicolor/0x0/apps/` directory (not a real freedesktop icon theme size bucket, so lookup
  found nothing). Fixed by pre-generating the standard size set (16–512px) myself via ImageMagick
  and pointing `linux.icon` at that directory instead of one file.
- **`.deb` install: backend opened but silently failed.** The `.deb` installs to `/opt/Accrued`,
  owned by `root`. The backend was computing its SQLite data directory *inside* that install
  path, which a normal user can't write to — `PermissionError` on startup. AppImage and the
  per-user Windows install happen to be user-writable, which is exactly why this went unnoticed
  until the `.deb` target was added. Fixed by switching to `app.getPath("userData")` — Electron's
  own platform-correct per-user data location — for the packaged case.
- **Backend startup failures were all reported identically** ("Backend did not become healthy in
  time"), regardless of actual cause, because a packaged double-clicked `.exe` has no visible
  console to show a real Python traceback in. Rewrote the failure path in `main.js` to capture
  stdout/stderr and pattern-match the real cause (port conflict / missing dependency / missing
  interpreter / crashed backend) into a specific, correct message.
- **Balance Sheet export mislabeled the Capital section as "Liabilities".** The generic CSV/Excel
  exporter's table-title lookup used "first `<h3>` in the enclosing `.card`", which breaks when a
  card holds two tables sharing one card (Liabilities + Capital do). Fixed to find the *nearest
  preceding* heading per table via DOM sibling walk-up, verified against real headless-browser
  output, not just code review.
- **Viewer accounts couldn't log out.** The read-only role restriction in the auth middleware
  blocked `POST /api/auth/logout` too, since logout is a POST. Fixed with an explicit exemption.

### Verification approach used throughout

Real database work was always tested against **isolated copies** (a scratch-directory clone of
`backend/`, sometimes on an alternate port) — never against the live company data directly, other
than read-only checks. Packaging changes were verified as deeply as this sandboxed environment
(no display server, no passwordless sudo) allows: `dpkg-deb`/AppImage extraction + MD5 comparison
against source assets, direct execution of path-resolution logic with mocked
`app.isPackaged`/`resourcesPath`, and headless-Chrome screenshots for anything visual. Real
Electron GUI launches and actual `apt install` runs were consistently outside what could be
verified here — flagged explicitly rather than assumed to work, and confirmed against real user
reports instead (which is how the `.deb` permission bug and the launcher-icon bug were actually
caught).

## Documentation created this session

- **`USER_GUIDE.md`** — full day-to-day manual: core concepts (why some screens are read-only,
  void-don't-delete, voucher types), every screen explained, worked examples with actual
  debit/credit tables for common workflows.
- **`SETUP_GUIDE.md`** — step-by-step install/build instructions for Windows and Linux, each with
  parallel paths (already have the installer / no Python-Node available / build locally / run
  from source), first-launch walkthrough, troubleshooting, uninstalling.
- **This file.**

## Discussed, explicitly NOT implemented

Per explicit request to discuss without building:

- **AWS S3 backup** — feasible, but the real open question is whose AWS credentials: bundling the
  app's own is a security and cost liability (leaked keys, unbounded bill), user-supplied pushes
  real AWS setup complexity onto small-business users this app is positioned to avoid. Compared
  against what comparable software actually does — Tally (manual backup to any folder, cloud is a
  separate paid product), QuickBooks Desktop (manual backup + optional paid vendor-hosted
  service), GnuCash (no built-in cloud at all, relies on a user's existing Dropbox/Drive sync).
  Recommendation if revisited: a simple "backup to a folder" feature first (zero cloud
  credentials, works with any sync service the user already trusts), with a generic
  S3-*compatible*-endpoint option (not hardcoded to AWS) as a later opt-in for advanced users.
- **Email-based login** — splits into two different asks: using an email address as the username
  in the *existing* local login system (trivial, no new infrastructure) vs. real email
  authentication like magic links or password-reset-via-email (needs a mail-sending service —
  SES/SendGrid/SMTP — which is a genuine network dependency and credentials question, same shape
  as the S3 issue). Noted that local login (already built) matches what Tally/QuickBooks Desktop
  do for desktop software; email/cloud identity is a SaaS-category pattern (Xero/QBO/Zoho, where
  the product *is* the server) that doesn't map cleanly onto a local-first desktop app without
  becoming a bigger "should this also be a hosted product" decision.

## Bug sweep: functions and UI

A full read-through of every router, accounting module and screen. Each fix was confirmed against
a throwaway database (backend over HTTP, frontend driven in headless Chrome with an IST
timezone), and the UI checks were also run against the pre-fix frontend to make sure they caught
the original bugs.

**Wrong numbers**
- **Dates off by a day outside UTC.** `todayStr()` and the report period ranges used
  `toISOString()`, which converts to UTC first. In India, "This Financial Year" ran
  31 Mar → 30 Mar and "today" could be yesterday. Now uses local dates (`isoDate()` in `api.js`).
- **Date-filtered General Ledger / Cash Book / Bank Book** started the running balance at zero,
  ignoring everything before the start date. They now carry an opening balance (shown as a row).
- **Saved bank reconciliations** compared the book balance with the *raw* statement balance, so
  any uncleared item was recorded as a discrepancy, unlike the on-screen preview. Both now use the
  same adjusted figure.
- **Renaming the tax** (e.g. GST → VAT) left the `GST Payable` / `GST Input Credit` accounts
  under the old name, so the Tax Register went blank. Those accounts are now renamed with it.

**Stock**
- **Deleting an invoice** didn't put back the stock it had deducted. It does now, and a quote
  that was converted into it becomes convertible again (previously the delete failed with a 500).
- **Quote → Invoice conversion** and **recurring invoices** dropped the item link, so they never
  deducted stock. All three paths now share `add_invoice_items()`.
- **Stock movements**: Sale always reduces stock and Opening/Purchase always increase it,
  whatever sign is typed. Only Adjustment takes a signed quantity.

**Crashes / broken screens**
- **Foreign-currency (🌐) toggle** on a journal line threw a TypeError while binding the form,
  leaving Add Line and Save dead.
- **After logging in** (or logging out and back in) the sidebar and topbar stayed hidden. After
  the setup wizard, the main area also lost its padding.
- **Dispose fixed asset** used `window.prompt()`, which Electron doesn't implement, so the button
  did nothing in the desktop app. It's now a modal.
- **Setup wizard** failed with a 500 when two accounts were left with blank codes (both got the
  same auto-code, since the session doesn't autoflush).
- **500s turned into clear 400 messages**: deleting a tax rate that's in use; changing an account
  code or item SKU to one already taken; deleting an account linked to an owner, asset, loan or
  reconciliation; malformed bank-import rows.

**Guard rails**
- The last active Admin can no longer demote themselves to Accountant/Viewer (that locked
  everyone out of Users & Access). Role values are validated on update.
- Recurring templates now catch up on every run missed while the app was closed (capped at 60
  runs), instead of producing one per launch.
- Bank statement import: handles the UTF-8 BOM that Excel adds to CSVs (it hid the Date column)
  and `(1,234.50)`-style negatives.
- Payroll: refuses to post when deductions exceed gross pay (it would have posted an unbalanced
  entry), and validates the month format.
- Validation of company name, FY start month (1–12), tax rate (0–100), owner share %, asset
  residual ≤ cost, loan tenure, and invoice due date ≥ document date.

**UI**
- Invoices, receipts, quotes and POs get a status dropdown in the list, since a document
  previously stayed "Unpaid" forever. There's also a Notes field, printed on the document.
- Escape closes any modal. Save buttons disable while posting, to prevent double entries on a
  double click.
- Any API failure without its own handler now shows an error toast instead of failing silently.
- New-document, recurring-template and journal modals keep what's been typed when a line is
  added or removed. Pickers show only active customers and vendors. An inactive account still
  shows on an old journal line being edited.
- New accounts get a default category and normal balance from their type. Partial payments show
  an amber badge in the registers. Print labels match the document type ("Vendor",
  "Expected Delivery", "Valid Until"). The void-entry prompt reads properly.

**Deliberately left alone**: recurring dates set to the 29th–31st drift to the 28th after a
short month (needs an anchor-day column); Customer/Vendor "Outstanding" counts Partial entries at
their full amount (there's no partial-payment amount stored to subtract).

## Current state / open items

- Windows `.exe` build has not been visually confirmed on a real Windows machine by anyone other
  than through the GitHub Actions pipeline succeeding — worth a real end-to-end check.
- Linux `.deb`/`.AppImage` icon and permission fixes are pushed and locally rebuilt but similarly
  await a real install/launch confirmation outside this sandboxed environment.
- No automated test suite exists — all verification in this session was manual/scripted
  API-and-DOM-level checking, not a committed test harness.
