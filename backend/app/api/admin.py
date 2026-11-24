"""
api/admin.py — Super Admin endpoints
Steps 8–21: Election creation, trustee distribution, tally, results, audit
"""
import json
import hashlib
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional, List

from app.core.database import get_db
from app.core.security import require_admin, require_trustee, require_role, get_current_user
from app.models.user import User, Role
from app.models.election import (
    Election, Candidate, Ballot, BulletinEntry, AuditLog, ElectionStatus
)
from app.crypto import (
    elgamal_keygen, elgamal_decrypt, elgamal_add,
    shamir_split, shamir_reconstruct,
    ed25519_generate_keypair, sign_payload, verify_payload,
    sha256_hex, sha256_bytes, hmac_sha256,
    MerkleTree, zkp_verify_vote, zkp_verify_encryption_of_one,
    aes_gcm_encrypt, aes_gcm_decrypt, derive_kek
)
from app.core.config import settings

router = APIRouter(prefix="/admin", tags=["Admin"])


def _share_master_key() -> bytes:
    configured = settings.TRUSTEE_SHARE_ENCRYPTION_KEY or settings.SYSTEM_SIGNING_KEY
    if configured:
        try:
            key = bytes.fromhex(configured)
        except ValueError as exc:
            raise RuntimeError("TRUSTEE_SHARE_ENCRYPTION_KEY must be 64 hex characters") from exc
        if len(key) != 32:
            raise RuntimeError("TRUSTEE_SHARE_ENCRYPTION_KEY must be 64 hex characters")
        return key
    return sha256_bytes(settings.SECRET_KEY)


def _seal_share(share: dict) -> dict:
    owner = share["trustee_id"]
    index = int(share["index"])
    aad = f"trustee-share:v1:{owner}:{index}".encode()
    key = derive_kek(_share_master_key(), f"trustee-share:{owner}")
    encrypted = aes_gcm_encrypt(key, json.dumps({"x": share["x"], "y": share["y"]}).encode(), aad)
    return {"index": index, "trustee_id": owner, "encrypted_share": encrypted}


def _open_share(share: dict) -> dict:
    if "encrypted_share" not in share:
        return {"x": share["x"], "y": share["y"]}
    owner = share["trustee_id"]
    index = int(share["index"])
    aad = f"trustee-share:v1:{owner}:{index}".encode()
    key = derive_kek(_share_master_key(), f"trustee-share:{owner}")
    wrapped = share["encrypted_share"]
    raw = aes_gcm_decrypt(key, wrapped["nonce"], wrapped["ciphertext"], wrapped["tag"], aad)
    return json.loads(raw)


def _all_ballot_proofs_verified(ballots, election) -> bool:
    """Re-check persisted ballot ZKPs before reporting a positive verification status.

    Eligibility proofs are verified before a ballot is inserted; their presence is
    required here alongside cryptographic re-verification of the stored ballot proofs.
    """
    if not ballots or not election.elgamal_public_key:
        return False
    pub = {key: int(value) for key, value in election.elgamal_public_key.items()}
    p = pub["p"]
    for ballot in ballots:
        proof = ballot.zkp_proof or {}
        if not isinstance(proof.get("eligibility"), dict) or not proof["eligibility"]:
            return False
        candidate_proofs = proof.get("candidate_bits")
        if not isinstance(candidate_proofs, dict) or not ballot.encrypted_votes:
            return False
        candidate_ids = {item.get("candidate_id") for item in ballot.encrypted_votes}
        if None in candidate_ids or set(candidate_proofs) != candidate_ids:
            return False
        aggregate_c1, aggregate_c2 = 1, 1
        try:
            for item in ballot.encrypted_votes:
                c1, c2 = int(item["c1"]), int(item["c2"])
                if not zkp_verify_vote(candidate_proofs[item["candidate_id"]], c1, c2, pub):
                    return False
                aggregate_c1 = aggregate_c1 * c1 % p
                aggregate_c2 = aggregate_c2 * c2 % p
            if not zkp_verify_encryption_of_one(
                proof.get("one_hot", {}), aggregate_c1, aggregate_c2, pub
            ):
                return False
        except (KeyError, TypeError, ValueError):
            return False
    return True


HMAC_KEY = sha256_bytes(settings.SECRET_KEY)

# Stable system Ed25519 key. Set SYSTEM_SIGNING_KEY to a persistent 32-byte hex seed.
_SYS_PRIV: str = ""
_SYS_PUB: str = ""


def _sys_keys():
    global _SYS_PRIV, _SYS_PUB
    if not _SYS_PRIV:
        seed_hex = settings.SYSTEM_SIGNING_KEY
        seed = bytes.fromhex(seed_hex) if seed_hex else hashlib.sha256(settings.SECRET_KEY.encode()).digest()
        if len(seed) != 32:
            raise RuntimeError("SYSTEM_SIGNING_KEY must be a 32-byte hex seed")
        private_key = Ed25519PrivateKey.from_private_bytes(seed)
        _SYS_PRIV = private_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ).decode()
        _SYS_PUB = private_key.public_key().public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode()
    return _SYS_PRIV, _SYS_PUB


async def _log(db, user_id, action, resource=None, details=None):
    detail_str = json.dumps(details or {})
    evidence = sha256_hex(f"{action}{resource}{detail_str}")
    hmac_tag = hmac_sha256(HMAC_KEY, evidence)
    priv, _ = _sys_keys()
    sig = sign_payload(priv, {"action": action, "evidence": evidence})
    log = AuditLog(
        user_id=user_id, action=action, resource=resource,
        details=details, evidence_hash=evidence, hmac_tag=hmac_tag, signature=sig
    )
    db.add(log)


@router.get("/trustee-count")
async def get_trustee_count(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return count of active trustees in the system."""
    r = await db.execute(
        select(func.count()).where(User.role == Role.TRUSTEE, User.is_active == True)
    )
    count = r.scalar()
    trustees_r = await db.execute(
        select(User).where(User.role == Role.TRUSTEE, User.is_active == True)
    )
    trustees = trustees_r.scalars().all()
    return {
        "count": count,
        "trustees": [{"id": str(t.id), "email": t.email, "full_name": t.full_name} for t in trustees]
    }


# ── Election CRUD ─────────────────────────────────────────────────────────────

class CandidateIn(BaseModel):
    name: str
    party: str = ""


class EligibilityPolicy(BaseModel):
    nationality: str = ""
    min_age: int = 18
    constituency: str = ""


class CreateElectionReq(BaseModel):
    title: str
    description: str = ""
    eligibility_policy: EligibilityPolicy = EligibilityPolicy()
    candidates: List[CandidateIn]
    threshold: int = 3
    total_trustees: int = 5


@router.post("/elections", status_code=201)
async def create_election(
    req: CreateElectionReq,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Step 8: Create election
    - ElGamal key pair generated
    - Ed25519 signs election config
    - Shamir splits private key into trustee shares
    """
    # Validate trustee count
    tc = await db.execute(
        select(func.count()).where(User.role == Role.TRUSTEE, User.is_active == True)
    )
    actual_trustees = tc.scalar()
    if actual_trustees < 2:
        raise HTTPException(400, "Add at least two active trustees before creating an election.")
    if req.total_trustees != actual_trustees:
        raise HTTPException(400, "Total trustees is fixed to the current number of active trustee accounts. Refresh and try again.")
    if req.threshold < 2:
        raise HTTPException(400, "Threshold must be at least 2 trustees.")
    if req.total_trustees > actual_trustees:
        raise HTTPException(400, f"Only {actual_trustees} active trustees exist. Cannot create {req.total_trustees} shares.")
    if req.threshold > req.total_trustees:
        raise HTTPException(400, f"Threshold ({req.threshold}) cannot exceed total trustees ({req.total_trustees}).")
    trustee_rows = await db.execute(
        select(User).where(User.role == Role.TRUSTEE, User.is_active.is_(True))
        .order_by(User.id).limit(req.total_trustees)
    )
    assigned_trustees = trustee_rows.scalars().all()

    # ElGamal keygen
    keys = elgamal_keygen()
    pub = keys["public"]
    priv = keys["private"]

    # Convert to string for JSON storage (BigInt safe)
    pub_str = {k: str(v) for k, v in pub.items()}

    # Shamir split of private key x
    x = priv["x"]
    shares = shamir_split(x, req.total_trustees, req.threshold)
    trustee_shares = [
        {"index": i, "trustee_id": str(assigned_trustees[i].id), "x": str(s[0]), "y": str(s[1])}
        for i, s in enumerate(shares)
    ]
    trustee_shares = [_seal_share(share) for share in trustee_shares]

    # Ed25519 sign election config
    sys_priv, sys_pub = _sys_keys()
    config_payload = {
        "title": req.title,
        "threshold": req.threshold,
        "total_trustees": req.total_trustees,
        "elgamal_h": pub_str["h"][:32],
    }
    config_sig = sign_payload(sys_priv, config_payload)

    election = Election(
        title=req.title,
        description=req.description,
        created_by=current_user.id,
        eligibility_policy=req.eligibility_policy.model_dump(),
        elgamal_public_key=pub_str,
        # The private exponent is retained only as Shamir shares, not as a
        # plaintext copy in the election row.
        elgamal_private_key_encrypted=None,
        trustee_shares=trustee_shares,
        threshold=req.threshold,
        total_trustees=req.total_trustees,
        config_signature=config_sig,
    )
    db.add(election)
    await db.flush()

    for i, c in enumerate(req.candidates):
        db.add(Candidate(election_id=election.id, name=c.name, party=c.party, position=i))

    await _log(db, current_user.id, "election_created", str(election.id), {"title": req.title})
    await db.commit()

    return {
        "election_id": str(election.id),
        "elgamal_public_key_preview": pub_str["h"][:40] + "…",
        "config_signature": config_sig,
        "total_trustees": req.total_trustees,
        "threshold": req.threshold,
        "trustees_count": req.total_trustees,
    }


@router.get("/elections")
async def list_elections(
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Election)
    if status:
        statuses = [s.strip() for s in status.split(",")]
        q = q.where(Election.status.in_(statuses))
    r = await db.execute(q)
    elections = r.scalars().all()

    # Trustees only see elections for which a share was assigned at creation.
    if current_user.role == Role.TRUSTEE:
        trustee_id = str(current_user.id)
        elections = [
            election for election in elections
            if any(str(share.get("trustee_id")) == trustee_id
                   for share in (election.trustee_shares or []))
        ]

    result = []
    for e in elections:
        bc = await db.execute(select(func.count()).where(Ballot.election_id == e.id))
        cc = await db.execute(select(func.count()).where(Candidate.election_id == e.id))
        result.append({
            "id": str(e.id), "title": e.title, "description": e.description,
            "status": e.status.value,
            "ballot_count": bc.scalar(),
            "candidate_count": cc.scalar(),
        })
    return result


@router.post("/elections/{election_id}/publish")
async def publish_election(election_id: str, current_user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return await _change_status(election_id, ElectionStatus.PUBLISHED, current_user, db, "election_published")


@router.post("/elections/{election_id}/open")
async def open_election(election_id: str, current_user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return await _change_status(election_id, ElectionStatus.OPEN, current_user, db, "election_opened")


@router.post("/elections/{election_id}/close")
async def close_election(election_id: str, current_user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    e = await _get_election(election_id, db)
    # SHA-256 final snapshot hash
    ballots_r = await db.execute(select(Ballot).where(Ballot.election_id == election_id))
    ballots = ballots_r.scalars().all()
    snapshot_data = json.dumps([b.commitment for b in ballots], sort_keys=True)
    snapshot_hash = sha256_hex(snapshot_data)
    priv, _ = _sys_keys()
    snapshot_sig = sign_payload(priv, {"snapshot_hash": snapshot_hash, "election_id": election_id})
    e.final_snapshot_hash = snapshot_hash
    e.status = ElectionStatus.CLOSED
    await _log(db, current_user.id, "election_closed", election_id, {"snapshot_hash": snapshot_hash})
    await db.commit()
    return {"message": "Election closed", "snapshot_hash": snapshot_hash, "snapshot_signature": snapshot_sig}


async def _change_status(election_id, new_status, user, db, action):
    e = await _get_election(election_id, db)
    e.status = new_status
    await _log(db, user.id, action, election_id)
    await db.commit()
    return {"message": f"Status changed to {new_status.value}"}


async def _get_election(election_id: str, db: AsyncSession) -> Election:
    r = await db.execute(select(Election).where(Election.id == election_id))
    e = r.scalar_one_or_none()
    if not e:
        raise HTTPException(404, "Election not found")
    return e


# ── Trustee shares ────────────────────────────────────────────────────────────

@router.get("/elections/{election_id}/shares")
async def get_shares(
    election_id: str,
    current_user: User = Depends(require_trustee),
    db: AsyncSession = Depends(get_db),
):
    """Step 9: Return Shamir shares + existing approvals."""
    e = await _get_election(election_id, db)
    shares = e.trustee_shares or []
    approvals = e.trustee_approvals or {}   # {trustee_id: share_index}
    if current_user.role == Role.SUPER_ADMIN:
        return {
            "threshold": e.threshold,
            "total": e.total_trustees,
            "approval_count": len(approvals),
            "approvals": {},
        }
    if shares and not all(share.get("trustee_id") for share in shares):
        if not e.elgamal_private_key_encrypted or "x" not in e.elgamal_private_key_encrypted:
            raise HTTPException(409, "Legacy election shares cannot be safely migrated; recreate this election")
        active_rows = await db.execute(
            select(User).where(User.role == Role.TRUSTEE, User.is_active.is_(True))
            .order_by(User.id).limit(e.total_trustees)
        )
        trustees = active_rows.scalars().all()
        if len(trustees) < e.total_trustees:
            raise HTTPException(409, "Not enough active trustees to migrate this election")
        x = int(e.elgamal_private_key_encrypted["x"])
        new_shares = shamir_split(x, e.total_trustees, e.threshold)
        shares = [
            {"index": i, "trustee_id": str(trustees[i].id), "x": str(s[0]), "y": str(s[1])}
            for i, s in enumerate(new_shares)
        ]
        shares = [_seal_share(share) for share in shares]
        e.trustee_shares = shares
        e.trustee_approvals = {}
        e.elgamal_private_key_encrypted = None
        await db.commit()
        approvals = {}
    elif shares and any("encrypted_share" not in share for share in shares):
        shares = [_seal_share(share) for share in shares]
        e.trustee_shares = shares
        await db.commit()
    own_share = next((share for share in shares if share.get("trustee_id") == str(current_user.id)), None)
    if not own_share:
        raise HTTPException(403, "No trustee share is assigned to your account for this election")
    own_secret_share = _open_share(own_share)
    return {
        "my_share_index": own_share["index"],
        "my_share_x": own_secret_share["x"],
        "my_share_y": own_secret_share["y"],
        "threshold": e.threshold,
        "total": e.total_trustees,
        "approvals": approvals,          # {trustee_email: index}
        "approval_count": len(approvals),
    }


class TrusteeApproveReq(BaseModel):
    share_index: int


@router.post("/elections/{election_id}/trustee-approve")
async def trustee_approve(
    election_id: str,
    req: TrusteeApproveReq,
    current_user: User = Depends(require_role(Role.TRUSTEE)),
    db: AsyncSession = Depends(get_db),
):
    """Trustee submits their share approval. Auto-triggers tally when threshold met."""
    e = await _get_election(election_id, db)
    shares = e.trustee_shares or []
    if req.share_index < 0 or req.share_index >= len(shares):
        raise HTTPException(400, "Invalid share index")
    if shares[req.share_index].get("trustee_id") != str(current_user.id):
        raise HTTPException(403, "This share is not assigned to your trustee account")

    approvals = dict(e.trustee_approvals or {})
    trustee_key = current_user.email

    if trustee_key in approvals:
        del approvals[trustee_key]   # toggle off
    else:
        if any(index == req.share_index for index in approvals.values()):
            raise HTTPException(409, "This trustee share is already approved")
        approvals[trustee_key] = req.share_index

    e.trustee_approvals = approvals
    await db.commit()

    tally_data = None
    tally_error = None
    # Auto-trigger tally when threshold first met
    if len(approvals) >= e.threshold and e.status == ElectionStatus.CLOSED and not e.final_result:
        approved_indices = list(approvals.values())[:e.threshold]
        selected = [shares[i] for i in approved_indices]
        try:
            pub = {k: int(v) for k, v in e.elgamal_public_key.items()}
            share_tuples = [
                (int(_open_share(share)["x"]), int(_open_share(share)["y"]))
                for share in selected
            ]
            reconstructed_x = shamir_reconstruct(share_tuples)
            if pow(pub["g"], reconstructed_x, pub["p"]) != pub["h"]:
                raise ValueError("Approved shares did not reconstruct the election key")
            priv_rec = {"x": reconstructed_x, "p": pub["p"], "g": pub["g"], "q": pub["q"]}

            ballots_r = await db.execute(select(Ballot).where(Ballot.election_id == election_id))
            ballots = ballots_r.scalars().all()
            cands_r = await db.execute(select(Candidate).where(Candidate.election_id == election_id))
            candidates = cands_r.scalars().all()

            results = []
            for c in candidates:
                c1_sum, c2_sum = 1, 1
                for b in ballots:
                    for ev in b.encrypted_votes:
                        if ev["candidate_id"] == str(c.id):
                            c1_sum = (c1_sum * int(ev["c1"])) % pub["p"]
                            c2_sum = (c2_sum * int(ev["c2"])) % pub["p"]
                vote_count = elgamal_decrypt(c1_sum, c2_sum, priv_rec)
                results.append({"candidate_id": str(c.id), "candidate_name": c.name, "votes": vote_count})

            total = len(ballots)
            for r in results:
                r["percentage"] = round(r["votes"] / total * 100, 1) if total > 0 else 0
            winner_votes = max((r["votes"] for r in results), default=0)
            for r in results:
                r["is_winner"] = r["votes"] == winner_votes and winner_votes > 0

            tally_hash = sha256_hex(json.dumps(results, sort_keys=True))
            priv_sys, _ = _sys_keys()
            result_sig = sign_payload(priv_sys, {"tally_hash": tally_hash, "election_id": election_id})

            e.final_result = results
            e.result_signature = result_sig
            e.status = ElectionStatus.TALLYING
            await _log(db, current_user.id, "tally_computed", election_id, {"tally_hash": tally_hash})
            await db.commit()

            tally_data = {"results": results, "total_votes": total,
                          "tally_hash": tally_hash, "result_signature": result_sig,
                          "zkp_verified": _all_ballot_proofs_verified(ballots, e)}
        except Exception as exc:
            await db.rollback()
            tally_error = f"Trustee approval saved, but threshold tally failed: {exc}"

    return {
        "approval_count": len(approvals),
        "approvals": approvals,
        "tally": tally_data,
        "tally_error": tally_error,
    }


# ── Tally ─────────────────────────────────────────────────────────────────────

@router.post("/elections/{election_id}/tally")
async def compute_tally(
    election_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Steps 17–19: Use trustee approvals from DB → Shamir reconstruct → Homomorphic tally
    """
    e = await _get_election(election_id, db)
    approvals = e.trustee_approvals or {}
    if len(approvals) < e.threshold:
        raise HTTPException(400, f"Need at least {e.threshold} trustee approvals. Currently {len(approvals)}.")

    shares = e.trustee_shares or []
    approved_indices = list(approvals.values())[:e.threshold]
    selected = [shares[i] for i in approved_indices]
    pub = {k: int(v) for k, v in e.elgamal_public_key.items()}
    share_tuples = [
        (int(_open_share(share)["x"]), int(_open_share(share)["y"]))
        for share in selected
    ]
    reconstructed_x = shamir_reconstruct(share_tuples)
    if pow(pub["g"], reconstructed_x, pub["p"]) != pub["h"]:
        raise HTTPException(400, "Approved Shamir shares do not match the election public key")
    priv_reconstructed = {"x": reconstructed_x, "p": pub["p"], "g": pub["g"], "q": pub["q"]}

    # Load all ballots
    ballots_r = await db.execute(select(Ballot).where(Ballot.election_id == election_id))
    ballots = ballots_r.scalars().all()

    # Load candidates
    cands_r = await db.execute(select(Candidate).where(Candidate.election_id == election_id))
    candidates = cands_r.scalars().all()

    # Homomorphic sum per candidate
    results = []
    for c in candidates:
        c1_sum, c2_sum = 1, 1
        for b in ballots:
            for ev in b.encrypted_votes:
                if ev["candidate_id"] == str(c.id):
                    c1_sum = (c1_sum * int(ev["c1"])) % pub["p"]
                    c2_sum = (c2_sum * int(ev["c2"])) % pub["p"]
        vote_count = elgamal_decrypt(c1_sum, c2_sum, priv_reconstructed)
        results.append({"candidate_id": str(c.id), "candidate_name": c.name, "votes": vote_count})

    total = len(ballots)
    for r in results:
        r["percentage"] = round(r["votes"] / total * 100, 1) if total > 0 else 0
    winner_votes = max((r["votes"] for r in results), default=0)
    for r in results:
        r["is_winner"] = r["votes"] == winner_votes and winner_votes > 0

    tally_hash = sha256_hex(json.dumps(results, sort_keys=True))
    priv_sys, _ = _sys_keys()
    result_sig = sign_payload(priv_sys, {"tally_hash": tally_hash, "election_id": election_id})

    e.final_result = results
    e.result_signature = result_sig
    e.status = ElectionStatus.TALLYING

    await _log(db, current_user.id, "tally_computed", election_id, {"tally_hash": tally_hash})
    await db.commit()

    return {
        "results": results,
        "total_votes": total,
        "tally_hash": tally_hash,
        "result_signature": result_sig,
        "zkp_verified": _all_ballot_proofs_verified(ballots, e),
    }


@router.get("/elections/{election_id}/result")
async def get_result(election_id: str, db: AsyncSession = Depends(get_db)):
    e = await _get_election(election_id, db)
    if not e.final_result:
        raise HTTPException(404, "No result yet")
    bc = await db.execute(select(func.count()).where(Ballot.election_id == election_id))
    ballot_rows = await db.execute(select(Ballot).where(Ballot.election_id == election_id))
    ballots = ballot_rows.scalars().all()
    return {
        "results": e.final_result,
        "total_votes": bc.scalar(),
        "tally_hash": sha256_hex(json.dumps(e.final_result, sort_keys=True)),
        "result_signature": e.result_signature,
        "final_snapshot_hash": e.final_snapshot_hash,
        "status": e.status.value,
        "zkp_verified": _all_ballot_proofs_verified(ballots, e),
    }


@router.post("/elections/{election_id}/publish-result")
async def publish_result(
    election_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Step 20: Publish result with Ed25519 signature + SHA-256 integrity."""
    e = await _get_election(election_id, db)
    if not e.final_result:
        raise HTTPException(400, "Tally not computed yet")

    priv, pub = _sys_keys()
    result_hash = sha256_hex(json.dumps(e.final_result, sort_keys=True))
    sig = sign_payload(priv, {"result_hash": result_hash, "election_id": election_id, "published": True})
    e.result_signature = sig
    e.status = ElectionStatus.COMPLETED

    await _log(db, current_user.id, "result_published", election_id, {"result_hash": result_hash})
    await db.commit()

    bc = await db.execute(select(func.count()).where(Ballot.election_id == election_id))
    ballot_rows = await db.execute(select(Ballot).where(Ballot.election_id == election_id))
    ballots = ballot_rows.scalars().all()
    return {
        "results": e.final_result,
        "total_votes": bc.scalar(),
        "tally_hash": result_hash,
        "result_signature": sig,
        "final_snapshot_hash": e.final_snapshot_hash,
        "status": "published",
        "zkp_verified": _all_ballot_proofs_verified(ballots, e),
    }


# ── Audit log ─────────────────────────────────────────────────────────────────

@router.get("/audit")
async def get_audit(
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
    action: Optional[str] = None,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Step 21: Audit log with SHA-256 + HMAC-SHA-256 + Ed25519."""
    q = select(AuditLog, User).outerjoin(User, AuditLog.user_id == User.id)
    if action:
        q = q.where(AuditLog.action == action)
    q = q.order_by(AuditLog.created_at.desc())

    total_q = select(func.count()).select_from(AuditLog)
    if action:
        total_q = total_q.where(AuditLog.action == action)
    total_r = await db.execute(total_q)
    total = total_r.scalar()

    q = q.offset((page - 1) * limit).limit(limit)
    r = await db.execute(q)
    rows = r.all()

    return {
        "total": total,
        "logs": [
            {
                "id": str(log.id),
                "action": log.action,
                "resource": log.resource,
                "user_email": u.email if u else None,
                "evidence_hash": log.evidence_hash,
                "hmac_tag": log.hmac_tag,
                "signature": log.signature,
                "created_at": log.created_at.isoformat(),
            }
            for log, u in rows
        ],
    }
