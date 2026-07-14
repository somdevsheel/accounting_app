"""Freeze the backend into a standalone executable with PyInstaller, so the
packaged Electron app never needs Python installed on the user's machine.

Usage:
    pip install -r requirements-build.txt
    python build_backend.py

Output: dist/accrued-backend/ (a folder electron-builder bundles as-is via
extraResources — see electron/package.json). PyInstaller output is platform-
specific, so this must be run once per target OS (Linux build -> Linux
backend, Windows build -> Windows backend, etc.) — there is no cross-compiling.
"""
import PyInstaller.__main__

APP_NAME = "accrued-backend"

# uvicorn/pydantic/fastapi all do some import-time and lazy magic that
# PyInstaller's static analysis doesn't always catch — collect everything for
# each rather than hand-maintaining a --hidden-import list that silently goes
# stale as dependencies update.
COLLECT_ALL = ["uvicorn", "fastapi", "starlette", "pydantic", "pydantic_core", "sqlalchemy", "anyio"]

args = [
    "run_server.py",
    "--name", APP_NAME,
    "--onedir",
    "--noconfirm",
    "--clean",
    "--console",  # keep stdout/stderr visible to Electron's spawn() pipes
]
for pkg in COLLECT_ALL:
    args += ["--collect-all", pkg]

if __name__ == "__main__":
    PyInstaller.__main__.run(args)
    print(f"\nDone. Frozen backend is at backend/dist/{APP_NAME}/")
