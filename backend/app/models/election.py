"""
models/election.py — Election, Candidate, Ballot, BulletinBoard, AuditLog
"""
import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    Column, String, Boolean, DateTime, Enum, Text,
    ForeignKey, Integer, JSON, BigInteger, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class ElectionStatus(str, PyEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    OPEN = "open"
    CLOSED = "closed"
    TALLYING = "tallying"
    COMPLETED = "completed"


class Election(Base):
    __tablename__ = "elections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(Enum(ElectionStatus), default=ElectionStatus.DRAFT)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)

    # ABAC eligibility rules (JSON policy)
    eligibility_policy = Column(JSON, nullable=True)
    # e.g. {"nationality": "Indian", "min_age": 18, "constituency": "any"}

    # ElGamal public key for this election
    elgamal_public_key = Column(JSON, nullable=True)   # {p, g, q, h} as strings
    elgamal_private_key_encrypted = Column(JSON, nullable=True)  # AES-encrypted

    # Shamir shares (trustee distribution)
    trustee_shares = Column(JSON, nullable=True)       # [{trustee_id, share_x, share_y_enc}]
    trustee_approvals = Column(JSON, nullable=True)    # {trustee_email: share_index}
    threshold = Column(Integer, default=3)
    total_trustees = Column(Integer, default=5)

    # Election config signature (Ed25519)
    config_signature = Column(Text, nullable=True)

    # Tally results
    tally_c1 = Column(Text, nullable=True)   # homomorphic sum ciphertext
    tally_c2 = Column(Text, nullable=True)
    final_result = Column(JSON, nullable=True)
    result_signature = Column(Text, nullable=True)
    final_snapshot_hash = Column(String(64), nullable=True)

    candidates = relationship("Candidate", back_populates="election")
    ballots = relationship("Ballot", back_populates="election")
    bulletin_entries = relationship("BulletinEntry", back_populates="election")


class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    election_id = Column(UUID(as_uuid=True), ForeignKey("elections.id"), nullable=False)
    name = Column(String(255), nullable=False)
    party = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    position = Column(Integer, nullable=False)   # ordering index

    election = relationship("Election", back_populates="candidates")


class Ballot(Base):
    __tablename__ = "ballots"
    __table_args__ = (UniqueConstraint("election_id", "nullifier", name="uq_ballot_election_nullifier"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    election_id = Column(UUID(as_uuid=True), ForeignKey("elections.id"), nullable=False)

    # Nullifier prevents double voting (SHA-256 of credential + election_id)
    nullifier = Column(String(64), unique=True, nullable=False, index=True)

    # Encrypted vote (ElGamal ciphertext per candidate)
    encrypted_votes = Column(JSON, nullable=False)   # [{candidate_id, c1, c2}]

    # ZKP for valid vote
    zkp_proof = Column(JSON, nullable=True)

    # Ballot commitment (SHA-256)
    commitment = Column(String(64), nullable=False)

    # Persist the exact signed receipt generated in the vote transaction.
    receipt_payload = Column(JSON, nullable=True)
    receipt_signature = Column(Text, nullable=True)

    # Merkle inclusion
    merkle_index = Column(Integer, nullable=True)

    submitted_at = Column(DateTime, default=datetime.utcnow)

    election = relationship("Election", back_populates="ballots")


class BulletinEntry(Base):
    __tablename__ = "bulletin_board"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    election_id = Column(UUID(as_uuid=True), ForeignKey("elections.id"), nullable=False)
    ballot_id = Column(UUID(as_uuid=True), ForeignKey("ballots.id"), nullable=False)
    commitment = Column(String(64), nullable=False)
    merkle_root = Column(String(64), nullable=True)
    entry_signature = Column(Text, nullable=True)   # Ed25519
    posted_at = Column(DateTime, default=datetime.utcnow)

    election = relationship("Election", back_populates="bulletin_entries")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    action = Column(String(200), nullable=False)
    resource = Column(String(200), nullable=True)
    details = Column(JSON, nullable=True)
    ip_address = Column(String(50), nullable=True)
    evidence_hash = Column(String(64), nullable=True)   # SHA-256
    hmac_tag = Column(String(64), nullable=True)        # HMAC-SHA-256
    signature = Column(Text, nullable=True)             # Ed25519
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="audit_logs")
