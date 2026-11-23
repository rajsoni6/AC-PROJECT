"""
schemas/auth.py — Pydantic request/response schemas for auth
"""
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
import re


class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: Optional[str] = "voter"

    @field_validator("password")
    @classmethod
    def strong_password(cls, v):
        errors = []
        if len(v) < 8:
            errors.append("at least 8 characters")
        if not re.search(r"[A-Z]", v):
            errors.append("one uppercase letter")
        if not re.search(r"[0-9]", v):
            errors.append("one digit")
        if not re.search(r"[^A-Za-z0-9]", v):
            errors.append("one special character")
        if errors:
            raise ValueError("Password must contain: " + ", ".join(errors))
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: str
    user_id: str
    full_name: str


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    is_active: bool
    is_verified: bool = False

    class Config:
        from_attributes = True
