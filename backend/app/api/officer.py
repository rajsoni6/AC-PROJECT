"""
api/officer.py — Election Officer endpoints
Steps 4 & 5: Document verification + eligibility approval
"""
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import require_officer
from app.models.user import User, VoterProfile, Role, VerificationStatus
from app.models.election import AuditLog
from fastapi.responses import Response
from app.crypto import (
    sha256_hex, sha256_bytes, hmac_sha256,
    sign_payload, ed25519_generate_keypair,
    aes_gcm_decrypt, derive_kek, unwrap_dek
)
from app.core.config import settings

router = APIRouter(prefix="/officer", tags=["Election Officer"])

HMAC_KEY = sha256_bytes(settings.SECRET_KEY)

# Officer Ed25519 key pair (in production: stored securely per officer)
_OFFICER_KEYS: dict = {}


def _get_officer_key(officer_id: str):
    if officer_id not in _OFFICER_KEYS:
        _OFFICER_KEYS[officer_id] = ed25519_generate_keypair()
    return _OFFICER_KEYS[officer_id]


async def _log(db, user_id, action, resource=None, details=None, signature=None):
    detail_str = json.dumps(details or {})
    evidence = sha256_hex(f"{action}{resource}{detail_str}")
    hmac_tag = hmac_sha256(HMAC_KEY, evidence)
    log = AuditLog(
        user_id=user_id, action=action, resource=resource,
        details=details, evidence_hash=evidence, hmac_tag=hmac_tag,
        signature=signature
    )
    db.add(log)


@router.get("/pending-verifications")
async def pending_verifications(
    status: str = "pending",
    current_user: User = Depends(require_officer),
    db: AsyncSession = Depends(get_db),
):
    """List voters pending verification with their encrypted document metadata."""
    try:
        vs = VerificationStatus(status)
    except ValueError:
        vs = VerificationStatus.PENDING

    r = await db.execute(
        select(VoterProfile, User)
        .join(User, VoterProfile.user_id == User.id)
        .where(VoterProfile.verification_status == vs)
    )
    rows = r.all()

    # fetch officer names for verified_by
    officer_ids = [p.verified_by for p, u in rows if p.verified_by]
    officers = {}
    if officer_ids:
        or_r = await db.execute(select(User).where(User.id.in_(officer_ids)))
        for o in or_r.scalars().all():
            officers[str(o.id)] = o.email

    return [
        {
            "user_id": str(p.user_id),
            "full_name": u.full_name,
            "email": u.email,
            "id_document_type": p.id_document_type,
            "date_of_birth": p.date_of_birth,
            "nationality": p.nationality,
            "constituency": p.constituency,
            "document_hash": p.document_hash,
            "verification_status": p.verification_status.value,
            "officer_signature": p.officer_signature,
            "verified_by_email": officers.get(str(p.verified_by)) if p.verified_by else None,
            "verified_at": p.verified_at.isoformat() if p.verified_at else None,
            "submitted_at": p.date_of_birth,
        }
        for p, u in rows
    ]


class VerifyAction(BaseModel):
    action: str   # "approve" or "reject"


@router.get("/document/{voter_user_id}")
async def get_voter_document(
    voter_user_id: str,
    current_user: User = Depends(require_officer),
    db: AsyncSession = Depends(get_db),
):
    """Decrypt and return voter's identity document for officer review."""
    r = await db.execute(select(VoterProfile).where(VoterProfile.user_id == voter_user_id))
    profile = r.scalar_one_or_none()
    if not profile:
        raise HTTPException(404, "Voter profile not found")
    if not profile.encrypted_document_ciphertext:
        raise HTTPException(404, "No document uploaded")

    try:
        master = bytes.fromhex(settings.DOCUMENT_ENCRYPTION_KEY)
        kek = derive_kek(master, f"voter:{voter_user_id}")
        dek = unwrap_dek(kek, profile.wrapped_dek)
        aad = f"voter:{voter_user_id}:doc".encode()
        file_bytes = aes_gcm_decrypt(
            dek,
            profile.encrypted_document_nonce,
            profile.encrypted_document_ciphertext,
            profile.encrypted_document_tag,
            aad,
        )
    except Exception:
        raise HTTPException(500, "Document decryption failed")

    await _log(db, current_user.id, "document_viewed", voter_user_id, {})
    await db.commit()

    # Detect content type from magic bytes
    if file_bytes[:4] == b"%PDF":
        media_type = "application/pdf"
    elif file_bytes[:2] in (b"\xff\xd8", b"\x89P"):
        media_type = "image/jpeg" if file_bytes[:2] == b"\xff\xd8" else "image/png"
    else:
        media_type = "application/octet-stream"

    doc_type = profile.id_document_type or "document"
    return Response(
        content=file_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{doc_type}_{voter_user_id[:8]}"'},
    )


@router.post("/verify/{voter_user_id}")
async def verify_voter(
    voter_user_id: str,
    req: VerifyAction,
    current_user: User = Depends(require_officer),
    db: AsyncSession = Depends(get_db),
):
    """
    Step 4 & 5: Officer approves/rejects voter.
    - Approval signed with officer's Ed25519 key
    - SHA-256 audit fingerprint generated
    """
    r = await db.execute(select(VoterProfile).where(VoterProfile.user_id == voter_user_id))
    profile = r.scalar_one_or_none()
    if not profile:
        raise HTTPException(404, "Voter profile not found")

    if req.action == "approve":
        profile.verification_status = VerificationStatus.APPROVED
        profile.verified_by = current_user.id
        profile.verified_at = datetime.utcnow()

        # Ed25519 officer signature on approval
        priv, pub = _get_officer_key(str(current_user.id))
        approval_payload = {
            "voter_id": voter_user_id,
            "document_hash": profile.document_hash,
            "officer_id": str(current_user.id),
            "approved_at": datetime.utcnow().isoformat(),
        }
        profile.officer_signature = sign_payload(priv, approval_payload)

        await _log(db, current_user.id, "voter_approved", voter_user_id,
                   {"doc_hash": profile.document_hash}, signature=profile.officer_signature)

    elif req.action == "reject":
        profile.verification_status = VerificationStatus.REJECTED
        profile.verified_by = current_user.id
        profile.verified_at = datetime.utcnow()
        await _log(db, current_user.id, "voter_rejected", voter_user_id)
    else:
        raise HTTPException(400, "Action must be 'approve' or 'reject'")

    await db.commit()
    return {"message": f"Voter {req.action}d", "officer_signature": profile.officer_signature}
