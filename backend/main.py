"""FastAPI application entrypoint: mounts API routers and serves the frontend SPA."""
import datetime
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import models
from database import SessionLocal, init_db
from routers import accounts, assets, auth, inventory, invoices, journal, loans, masters, payroll, recurring, reports, setup

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# ACCRUED_FRONTEND_DIR lets the Electron shell tell a frozen backend exactly
# where the static frontend was unpacked to, since a PyInstaller build's own
# location is not a reliable base for a "../frontend" relative path.
FRONTEND_DIR = os.environ.get("ACCRUED_FRONTEND_DIR") or os.path.normpath(os.path.join(BASE_DIR, "..", "frontend"))

app = FastAPI(title="Accrued - Desktop Accounting Software")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths reachable with no login at all, even once login has been enabled for
# this company — the setup wizard and the auth handshake itself must always work.
AUTH_EXEMPT_PATHS = {
    "/api/health",
    "/api/setup/status",
    "/api/setup/defaults",
    "/api/setup/complete",
    "/api/auth/status",
    "/api/auth/bootstrap-admin",
    "/api/auth/login",
}


@app.middleware("http")
async def enforce_login_if_enabled(request: Request, call_next):
    """Login is entirely opt-in: if nobody has ever created a User account for
    this company, every request passes through untouched — identical to the
    app's original single-user behavior. The moment a first Admin account
    exists (via Settings -> Users & Access), every /api/* request below needs
    a valid session token, and Viewer accounts are limited to read-only."""
    path = request.url.path
    if not path.startswith("/api/") or path in AUTH_EXEMPT_PATHS:
        return await call_next(request)

    db = SessionLocal()
    try:
        if db.query(models.User).count() == 0:
            return await call_next(request)

        token = request.headers.get("x-auth-token")
        session = db.query(models.UserSession).filter(models.UserSession.token == token).first() if token else None
        if not session or session.expires_at < datetime.datetime.utcnow():
            return JSONResponse(status_code=401, content={"detail": "Please log in to continue"})
        user = session.user
        if not user or not user.is_active:
            return JSONResponse(status_code=401, content={"detail": "Account is inactive"})
        writes_own_session = path == "/api/auth/logout"
        if user.role == "Viewer" and request.method not in ("GET", "HEAD", "OPTIONS") and not writes_own_session:
            return JSONResponse(status_code=403, content={"detail": "Viewer accounts are read-only"})
    finally:
        db.close()

    return await call_next(request)


@app.on_event("startup")
def on_startup():
    init_db()


app.include_router(setup.router)
app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(journal.router)
app.include_router(reports.router)
app.include_router(masters.router)
app.include_router(assets.router)
app.include_router(loans.router)
app.include_router(invoices.router)
app.include_router(recurring.router)
app.include_router(inventory.router)
app.include_router(payroll.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


if os.path.isdir(FRONTEND_DIR):
    app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")

    @app.get("/")
    def index():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))
