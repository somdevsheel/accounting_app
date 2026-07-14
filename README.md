# Ledger — Local-First Desktop Accounting

A lightweight, self-hostable double-entry accounting app for small and medium businesses.
Everything runs on your own machine — a Python/FastAPI backend, a plain HTML/CSS/JS frontend,
wrapped in an Electron desktop shell. All data lives in a single SQLite file
(`backend/data/company.db`). No cloud, no accounts, no telemetry, no CDN calls — it works fully
offline.

On first launch you get a Setup Wizard (company profile, owners/partners, tax configuration,
chart of accounts) instead of a dashboard pre-loaded with someone else's data. Nothing is
hardcoded to a specific business.

See [`USER_GUIDE.md`](USER_GUIDE.md) for day-to-day how-tos (e.g. recording an owner's capital
contribution).

## Project layout

```
accounting-app/
  backend/       FastAPI app, SQLAlchemy models, accounting engine, SQLite database
  frontend/      Static HTML/CSS/JS single-page app (no build step, no framework)
  electron/      Desktop shell that spawns the backend and opens a window
```

## Prerequisites

- Python 3.10+
- Node.js 18+ and npm

## Setup

**1. Backend — create a virtual environment and install dependencies:**

```bash
cd backend
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

(On Windows: `venv\Scripts\pip install -r requirements.txt`)

**2. Electron — install dependencies:**

```bash
cd electron
npm install
```

## Running in development

From the `electron/` directory:

```bash
npm start
```

This spawns the FastAPI backend (`uvicorn`) as a child process, waits for it to report healthy
on `http://127.0.0.1:8000/api/health`, then opens a desktop window pointed at the app. Closing
the window shuts down the backend process automatically.

On a brand-new database you'll land on the Setup Wizard. Complete it once — company profile,
owners/partners, tax configuration, chart of accounts — and every future launch goes straight to
the dashboard. Everything entered in the wizard stays editable afterwards from **Settings →
Company Info**.

### Running the backend alone (for API testing)

```bash
cd backend
./venv/bin/uvicorn main:app --reload --port 8000
```

Then open `http://127.0.0.1:8000/` in any browser — the frontend is served as static files by
the same FastAPI app, so you don't need Electron to develop or test it.

### Resetting to a fresh company

Delete `backend/data/company.db` and restart the backend. The Setup Wizard will appear again on
next launch, exactly like a first-ever install.

## Packaging into an installer (Windows .exe, macOS .dmg, Linux AppImage)

`electron/package.json` has an `electron-builder` config already targeting `nsis` (Windows),
`dmg` (macOS) and `AppImage` (Linux). To build:

```bash
cd electron
npm run dist
```

The installer is written to `electron/dist/` (e.g. `Ledger Setup 1.0.0.exe` on Windows).

**Building the Windows `.exe`:**

- **From Windows** (recommended, no extra setup): run `npm run dist` directly on a Windows
  machine with Node.js installed. This is the simplest path and produces a working NSIS
  installer.
- **Cross-building from Linux/macOS**: electron-builder can produce a Windows installer from
  Linux, but needs `wine` for the code-signing/resource-editing step. Install it first
  (`sudo apt install wine` on Debian/Ubuntu, `brew install --cask wine-stable` on macOS), then
  run `npm run dist` from `electron/` as above. Without `wine` the build fails at the "signing"
  step with `wine is required`.

**Important caveat — Python is not bundled.** `extraResources` in `electron/package.json`
explicitly excludes `venv` from the packaged app, so the installer ships the backend *source*
but not a Python interpreter. `electron/main.js` falls back to whatever `python`/`python3` it
finds on the target machine's PATH (see `resolvePythonExecutable()`), so anyone installing the
`.exe` today still needs Python 3.10+ installed system-wide with `pip install -r
requirements.txt` run once. To make a truly standalone installer (no separate Python install
required), freeze the backend with PyInstaller into a single executable and point
`electron/main.js` at that binary instead of `python -m uvicorn` — that's the next step if
fully standalone packaging is needed, but it's out of scope for now.

## Tech notes

- **Database**: single SQLite file, created automatically on first backend startup. No
  migrations system yet — the schema is created via `SQLAlchemy.metadata.create_all()`.
- **Accounting engine** (`backend/accounting/`): general ledger, trial balance, P&L, balance
  sheet, cash flow, financial ratios, straight-line depreciation, loan amortization and tax
  summaries are all computed from `JournalEntry`/`JournalLine` rows — nothing is precomputed or
  cached, so reports are always consistent with the ledger.
- **Journal entries** are real double-entry: every entry needs ≥2 lines and
  `SUM(debit) == SUM(credit)`, enforced both client-side (live balance indicator) and
  server-side (hard rejection).
- **Currency and financial year** are read from the Company record everywhere — nothing is
  hardcoded to a specific currency symbol or calendar year.
- **Charts**: Chart.js, vendored into `frontend/js/vendor/chart.min.js` — no CDN, works offline.
