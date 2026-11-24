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
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.models.user import User, VoterProfile, Role, VerificationStatus
from app.models.election import Election, Candidate, Ballot, BulletinEntry, ElectionStatus, AuditLog
from app.crypto import (
    aes_gcm_encrypt, aes_gcm_decrypt,
    sha256_hex, sha256_bytes,
    ed25519_sign, ed25519_verify, sign_payload, verify_payload,
    elgamal_encrypt, elgamal_add,
    zkp_prove_vote, zkp_verify_vote,
    zkp_prove_encryption_of_one, zkp_verify_encryption_of_one,
    zkp_group_parameters, derive_eligibility_secret, verify_eligibility_proof,
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
    locked_profile = await db.execute(
        select(VoterProfile)
        .where(VoterProfile.user_id == current_user.id)
        .with_for_update()
    )
    profile = locked_profile.scalar_one_or_none()
    if not profile:
        raise HTTPException(404, "Voter profile not found")

    if profile.verification_status != VerificationStatus.APPROVED:
        return {"status": "pending", "message": "Awaiting officer verification"}

    sys_priv, sys_pub = _get_system_keys()
    seed = _get_system_seed()
    secret = derive_eligibility_secret(seed, str(current_user.id))
    params = zkp_group_parameters()
    credential_public_key = str(pow(int(params["g"]), secret, int(params["p"])))

    # Reuse an existing signed token when possible. Legacy QR records are
    # reissued with the same nullifier so their ballots and receipts remain linked.
    if profile.qr_code_data:
        try:
            token_data = json.loads(profile.qr_code_data)
            stored_token = token_data.get("qr_token")
            if stored_token and profile.credential_token and profile.credential_nullifier:
                envelope = _decode_qr_token(stored_token)
                payload = envelope["payload"]
                signature = envelope["signature"]
                if (
                    signature == profile.credential_token
                    and payload.get("nullifier") == profile.credential_nullifier
                    and payload.get("voter_id_hash") == sha256_hex(str(current_user.id))
                    and payload.get("credential_public_key") == credential_public_key
                    and verify_payload(sys_pub, payload, signature)
                ):
                    return _credential_response(
                        token_data.get("qr_b64"), stored_token, profile.credential_nullifier,
                        signature, payload["issued_at"], secret, params,
                    )
        except Exception:
            # Refresh malformed or legacy QR records below.
            pass

    nullifier = profile.credential_nullifier or sha256_hex(
        f"{current_user.id}:credential:{secrets.token_hex(16)}"
    )
    credential_payload = {
        "nullifier": nullifier,
        "voter_id_hash": sha256_hex(str(current_user.id)),
        "credential_public_key": credential_public_key,
        "issued_at": datetime.utcnow().isoformat(),
    }
    sig = sign_payload(sys_priv, credential_payload)
    token_str = base64.b64encode(json.dumps(
        {"payload": credential_payload, "signature": sig}, separators=(",", ":")
    ).encode()).decode()

    qr = qrcode.QRCode(version=1, box_size=8, border=2)
    qr.add_data(token_str)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode()

    profile.credential_nullifier = nullifier
    profile.credential_token = sig
    profile.qr_code_data = json.dumps({
        "qr_b64": qr_b64, "qr_token": token_str, "issued_at": credential_payload["issued_at"]
    })
    await _log(db, current_user.id, "qr_generated", str(current_user.id))
    await db.commit()
    return _credential_response(qr_b64, token_str, nullifier, sig, credential_payload["issued_at"], secret, params)


def _credential_response(qr_b64, token, nullifier, signature, issued_at, secret, params):
    return {
        "status": "ready", "qr_code_base64": qr_b64, "qr_token": token,
        "nullifier": nullifier, "credential_signature": signature, "issued_at": issued_at,
        "eligibility_secret": str(secret), "zkp_params": params,
    }


def _decode_qr_token(token: str) -> dict:
    decoded = json.loads(base64.b64decode(token, validate=True))
    if not isinstance(decoded, dict) or not isinstance(decoded.get("payload"), dict):
        raise ValueError("Malformed QR credential")
    if not isinstance(decoded.get("signature"), str):
        raise ValueError("Malformed QR signature")
    return decoded


def _get_system_seed() -> bytes:
    seed_hex = settings.SYSTEM_SIGNING_KEY
    if seed_hex:
        try:
            seed = bytes.fromhex(seed_hex)
        except ValueError as exc:
            raise RuntimeError("SYSTEM_SIGNING_KEY must be 64 hex characters") from exc
        if len(seed) != 32:
            raise RuntimeError("SYSTEM_SIGNING_KEY must be 64 hex characters")
        return seed
    return hashlib.sha256(settings.SECRET_KEY.encode()).digest()


def _get_system_keys():
    """Load a stable Ed25519 signing key pair across API restarts."""
    if not hasattr(_get_system_keys, "_keys"):
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        key = Ed25519PrivateKey.from_private_bytes(_get_system_seed())
        private_pem = key.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ).decode()
        public_pem = key.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode()
        _get_system_keys._keys = (private_pem, public_pem)
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
        credential_nullifier = sha256_hex(f"{profile.credential_nullifier or str(current_user.id)}:{e.id}")
        legacy_nullifier = sha256_hex(f"{current_user.id}:{e.id}")
        voted_r = await db.execute(select(Ballot.id).where(
            Ballot.nullifier.in_({credential_nullifier, legacy_nullifier})
        ))
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
    expected_nationality = policy.get("nationality")
    if expected_nationality and str(expected_nationality).lower() != "any":
        if profile.nationality != expected_nationality:
            return False
    expected_constituency = policy.get("constituency")
    if expected_constituency and str(expected_constituency).lower() != "any":
        if profile.constituency != expected_constituency:
            return False
    if policy.get("min_age"):
        if not profile.date_of_birth:
            return False
        try:
            dob = datetime.strptime(profile.date_of_birth, "%Y-%m-%d").date()
            age = (date.today() - dob).days // 365
            if age < int(policy["min_age"]):
                return False
        except Exception:
            return False
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
    qr_token: str = Field(min_length=1, max_length=4096)
    eligibility_proof: dict


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
    if not profile.credential_nullifier or not profile.credential_token:
        raise HTTPException(403, "Voting credential has not been issued")

    try:
        credential = _decode_qr_token(req.qr_token)
        credential_payload = credential["payload"]
        credential_signature = credential["signature"]
    except Exception:
        raise HTTPException(403, "Invalid QR credential")
    _, system_public_key = _get_system_keys()
    if (
        credential_signature != profile.credential_token
        or credential_payload.get("nullifier") != profile.credential_nullifier
        or credential_payload.get("voter_id_hash") != sha256_hex(str(current_user.id))
        or not verify_payload(system_public_key, credential_payload, credential_signature)
    ):
        raise HTTPException(403, "QR credential is invalid or does not belong to this voter")

    # Load election
    r = await db.execute(select(Election).where(Election.id == election_id))
    election = r.scalar_one_or_none()
    if not election or election.status != ElectionStatus.OPEN:
        raise HTTPException(400, "Election not open")

    # ABAC check
    if not _check_abac(profile, election.eligibility_policy or {}):
        raise HTTPException(403, "Not eligible for this election")

    # Prove possession of the secret bound to this signed, officer-approved credential.
    zkp_context = f"{election_id}:{profile.credential_nullifier}"
    try:
        credential_public_key = int(credential_payload["credential_public_key"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(403, "QR credential does not contain an eligibility key")
    if not verify_eligibility_proof(req.eligibility_proof, credential_public_key, zkp_context):
        raise HTTPException(403, "Eligibility zero-knowledge proof is invalid")

    # A previous pre-QR ballot must still block a second ballot after credential issuance.
    legacy_nullifier = sha256_hex(f"{current_user.id}:{election_id}")
    legacy_vote = await db.execute(select(Ballot.id).where(Ballot.nullifier == legacy_nullifier))
    if legacy_vote.scalar_one_or_none():
        raise HTTPException(409, "A ballot is already recorded for this voter in this election")

    # Nullifier — prevents double voting (SHA-256)
    nullifier = sha256_hex(f"{profile.credential_nullifier}:{election_id}")
    existing = await db.execute(select(Ballot).where(Ballot.nullifier == nullifier))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Already voted in this election")

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
    candidate_proofs = {}
    aggregate_c1, aggregate_c2, aggregate_randomness = 1, 1, 0
    for c in candidates:
        m = 1 if str(c.id) == req.candidate_id else 0
        c1, c2, randomness = elgamal_encrypt(m, pub_int, return_randomness=True)
        proof = zkp_prove_vote(m, randomness, pub_int, c1, c2)
        if not zkp_verify_vote(proof, c1, c2, pub_int):
            raise HTTPException(500, "Ballot zero-knowledge proof generation failed")
        candidate_proofs[str(c.id)] = proof
        aggregate_c1 = (aggregate_c1 * c1) % pub_int["p"]
        aggregate_c2 = (aggregate_c2 * c2) % pub_int["p"]
        aggregate_randomness = (aggregate_randomness + randomness) % pub_int["q"]
        encrypted_votes.append({"candidate_id": str(c.id), "c1": str(c1), "c2": str(c2)})
    one_hot_proof = zkp_prove_encryption_of_one(
        aggregate_randomness, aggregate_c1, aggregate_c2, pub_int
    )
    if not zkp_verify_encryption_of_one(one_hot_proof, aggregate_c1, aggregate_c2, pub_int):
        raise HTTPException(500, "One-candidate ballot proof generation failed")
    zkp_proof = {
        "eligibility": req.eligibility_proof,
        "candidate_bits": candidate_proofs,
        "one_hot": one_hot_proof,
    }

    # Ballot commitment (SHA-256)
    commitment_data = json.dumps(encrypted_votes, sort_keys=True)
    commitment = sha256_hex(commitment_data)

    # Create ballot (atomic transaction)
    ballot = Ballot(
        election_id=election_id,
        nullifier=nullifier,
        encrypted_votes=encrypted_votes,
        commitment=commitment,
        zkp_proof=zkp_proof,
    )
    db.add(ballot)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Already voted in this election")

    # Bulletin board entry
    sys_priv, _ = _get_system_keys()
    entry_sig = sign_payload(sys_priv, {"commitment": commitment, "ballot_id": str(ballot.id)})

    # Rebuild Merkle tree with all ballots
    all_ballots_r = await db.execute(select(Ballot).where(Ballot.election_id == election_id))
    all_ballots = all_ballots_r.scalars().all()
    all_commitments = [b.commitment for b in all_ballots]
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
    receipt_payload = {
        "ballot_id": str(ballot.id), "commitment": commitment,
        "nullifier": nullifier, "election_id": str(election_id),
    }
    receipt_sig = sign_payload(sys_priv, receipt_payload)
    ballot.receipt_payload = receipt_payload
    ballot.receipt_signature = receipt_sig

    await _log(db, current_user.id, "vote_cast", election_id, {"nullifier": nullifier[:16]})
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Vote could not be recorded because it was already submitted")

    return {
        "message": "Vote cast successfully",
        "commitment": commitment,
        "nullifier": nullifier,
        "receipt_signature": receipt_sig,
        "receipt_payload": receipt_payload,
        "eligibility_zkp_verified": True,
        "ballot_zkp_verified": True,
        "merkle_root": tree.root,
    }


# ── Step 15: Voter receipts ───────────────────────────────────────────────────

@router.get("/receipts")
async def get_receipts(
    current_user: User = Depends(require_role(Role.VOTER)),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_profile(current_user, db)

    elections_r = await db.execute(select(Election))
    elections = elections_r.scalars().all()

    receipts = []
    sys_priv, sys_pub = _get_system_keys()
    recovered_receipts = False
    for e in elections:
        credential_nullifier = sha256_hex(
            f"{profile.credential_nullifier or current_user.id}:{e.id}"
        )
        legacy_nullifier = sha256_hex(f"{current_user.id}:{e.id}")
        b_r = await db.execute(select(Ballot).where(
            Ballot.nullifier.in_({credential_nullifier, legacy_nullifier})
        ))
        for ballot in b_r.scalars().all():
            entry_r = await db.execute(select(BulletinEntry).where(BulletinEntry.ballot_id == ballot.id))
            entry = entry_r.scalar_one_or_none()
            receipt_payload = ballot.receipt_payload
            receipt_sig = ballot.receipt_signature
            receipt_recovered = False
            if not receipt_payload or not receipt_sig:
                receipt_payload = {
                    "ballot_id": str(ballot.id), "commitment": ballot.commitment,
                    "nullifier": ballot.nullifier, "election_id": str(e.id),
                }
                receipt_sig = sign_payload(sys_priv, receipt_payload)
                ballot.receipt_payload = receipt_payload
                ballot.receipt_signature = receipt_sig
                receipt_recovered = True
                recovered_receipts = True
            signature_valid = bool(
                receipt_payload and receipt_sig
                and verify_payload(sys_pub, receipt_payload, receipt_sig)
            )
            receipts.append({
                "ballot_id": str(ballot.id),
                "election_title": e.title,
                "commitment": ballot.commitment,
                "nullifier": ballot.nullifier,
                "receipt_signature": receipt_sig,
                "receipt_payload": receipt_payload,
                "signature_valid": signature_valid,
                "receipt_recovered": receipt_recovered,
                "legacy_credential_vote": ballot.nullifier == legacy_nullifier,
                "merkle_root": entry.merkle_root if entry else None,
                "submitted_at": ballot.submitted_at.isoformat(),
            })
    if recovered_receipts:
        await db.commit()
    return receipts
