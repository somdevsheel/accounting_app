# Setup Guide (Windows & Linux)

Step-by-step instructions for getting Accrued running, on either platform, whichever way fits
what you're trying to do — including if this machine has neither Python nor Node.js installed.
See [`README.md`](README.md) for architecture/technical detail and [`USER_GUIDE.md`](USER_GUIDE.md)
for how to use the app once it's open.

## Contents

- [Windows](#windows)
- [Linux](#linux)
- [First launch, either platform](#first-launch-either-platform)
- [Troubleshooting](#troubleshooting)
- [Uninstalling / starting over](#uninstalling--starting-over)

## Windows

### Already have the installer?

1. Double-click `Accrued Setup 1.0.0.exe`. It's a normal Windows installer wizard:
   **Next** → pick an install folder (or keep the default) → **Next** → confirm the desktop/Start
   Menu shortcuts you want → **Install** → **Finish**. No admin rights needed — it installs to
   your own user profile, not `Program Files`.
2. Launch **Accrued** from the Start Menu or the desktop shortcut. First launch takes a few
   seconds longer (the backend is starting up behind the animated splash screen) — after that
   it's instant.
3. You'll land on the **Setup Wizard** — see [First launch](#first-launch-either-platform) below.

Nothing else to install — no Python, no Node needed on this machine. The backend is bundled into
the installer as a standalone executable. If you don't have the installer yet, keep reading.

### No Python, no Node on this Windows machine? (recommended)

You don't need to install either — GitHub builds the installer for you, on GitHub's own Windows
machine, for free:

1. Make sure this repo is pushed to GitHub (`git push origin main`, from any machine that has
   git — doesn't have to be this Windows one).
2. Open the repo on **github.com** in a browser and sign in.
3. Click the **Actions** tab (top of the repo page).
4. In the left sidebar, click **Build Windows installer**.
5. Click the **Run workflow** button (top right of the file list), then the green **Run
   workflow** button in the dropdown that appears. Leave the branch as `main`.
6. Wait for it to finish — refresh the page; a spinning yellow dot turns into a green checkmark
   when done (a few minutes).
7. Click into that finished run. Scroll down to **Artifacts** and click
   **Accrued-Windows-Installer** to download it — it's a `.zip` containing the real `.exe`.
8. Unzip it, then follow **"Already have the installer?"** above.

Nothing was installed on this Windows machine at any point in that process — only a web browser
was needed. Repeat these steps any time you want a fresh build after the code changes (e.g. a
new commit was pushed).

### Build it yourself, locally (needs Python + Node)

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
