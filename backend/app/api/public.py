"""
api/public.py — Public endpoints (no auth required)
Step 14: Bulletin board with Merkle tree inclusion proofs
Step 20: Public result verification
"""
from fastapi import APIRouter, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import Depends
from pydantic import BaseModel

from app.core.database import get_db
from app.models.election import Election, BulletinEntry, ElectionStatus, Ballot, Candidate
from app.crypto import MerkleTree, sha256_hex

router = APIRouter(prefix="/public", tags=["Public"])


@router.get("/elections")
async def public_elections(db: AsyncSession = Depends(get_db)):
    r = await db.execute(
        select(Election).where(
            Election.status.in_(["published", "open", "closed", "tallying", "completed"])
        )
    )
    elections = r.scalars().all()
    return [
        {"id": str(e.id), "title": e.title, "status": e.status.value,
         "start_time": e.start_time.isoformat() if e.start_time else None}
        for e in elections
    ]


@router.get("/bulletin/{election_id}")
async def get_bulletin(election_id: str, db: AsyncSession = Depends(get_db)):
    """Return all bulletin board entries + current Merkle root."""
    r = await db.execute(
        select(BulletinEntry)
        .where(BulletinEntry.election_id == election_id)
        .order_by(BulletinEntry.posted_at)
    )
    entries = r.scalars().all()

    commitments = [e.commitment for e in entries]
    tree = MerkleTree(commitments) if commitments else None

    return {
        "election_id": election_id,
        "merkle_root": tree.root if tree else None,
        "entries": [
            {
                "id": str(e.id),
                "commitment": e.commitment,
                "entry_signature": e.entry_signature,
                "posted_at": e.posted_at.isoformat(),
            }
            for e in entries
        ],
    }


class VerifyReq(BaseModel):
    commitment: str


@router.get("/results/{election_id}")
async def public_result(election_id: str, db: AsyncSession = Depends(get_db)):
    """Public election result — only for completed/tallying elections."""
    r = await db.execute(select(Election).where(Election.id == election_id))
    e = r.scalar_one_or_none()
    if not e:
        raise HTTPException(404, "Election not found")
    if e.status not in [ElectionStatus.TALLYING, ElectionStatus.COMPLETED]:
        raise HTTPException(404, "Result not published yet")
    if not e.final_result:
        raise HTTPException(404, "Result not available yet")
    bc = await db.execute(select(Ballot).where(Ballot.election_id == election_id))
    total = len(bc.scalars().all())
    return {
        "election_id": election_id,
        "title": e.title,
        "status": e.status.value,
        "results": e.final_result,
        "total_votes": total,
        "tally_hash": sha256_hex(__import__('json').dumps(e.final_result, sort_keys=True)),
        "result_signature": e.result_signature,
        "final_snapshot_hash": e.final_snapshot_hash,
    }


@router.get("/all-results")
async def all_public_results(db: AsyncSession = Depends(get_db)):
    """All completed elections with results."""
    r = await db.execute(
        select(Election).where(Election.status.in_([ElectionStatus.TALLYING, ElectionStatus.COMPLETED]))
    )
    elections = r.scalars().all()
    results = []
    for e in elections:
        if not e.final_result:
            continue
        bc = await db.execute(select(Ballot).where(Ballot.election_id == e.id))
        total = len(bc.scalars().all())
        results.append({
            "election_id": str(e.id),
            "title": e.title,
            "status": e.status.value,
            "results": e.final_result,
            "total_votes": total,
            "result_signature": e.result_signature,
        })
    return results


@router.post("/bulletin/{election_id}/verify")
async def verify_inclusion(
    election_id: str,
    req: VerifyReq,
    db: AsyncSession = Depends(get_db),
):
    """Verify a ballot commitment is included in the Merkle tree."""
    r = await db.execute(
        select(BulletinEntry)
        .where(BulletinEntry.election_id == election_id)
        .order_by(BulletinEntry.posted_at)
    )
    entries = r.scalars().all()
    commitments = [e.commitment for e in entries]

    if req.commitment not in commitments:
        return {"verified": False, "message": "Commitment not found in bulletin board"}

    tree = MerkleTree(commitments)
    idx = commitments.index(req.commitment)
    proof = tree.get_proof(idx)
    verified = tree.verify_proof(req.commitment, proof, tree.root)

    return {
        "verified": verified,
        "merkle_root": tree.root,
        "merkle_proof": proof,
        "leaf_index": idx,
    }
