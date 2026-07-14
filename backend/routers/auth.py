import datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from accounting.auth import hash_password, new_token, verify_password
from database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])

SESSION_LIFETIME_HOURS = 24 * 14


def get_current_user(x_auth_token: str | None = Header(None), db: Session = Depends(get_db)) -> models.User:
    if not x_auth_token:
        raise HTTPException(401, "Not logged in")
    session = db.query(models.UserSession).filter(models.UserSession.token == x_auth_token).first()
    if not session or session.expires_at < datetime.datetime.utcnow():
        raise HTTPException(401, "Session expired — please log in again")
    if not session.user or not session.user.is_active:
        raise HTTPException(401, "Account is inactive")
    return session.user


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role != "Admin":
        raise HTTPException(403, "Only an Admin can do this")
    return user


@router.get("/status", response_model=schemas.AuthStatusOut)
def auth_status(db: Session = Depends(get_db)):
    return {"auth_enabled": db.query(models.User).count() > 0}


@router.post("/bootstrap-admin", response_model=schemas.LoginOut)
def bootstrap_admin(payload: schemas.BootstrapAdminIn, db: Session = Depends(get_db)):
    if db.query(models.User).count() > 0:
        raise HTTPException(400, "Login is already enabled for this company — ask an Admin to create your account")
    if len(payload.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    password_hash, salt = hash_password(payload.password)
    user = models.User(username=payload.username, password_hash=password_hash, password_salt=salt, role="Admin", is_active=True)
    db.add(user)
    db.flush()
    token = new_token()
    db.add(models.UserSession(
        token=token, user_id=user.id,
        expires_at=datetime.datetime.utcnow() + datetime.timedelta(hours=SESSION_LIFETIME_HOURS),
    ))
    db.commit()
    db.refresh(user)
    return {"token": token, "user": user}


@router.post("/login", response_model=schemas.LoginOut)
def login(payload: schemas.LoginIn, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == payload.username).first()
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash, user.password_salt):
        raise HTTPException(401, "Incorrect username or password")
    token = new_token()
    db.add(models.UserSession(
        token=token, user_id=user.id,
        expires_at=datetime.datetime.utcnow() + datetime.timedelta(hours=SESSION_LIFETIME_HOURS),
    ))
    db.commit()
    return {"token": token, "user": user}


@router.post("/logout")
def logout(x_auth_token: str | None = Header(None), db: Session = Depends(get_db)):
    if x_auth_token:
        db.query(models.UserSession).filter(models.UserSession.token == x_auth_token).delete()
        db.commit()
    return {"ok": True}


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(get_current_user)):
    return user


@router.get("/users", response_model=list[schemas.UserOut])
def list_users(db: Session = Depends(get_db), _admin: models.User = Depends(require_admin)):
    return db.query(models.User).order_by(models.User.username).all()


@router.post("/users", response_model=schemas.UserOut)
def create_user(payload: schemas.UserCreateIn, db: Session = Depends(get_db), _admin: models.User = Depends(require_admin)):
    if db.query(models.User).filter(models.User.username == payload.username).first():
        raise HTTPException(400, f"Username '{payload.username}' is already taken")
    if len(payload.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    if payload.role not in ("Admin", "Accountant", "Viewer"):
        raise HTTPException(400, "Role must be Admin, Accountant, or Viewer")
    password_hash, salt = hash_password(payload.password)
    user = models.User(username=payload.username, password_hash=password_hash, password_salt=salt, role=payload.role, is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=schemas.UserOut)
def update_user(user_id: int, payload: schemas.UserUpdateIn, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    user = db.query(models.User).get(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if payload.is_active is False and user.id == admin.id:
        raise HTTPException(400, "You can't deactivate your own account")
    if payload.is_active is False:
        remaining_admins = db.query(models.User).filter(
            models.User.role == "Admin", models.User.is_active.is_(True), models.User.id != user.id
        ).count()
        if user.role == "Admin" and remaining_admins == 0:
            raise HTTPException(400, "Can't deactivate the last active Admin")
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.password:
        if len(payload.password) < 6:
            raise HTTPException(400, "Password must be at least 6 characters")
        user.password_hash, user.password_salt = hash_password(payload.password)
    db.commit()
    db.refresh(user)
    return user
