# Accrued — Local-First Desktop Accounting Software

A lightweight, self-hostable double-entry accounting app for small and medium businesses.
Everything runs on your own machine — a Python/FastAPI backend, a plain HTML/CSS/JS frontend,
wrapped in an Electron desktop shell. All data lives in a single SQLite file
(`backend/data/company.db`). No cloud, no accounts, no telemetry, no CDN calls — it works fully
offline.

On first launch you get a Setup Wizard (company profile, owners/partners, tax configuration,
chart of accounts) instead of a dashboard pre-loaded with someone else's data. Nothing is
hardcoded to a specific business.

See [`SETUP_GUIDE.md`](SETUP_GUIDE.md) for step-by-step install/build instructions on Windows and
Linux, [`USER_GUIDE.md`](USER_GUIDE.md) for day-to-day how-tos (e.g. recording an owner's capital
contribution), and [`CHANGELOG.md`](CHANGELOG.md) for what's been built, why, and what's been
deliberately deferred.

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

The packaged app is **fully standalone** — no separate Python install, no `pip install`, nothing
for whoever installs it to set up. This works by freezing the backend into a native executable
with PyInstaller and bundling that instead of Python source. Building has two steps:

**1. Freeze the backend** (once per target OS — PyInstaller does not cross-compile, so a build
done on Linux only runs on Linux, a build done on Windows only runs on Windows, etc.):

```bash
cd backend
./venv/bin/pip install -r requirements-build.txt   # venv\Scripts\pip on Windows
./venv/bin/python build_backend.py                  # venv\Scripts\python on Windows
```

This produces `backend/dist/accrued-backend/` — a self-contained folder with the Python
interpreter, every dependency, and the app itself already baked in.

**2. Package the Electron shell**, which bundles that frozen output automatically:

```bash
cd electron
npm run dist
```

The installer is written to `electron/dist/` (e.g. `Accrued Setup 1.0.0.exe` on Windows). At
runtime, `electron/main.js` looks for the frozen executable first (see
`resolveBackendCommand()`) and only falls back to a system/venv Python if no frozen build is
present — which is what lets plain `npm start` keep working from source during development
without freezing anything.

**Don't have Python/Node on the machine you'd build Windows on?** `.github/workflows/
build-windows.yml` builds the Windows installer on GitHub's own Windows runners — nothing to
install locally. Push to GitHub, then in the repo's **Actions** tab select "Build Windows
installer" → **Run workflow**. When it finishes, the `.exe` is attached to that run under
**Artifacts** (a `.zip` containing it — download and unzip). It's manual-trigger only (not run on
every push) so it doesn't spend Actions minutes unless you ask for a build.

**Building the Windows `.exe`** specifically:

- **From Windows** (required for step 1 — see the no-cross-compiling note above; also the
  simplest path for step 2): run both steps directly on a Windows machine with Python 3.10+ and
  Node.js installed.
- **Cross-building step 2 from Linux/macOS** (only relevant if you already have a Windows-built
  `backend/dist/accrued-backend/` from step 1, e.g. copied over from a Windows machine):
  electron-builder needs `wine` for the code-signing/resource-editing step
  (`sudo apt install wine` on Debian/Ubuntu, `brew install --cask wine-stable` on macOS). Without
  it the build fails at the "signing" step with `wine is required`.

**If the app shows "Failed to start backend"** — since a packaged, double-clicked `.exe` has no
visible console, `main.js` captures the backend's stdout/stderr and surfaces it directly in that
error screen instead of just a generic timeout, so the message you see should say what actually
happened:
- *"Could not launch the bundled backend executable..."* — the frozen build exists but failed to
  start (antivirus quarantine, corrupted install). Try reinstalling.
- *"Could not find a Python interpreter..."* — no frozen backend was bundled **and** no Python
  was found on the machine either. This means step 1 above was skipped before packaging; freeze
  the backend and rebuild.
- *"Port 8000 is already being used..."* — something else on the machine already has port 8000
  (this is detected from the actual bind error, not guessed).
- *"...exited immediately (code N)..."* with a Python traceback — only possible when running
  from source (no frozen build); almost always `ModuleNotFoundError`, fixed by `pip install -r
  requirements.txt` from `backend/`.
- Plain *"Backend did not become healthy in time"* with no other detail — the process started
  and kept running but never answered on port 8000; check nothing else is bound to that port.

**Where user data lives once packaged**: Electron's own per-user data directory — `~/.config/
Accrued/company.db` on Linux, `%APPDATA%\Accrued\company.db`, C:\Users\user\AppData\Local\Programs\Accrued\resources\backend\data on Windows, `~/Library/Application
Support/Accrued/company.db` on Mac (`app.getPath("userData")`, set explicitly via the
`ACCRUED_DATA_DIR` environment variable — see `backend/database.py`). **Not** inside the install
directory itself: the `.deb` target installs to `/opt/Accrued`, owned by root, so a database
living there would be unwritable by whichever regular user actually runs the app — this bit us
for real the first time the `.deb` target was added (AppImage and the per-user Windows install
happen to be user-writable, which is exactly why it went unnoticed until then).

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
