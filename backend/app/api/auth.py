"""
api/auth.py — Registration (Voter only), Login, Admin user management
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from typing import Optional
import re

from app.core.database import get_db
from app.core.security import (
    create_access_token, create_refresh_token,
    decode_token, get_current_user, require_admin
)
from app.models.user import User, VoterProfile, Role, VerificationStatus
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserResponse
from app.crypto import hash_password, verify_password, sha256_hex, ed25519_generate_keypair

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ── Step 1: Voter Registration (role always = voter) ─────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Public registration — always creates VOTER role only."""
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Email already registered")

    pw_hash = hash_password(req.password)
    _, pub_pem = ed25519_generate_keypair()

    user = User(
        email=req.email,
        full_name=req.full_name,
        password_hash=pw_hash,
        role=Role.VOTER,          # always voter
        public_key_pem=pub_pem,
    )
    db.add(user)
    await db.flush()

    db.add(VoterProfile(user_id=user.id))
    await db.commit()
    await db.refresh(user)

    return TokenResponse(
        access_token=create_access_token(str(user.id), user.role.value),
        refresh_token=create_refresh_token(str(user.id)),
        role=user.role.value,
        user_id=str(user.id),
        full_name=user.full_name,
    )


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(401, "Invalid credentials")
    if not user.is_active:
        raise HTTPException(403, "Account disabled")

    return TokenResponse(
        access_token=create_access_token(str(user.id), user.role.value),
        refresh_token=create_refresh_token(str(user.id)),
        role=user.role.value,
        user_id=str(user.id),
        full_name=user.full_name,
    )


# ── Me ────────────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    is_verified = False
    if current_user.role == Role.VOTER:
        r = await db.execute(select(VoterProfile).where(VoterProfile.user_id == current_user.id))
        profile = r.scalar_one_or_none()
        is_verified = profile is not None and profile.verification_status == VerificationStatus.APPROVED
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role.value,
        is_active=current_user.is_active,
        is_verified=is_verified,
    )


# ── Admin: Add Officer / Trustee ──────────────────────────────────────────────

class AddUserRequest(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: str   # election_officer or trustee

    def validate_role(self):
        allowed = ["election_officer", "trustee"]
        if self.role not in allowed:
            raise HTTPException(400, f"Role must be one of: {allowed}")


@router.post("/admin/add-user", response_model=UserResponse, status_code=201)
async def admin_add_user(
    req: AddUserRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Super Admin adds election_officer or trustee accounts."""
    req.validate_role()

    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Email already registered")

    _, pub_pem = ed25519_generate_keypair()
    user = User(
        email=req.email,
        full_name=req.full_name,
        password_hash=hash_password(req.password),
        role=Role(req.role),
        public_key_pem=pub_pem,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return UserResponse(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        role=user.role.value,
        is_active=user.is_active,
    )


@router.get("/admin/users")
async def list_users(
    role: Optional[str] = None,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Super Admin: list all users, optionally filter by role."""
    q = select(User)
    if role:
        try:
            q = q.where(User.role == Role(role))
        except ValueError:
            pass
    r = await db.execute(q.order_by(User.created_at.desc()))
    users = r.scalars().all()
    return [
        {
            "id": str(u.id),
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role.value,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@router.patch("/admin/users/{user_id}/toggle")
async def toggle_user(
    user_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Super Admin: activate / deactivate a user."""
    r = await db.execute(select(User).where(User.id == user_id))
    user = r.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    if str(user.id) == str(current_user.id):
        raise HTTPException(400, "Cannot deactivate yourself")
    user.is_active = not user.is_active
    await db.commit()
    return {"id": str(user.id), "is_active": user.is_active}
