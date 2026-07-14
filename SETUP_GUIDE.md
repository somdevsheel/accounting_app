# Setup Guide (Windows & Linux)

Step-by-step instructions for getting Accrued running, on either platform, whichever way fits
what you're trying to do. If you just want to *use* the app, look for **"Just run it"** below —
skip the build/dev sections entirely. See [`README.md`](README.md) for architecture/technical
detail and [`USER_GUIDE.md`](USER_GUIDE.md) for how to use the app once it's open.

## Contents

- [Windows](#windows)
- [Linux](#linux)
- [First launch, either platform](#first-launch-either-platform)
- [Troubleshooting](#troubleshooting)
- [Uninstalling / starting over](#uninstalling--starting-over)

## Windows

### Just run it (recommended)

1. Get `Accrued Setup 1.0.0.exe` — either someone gave you the file directly, or build it
   yourself with **zero local installs** via GitHub Actions:
   - Push this repo to GitHub (if it isn't already).
   - On GitHub: **Actions** tab → **Build Windows installer** → **Run workflow**.
   - Wait for the run to finish (a few minutes), open it, download **Accrued-Windows-Installer**
     under **Artifacts**, unzip it.
2. Double-click `Accrued Setup 1.0.0.exe` and follow the installer.
3. Launch **Accrued** from the Start Menu. First launch takes a few seconds longer (the backend
   is starting up behind the animated splash screen) — after that it's instant.
4. You'll land on the **Setup Wizard** — see [First launch](#first-launch-either-platform) below.

Nothing else to install. No Python, no Node — the backend is bundled into the installer as a
standalone executable.

### Build it yourself, locally

Only needed if you don't want to use GitHub Actions and prefer building directly on your own
Windows machine.

**Prerequisites**: [Python 3.10+](https://python.org) (tick **"Add python.exe to PATH"** during
install) and [Node.js 18+ LTS](https://nodejs.org).

```powershell
git clone https://github.com/somdevsheel/accounting_app.git
cd accounting_app

# 1. Set up the backend and freeze it into a standalone executable
cd backend
python -m venv venv
venv\Scripts\pip install -r requirements.txt
venv\Scripts\pip install -r requirements-build.txt
venv\Scripts\python build_backend.py

# 2. Package the desktop app (bundles the frozen backend automatically)
cd ..\electron
npm install
npm run dist
```

The installer appears in `electron\dist\Accrued Setup 1.0.0.exe`. Run it as in the section above.

### Run from source (development only)

For actively changing the code — skips freezing/packaging entirely, launches straight from
source with hot-editable frontend files.

```powershell
git clone https://github.com/somdevsheel/accounting_app.git
cd accounting_app

cd backend
python -m venv venv
venv\Scripts\pip install -r requirements.txt

cd ..\electron
npm install
npm start
```

`npm start` spawns the backend and opens the app window. Edit files under `frontend/` and reload
the window (Ctrl+R) to see changes — no build step. Backend changes need the app restarted.

## Linux

### Just run it (recommended)

1. Get `Accrued-1.0.0.AppImage` — either from someone else's build, or build it yourself (see
   below; there's no Actions workflow for Linux yet, only Windows).
2. Make it executable and run it:
   ```bash
   chmod +x Accrued-1.0.0.AppImage
   ./Accrued-1.0.0.AppImage
   ```
   (No installation step — an AppImage runs directly. Optionally move it somewhere permanent
   like `~/Applications/` and create a desktop shortcut.)
3. You'll land on the **Setup Wizard** — see [First launch](#first-launch-either-platform) below.

### Build it yourself, locally

**Prerequisites**: Python 3.10+ and Node.js 18+.

```bash
# Debian/Ubuntu, if you need to install them:
sudo apt install python3 python3-venv python3-pip nodejs npm

git clone https://github.com/somdevsheel/accounting_app.git
cd accounting_app

# 1. Set up the backend and freeze it into a standalone executable
cd backend
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
./venv/bin/pip install -r requirements-build.txt
./venv/bin/python build_backend.py

# 2. Package the desktop app (bundles the frozen backend automatically)
cd ../electron
npm install
npm run dist
```

The AppImage appears in `electron/dist/Accrued-1.0.0.AppImage`. Run it as in the section above.

### Run from source (development only)

```bash
git clone https://github.com/somdevsheel/accounting_app.git
cd accounting_app

cd backend
python3 -m venv venv
./venv/bin/pip install -r requirements.txt

cd ../electron
npm install
npm start
```

Same as Windows dev mode: edit `frontend/` files and reload (Ctrl+R) to see changes instantly;
restart the app after backend changes.

## First launch, either platform

On a brand-new install (empty database) you land on a **Setup Wizard**, not a dashboard:

1. **Company Profile** — name, legal structure, country, currency, financial year start month,
   registration/tax ID.
2. **Owners / Partners** — one row per owner; each gets a matching Capital account automatically.
3. **Tax Configuration** — name your tax (GST/VAT/Sales Tax/...) and its rates.
4. **Chart of Accounts** — a generic default template, pre-filled and editable right there.

Everything here stays editable afterward from **Settings → Company Info / Settings**. The wizard
never reappears once a company exists — see [Uninstalling / starting over](#uninstalling--starting-over)
if you want a genuinely fresh install for testing.

## Troubleshooting

If the app shows **"Failed to start backend"**, the error screen tells you the actual cause
(port conflict, missing dependency, missing interpreter, crashed backend, etc.) — see the
detailed breakdown of each message in [`README.md`](README.md#packaging-into-an-installer-windows-exe-macos-dmg-linux-appimage).

Common ones:
- **Port 8000 already in use** — something else on your machine is using it. Close that program,
  or find and stop the process holding the port (Windows: `netstat -ano | findstr :8000`, then
  `taskkill /PID <pid> /F`; Linux: `ss -ltnp | grep :8000`, then `kill <pid>`).
- **Running from source and it can't find a module** — you're in dev mode without a frozen
  backend; run `pip install -r requirements.txt` from `backend/` using the same Python/venv the
  app is using.

## Uninstalling / starting over

- **Windows**: uninstall via Settings → Apps, same as any other program.
- **Linux**: just delete the `.AppImage` file — nothing else was installed.
- **Reset to a fresh company** (keep the app installed, wipe the data): delete
  `<install dir>/resources/backend/data/company.db` (packaged) or `backend/data/company.db`
  (running from source), then relaunch — the Setup Wizard appears again like a first-ever install.
