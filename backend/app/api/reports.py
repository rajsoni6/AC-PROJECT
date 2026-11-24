"""Aggregate election reporting endpoints for super administrators."""
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import require_admin
from app.models.election import Ballot, Candidate, Election
from app.models.user import Role, User, VerificationStatus, VoterProfile

router = APIRouter(prefix="/admin/reports", tags=["Admin Reports"])


@router.get("/elections/{election_id}")
async def election_report(
    election_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return aggregate election totals only; never expose voter/ballot identifiers."""
    election = await db.get(Election, election_id)
    if not election:
        raise HTTPException(404, "Election not found")

    approved = await db.execute(
        select(User, VoterProfile)
        .join(VoterProfile, VoterProfile.user_id == User.id)
        .where(User.role == Role.VOTER, User.is_active.is_(True),
               VoterProfile.verification_status == VerificationStatus.APPROVED)
    )
    policy = election.eligibility_policy or {}
    eligible_count = 0
    for _, profile in approved.all():
        nationality = policy.get("nationality")
        if nationality and str(nationality).lower() != "any" and profile.nationality != nationality:
            continue
        constituency = policy.get("constituency")
        if constituency and str(constituency).lower() != "any" and profile.constituency != constituency:
            continue
        min_age = policy.get("min_age")
        if min_age:
            try:
                dob = datetime.strptime(profile.date_of_birth or "", "%Y-%m-%d").date()
                if (date.today() - dob).days // 365 < int(min_age):
                    continue
            except (ValueError, TypeError):
                continue
        eligible_count += 1

    votes = (await db.execute(
        select(func.count()).select_from(Ballot).where(Ballot.election_id == election.id)
    )).scalar_one()
    candidates = (await db.execute(
        select(func.count()).select_from(Candidate).where(Candidate.election_id == election.id)
    )).scalar_one()
    return {
        "election": {
            "id": str(election.id), "title": election.title,
            "description": election.description or "", "status": election.status.value,
            "start_time": election.start_time.isoformat() if election.start_time else None,
            "end_time": election.end_time.isoformat() if election.end_time else None,
            "candidate_count": candidates,
        },
        "eligible_voters": eligible_count,
        "votes_cast": votes,
        "not_yet_voted": max(eligible_count - votes, 0),
        "turnout_percentage": round(votes / eligible_count * 100, 1) if eligible_count else 0.0,
        "privacy": "Aggregate totals only; no voter credentials or ballot identifiers are included.",
    }
