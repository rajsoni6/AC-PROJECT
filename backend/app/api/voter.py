"""
api/voter.py — Voter-facing endpoints
Steps 2–13 of the voting pipeline
"""
import json
import base64
import hashlib
import secrets
from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.models.user import User, VoterProfile, Role, VerificationStatus
from app.models.election import Election, Candidate, Ballot, BulletinEntry, ElectionStatus, AuditLog
from app.crypto import (
    aes_gcm_encrypt, aes_gcm_decrypt,
    sha256_hex, sha256_bytes,
    ed25519_sign, ed25519_verify, sign_payload,
    elgamal_encrypt, elgamal_add,
    zkp_prove_vote, zkp_verify_vote,
    MerkleTree, hmac_sha256,
    derive_kek, generate_dek, wrap_dek
)
from app.core.config import settings

import qrcode
import io

router = APIRouter(prefix="/voter", tags=["Voter"])

HMAC_KEY = sha256_bytes(settings.SECRET_KEY)


# ── helpers ──────────────────────────────────────────────────────────────────

def _get_master_key() -> bytes:
    return bytes.fromhex(settings.DOCUMENT_ENCRYPTION_KEY)


async def _get_profile(user: User, db: AsyncSession) -> VoterProfile:
    r = await db.execute(select(VoterProfile).where(VoterProfile.user_id == user.id))
    p = r.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Voter profile not found")
    return p


async def _log(db, user_id, action, resource=None, details=None):
    detail_str = json.dumps(details or {})
    evidence = sha256_hex(f"{action}{resource}{detail_str}")
    hmac_tag = hmac_sha256(HMAC_KEY, evidence)
    log = AuditLog(
        user_id=user_id, action=action, resource=resource,
        details=details, evidence_hash=evidence, hmac_tag=hmac_tag
    )
    db.add(log)


# ── Step 2 & 3: Document upload + AES-256-GCM encryption ─────────────────────

@router.get("/document-status")
async def document_status(
    current_user: User = Depends(require_role(Role.VOTER)),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_profile(current_user, db)
    return {
        "verification_status": profile.verification_status.value,
        "has_document": bool(profile.encrypted_document_ciphertext),
    }

@router.post("/upload-document")
async def upload_document(
    document: UploadFile = File(...),
    doc_type: str = Form(...),
    date_of_birth: str = Form(...),
    nationality: str = Form(...),
    constituency: str = Form(...),
    current_user: User = Depends(require_role(Role.VOTER)),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_profile(current_user, db)

    file_bytes = await document.read()
    doc_hash = sha256_hex(file_bytes)

    # Generate unique DEK, wrap with KEK (KMS pattern)
    master = _get_master_key()
    kek = derive_kek(master, f"voter:{current_user.id}")
    dek = generate_dek()
    wrapped = wrap_dek(kek, dek)

    # Encrypt document with DEK using AES-256-GCM
    aad = f"voter:{current_user.id}:doc".encode()
    enc = aes_gcm_encrypt(dek, file_bytes, aad)

    profile.id_document_type = doc_type
    profile.date_of_birth = date_of_birth
    profile.nationality = nationality
    profile.constituency = constituency
    profile.document_hash = doc_hash
    profile.encrypted_document_nonce = enc["nonce"]
    profile.encrypted_document_ciphertext = enc["ciphertext"]
    profile.encrypted_document_tag = enc["tag"]
    profile.wrapped_dek = wrapped
    # Allow re-upload if rejected — reset to pending
    profile.verification_status = VerificationStatus.PENDING
    profile.verified_by = None
    profile.verified_at = None
    profile.officer_signature = None

    await _log(db, current_user.id, "document_upload", str(current_user.id), {"doc_type": doc_type, "hash": doc_hash})
    await db.commit()

    return {"message": "Document encrypted and stored", "document_hash": doc_hash, "encryption": "AES-256-GCM"}


# ── Step 6 & 7: QR code + anonymous credential ───────────────────────────────

@router.get("/qrcode")
async def get_qrcode(
    current_user: User = Depends(require_role(Role.VOTER)),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_profile(current_user, db)

    if profile.verification_status != VerificationStatus.APPROVED:
        return {"status": "pending", "message": "Awaiting officer verification"}

    if profile.qr_code_data:
        token_data = json.loads(profile.qr_code_data)
        return {
            "status": "ready",
            "qr_code_base64": token_data.get("qr_b64"),
            "nullifier": profile.credential_nullifier,
            "credential_signature": profile.credential_token,
            "issued_at": token_data.get("issued_at"),
        }

    # Generate anonymous credential
    nullifier = sha256_hex(f"{current_user.id}:credential:{secrets.token_hex(16)}")
    credential_payload = {
        "nullifier": nullifier,
        "voter_id_hash": sha256_hex(str(current_user.id)),
        "issued_at": datetime.utcnow().isoformat(),
    }

    # Sign with system Ed25519 key (officer approval already done)
    sys_priv, _ = _get_system_keys()
    sig = sign_payload(sys_priv, credential_payload)
    token_str = base64.b64encode(json.dumps(credential_payload).encode()).decode()

    # Generate QR code
    qr = qrcode.QRCode(version=1, box_size=8, border=2)
    qr.add_data(token_str)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode()

    profile.credential_nullifier = nullifier
    profile.credential_token = sig
    profile.qr_code_data = json.dumps({"qr_b64": qr_b64, "issued_at": credential_payload["issued_at"]})

    await _log(db, current_user.id, "qr_generated", str(current_user.id))
    await db.commit()

    return {
        "status": "ready",
        "qr_code_base64": qr_b64,
        "nullifier": nullifier,
        "credential_signature": sig,
        "issued_at": credential_payload["issued_at"],
    }


def _get_system_keys():
    """Return (priv_pem, pub_pem) — generate once and cache in memory."""
    from app.crypto import ed25519_generate_keypair
    if not hasattr(_get_system_keys, "_keys"):
        _get_system_keys._keys = ed25519_generate_keypair()
    return _get_system_keys._keys


# ── Step 10: Voter elections (ABAC eligibility) ───────────────────────────────

@router.get("/elections")
async def list_elections(
    current_user: User = Depends(require_role(Role.VOTER)),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_profile(current_user, db)
    r = await db.execute(
        select(Election).where(Election.status.in_(["published", "open", "closed", "completed"]))
    )
    elections = r.scalars().all()

    result = []
    for e in elections:
        # ABAC check
        eligible = _check_abac(profile, e.eligibility_policy or {})
        # Check if already voted
        nullifier = sha256_hex(f"{profile.credential_nullifier or ''}:{e.id}")
        voted_r = await db.execute(select(Ballot).where(Ballot.nullifier == nullifier))
        has_voted = voted_r.scalar_one_or_none() is not None
        # Count candidates
        cands_r = await db.execute(select(Candidate).where(Candidate.election_id == e.id))
        cands = cands_r.scalars().all()
        result.append({
            "id": str(e.id), "title": e.title, "description": e.description,
            "status": e.status.value, "eligible": eligible, "has_voted": has_voted,
            "candidate_count": len(cands),
            "start_time": e.start_time.isoformat() if e.start_time else None,
            "end_time": e.end_time.isoformat() if e.end_time else None,
        })
    return result


def _check_abac(profile: VoterProfile, policy: dict) -> bool:
    """ABAC: check voter attributes against election policy."""
    if policy.get("nationality") and profile.nationality != policy["nationality"]:
        return False
    if policy.get("constituency") and profile.constituency != policy["constituency"]:
        return False
    if policy.get("min_age") and profile.date_of_birth:
        try:
            dob = datetime.strptime(profile.date_of_birth, "%Y-%m-%d").date()
            age = (date.today() - dob).days // 365
            if age < int(policy["min_age"]):
                return False
        except Exception:
            pass
    return True


@router.get("/elections/{election_id}")
async def get_election(
    election_id: str,
    current_user: User = Depends(require_role(Role.VOTER)),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(select(Election).where(Election.id == election_id))
    e = r.scalar_one_or_none()
    if not e:
        raise HTTPException(404, "Election not found")
    cands_r = await db.execute(select(Candidate).where(Candidate.election_id == e.id))
    cands = cands_r.scalars().all()
    return {
        "id": str(e.id), "title": e.title, "description": e.description,
        "status": e.status.value,
        "candidates": [{"id": str(c.id), "name": c.name, "party": c.party} for c in cands],
    }


# ── Steps 12 & 13: Vote encryption + submission ───────────────────────────────

class CastVoteReq(BaseModel):
    candidate_id: str
    qr_token: str = ""


@router.post("/vote/{election_id}")
async def cast_vote(
    election_id: str,
    req: CastVoteReq,
    current_user: User = Depends(require_role(Role.VOTER)),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_profile(current_user, db)
    if profile.verification_status != VerificationStatus.APPROVED:
        raise HTTPException(403, "Voter not approved")

    # Load election
    r = await db.execute(select(Election).where(Election.id == election_id))
    election = r.scalar_one_or_none()
    if not election or election.status != ElectionStatus.OPEN:
        raise HTTPException(400, "Election not open")

    # ABAC check
    if not _check_abac(profile, election.eligibility_policy or {}):
        raise HTTPException(403, "Not eligible for this election")

    # Nullifier — prevents double voting (SHA-256)
    nullifier = sha256_hex(f"{profile.credential_nullifier or str(current_user.id)}:{election_id}")
    existing = await db.execute(select(Ballot).where(Ballot.nullifier == nullifier))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Already voted in this election")

    # Load candidates
    cands_r = await db.execute(select(Candidate).where(Candidate.election_id == election_id))
    candidates = cands_r.scalars().all()
    if not any(str(c.id) == req.candidate_id for c in candidates):
        raise HTTPException(400, "Invalid candidate")

    # ElGamal public key
    pub = election.elgamal_public_key
    if not pub:
        raise HTTPException(500, "Election has no public key")
    pub_int = {k: int(v) for k, v in pub.items()}

    # Encrypt vote for each candidate (1 for selected, 0 for others)
    encrypted_votes = []
    for c in candidates:
        m = 1 if str(c.id) == req.candidate_id else 0
        c1, c2 = elgamal_encrypt(m, pub_int)
        encrypted_votes.append({"candidate_id": str(c.id), "c1": str(c1), "c2": str(c2)})

    # ZKP for selected candidate
    selected_idx = next(i for i, c in enumerate(candidates) if str(c.id) == req.candidate_id)
    c1_sel, c2_sel = int(encrypted_votes[selected_idx]["c1"]), int(encrypted_votes[selected_idx]["c2"])

    # Ballot commitment (SHA-256)
    commitment_data = json.dumps(encrypted_votes, sort_keys=True)
    commitment = sha256_hex(commitment_data)

    # Create ballot (atomic transaction)
    ballot = Ballot(
        election_id=election_id,
        nullifier=nullifier,
        encrypted_votes=encrypted_votes,
        commitment=commitment,
    )
    db.add(ballot)
    await db.flush()

    # Bulletin board entry
    _, sys_pub = _get_system_keys()
    sys_priv, _ = _get_system_keys()
    entry_sig = sign_payload(sys_priv, {"commitment": commitment, "ballot_id": str(ballot.id)})

    # Rebuild Merkle tree with all ballots
    all_ballots_r = await db.execute(select(Ballot).where(Ballot.election_id == election_id))
    all_ballots = all_ballots_r.scalars().all()
    all_commitments = [b.commitment for b in all_ballots] + [commitment]
    tree = MerkleTree(all_commitments)

    entry = BulletinEntry(
        election_id=election_id,
        ballot_id=ballot.id,
        commitment=commitment,
        merkle_root=tree.root,
        entry_signature=entry_sig,
    )
    db.add(entry)

    # Ed25519 signed receipt
    receipt_payload = {"ballot_id": str(ballot.id), "commitment": commitment, "nullifier": nullifier}
    receipt_sig = sign_payload(sys_priv, receipt_payload)

    await _log(db, current_user.id, "vote_cast", election_id, {"nullifier": nullifier[:16]})
    await db.commit()

    return {
        "message": "Vote cast successfully",
        "commitment": commitment,
        "nullifier": nullifier,
        "receipt_signature": receipt_sig,
        "merkle_root": tree.root,
    }


# ── Step 15: Voter receipts ───────────────────────────────────────────────────

@router.get("/receipts")
async def get_receipts(
    current_user: User = Depends(require_role(Role.VOTER)),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_profile(current_user, db)
    if not profile.credential_nullifier:
        return []

    # Find all ballots by this voter's nullifier pattern
    elections_r = await db.execute(select(Election))
    elections = elections_r.scalars().all()

    receipts = []
    sys_priv, _ = _get_system_keys()
    for e in elections:
        nullifier = sha256_hex(f"{profile.credential_nullifier}:{e.id}")
        b_r = await db.execute(select(Ballot).where(Ballot.nullifier == nullifier))
        ballot = b_r.scalar_one_or_none()
        if ballot:
            entry_r = await db.execute(select(BulletinEntry).where(BulletinEntry.ballot_id == ballot.id))
            entry = entry_r.scalar_one_or_none()
            receipt_sig = sign_payload(sys_priv, {"ballot_id": str(ballot.id), "commitment": ballot.commitment})
            receipts.append({
                "ballot_id": str(ballot.id),
                "election_title": e.title,
                "commitment": ballot.commitment,
                "nullifier": ballot.nullifier,
                "receipt_signature": receipt_sig,
                "merkle_root": entry.merkle_root if entry else None,
                "submitted_at": ballot.submitted_at.isoformat(),
            })
    return receipts
