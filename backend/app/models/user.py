"""
models/user.py — Voter, Officer, Admin, Trustee models with RBAC roles
"""
import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    Column, String, Boolean, DateTime, Enum, Text,
    ForeignKey, Integer, JSON
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class Role(str, PyEnum):
    VOTER = "voter"
    ELECTION_OFFICER = "election_officer"
    TRUSTEE = "trustee"
    SUPER_ADMIN = "super_admin"


class VerificationStatus(str, PyEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    password_hash = Column(String(512), nullable=False)
    role = Column(Enum(Role), nullable=False, default=Role.VOTER)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    public_key_pem = Column(Text, nullable=True)

    # Relationship — explicitly specify which FK to use
    voter_profile = relationship(
        "VoterProfile",
        back_populates="user",
        uselist=False,
        foreign_keys="VoterProfile.user_id",
        primaryjoin="User.id == VoterProfile.user_id",
    )
    audit_logs = relationship("AuditLog", back_populates="user")


class VoterProfile(Base):
    __tablename__ = "voter_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)

    # ABAC attributes
    date_of_birth = Column(String(20), nullable=True)
    nationality = Column(String(100), nullable=True)
    constituency = Column(String(200), nullable=True)
    id_document_type = Column(String(50), nullable=True)

    # AES-256-GCM encrypted document
    encrypted_document_nonce = Column(Text, nullable=True)
    encrypted_document_ciphertext = Column(Text, nullable=True)
    encrypted_document_tag = Column(Text, nullable=True)
    document_hash = Column(String(64), nullable=True)
    wrapped_dek = Column(JSON, nullable=True)

    # Verification
    verification_status = Column(Enum(VerificationStatus), default=VerificationStatus.PENDING)
    verified_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    verified_at = Column(DateTime, nullable=True)
    officer_signature = Column(Text, nullable=True)

    # Anonymous credential
    credential_token = Column(Text, nullable=True)
    credential_nullifier = Column(String(64), nullable=True)
    qr_code_data = Column(Text, nullable=True)

    # Relationship — explicitly use user_id FK only
    user = relationship(
        "User",
        back_populates="voter_profile",
        foreign_keys=[user_id],
        primaryjoin="VoterProfile.user_id == User.id",
    )
