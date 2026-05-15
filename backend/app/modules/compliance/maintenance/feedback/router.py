"""IEC 62304 §6.2.1 Feedback Intake router.

Provides the post-market surveillance funnel — feedback in, problem-report
or change-request out. The escalation endpoints are how the maintenance
process gets wired to the existing §9 CAPA module and §6.3 change-control
module without the frontend having to coordinate two writes.

Key endpoints:
  GET    /feedback/                        list by project
  POST   /feedback/                        create
  GET    /feedback/meta                    enum taxonomy (sources/severity/status)
  GET    /feedback/{id}                    read one
  PUT    /feedback/{id}                    update mutable fields
  PATCH  /feedback/{id}/evaluate           §6.2.1.2 + §6.2.1.3 evaluation
  PATCH  /feedback/{id}/escalate           §6.2.2 → ProblemReport / §6.2.3 → CR
  PATCH  /feedback/{id}/close              close with rationale (terminal)
  DELETE /feedback/{id}                    delete (NEW state only)
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.platform.audit.model import AuditAction
from app.modules.platform.audit.service import audit
from app.modules.platform.auth.deps import get_current_user, require_permission
from app.modules.platform.auth.schema import TokenData

from .model import FeedbackItem
from .schema import (
    FEEDBACK_SEVERITIES, FEEDBACK_SOURCES, FEEDBACK_STATUSES,
    FeedbackClose, FeedbackCreate, FeedbackEscalate, FeedbackEvaluate,
    FeedbackMeta, FeedbackRead, FeedbackUpdate,
)

router = APIRouter(prefix="/feedback", tags=["feedback"])


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _next_readable_id(db: AsyncSession, project_id: uuid.UUID) -> str:
    """FB-001 / FB-002 / … unique per project. Same pattern as requirements."""
    rows = (await db.execute(
        select(FeedbackItem.readable_id).where(FeedbackItem.project_id == project_id)
    )).scalars().all()
    max_n = 0
    for rid in rows:
        try:
            n = int(rid.split("-", 1)[1])
            if n > max_n:
                max_n = n
        except (ValueError, IndexError):
            pass
    return f"FB-{max_n + 1:03d}"


async def _load(db: AsyncSession, fb_id: uuid.UUID) -> FeedbackItem:
    fb = (await db.execute(
        select(FeedbackItem).where(FeedbackItem.id == fb_id)
    )).scalar_one_or_none()
    if not fb:
        raise HTTPException(404, "Feedback item not found")
    return fb


# ── Meta + list ──────────────────────────────────────────────────────────────

@router.get("/meta", response_model=FeedbackMeta)
async def meta(_: TokenData = Depends(get_current_user)):
    return FeedbackMeta(
        sources=FEEDBACK_SOURCES,
        severities=FEEDBACK_SEVERITIES,
        statuses=FEEDBACK_STATUSES,
    )


@router.get("/", response_model=list[FeedbackRead])
async def list_feedback(
    project_id: uuid.UUID,
    status: str | None = None,
    severity: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    q = select(FeedbackItem).where(FeedbackItem.project_id == project_id)
    if status:
        q = q.where(FeedbackItem.status == status)
    if severity:
        q = q.where(FeedbackItem.severity == severity)
    q = q.order_by(desc(FeedbackItem.created_at))
    return (await db.execute(q)).scalars().all()


@router.get("/{fb_id}", response_model=FeedbackRead)
async def get_feedback(
    fb_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    return await _load(db, fb_id)


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("/", response_model=FeedbackRead, status_code=201)
async def create_feedback(
    body: FeedbackCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_FEEDBACK")),
):
    rid = await _next_readable_id(db, body.project_id)
    fb = FeedbackItem(
        project_id=body.project_id,
        readable_id=rid,
        source=body.source,
        reporter=body.reporter,
        reported_at=body.reported_at,
        summary=body.summary,
        description=body.description,
        affected_version=body.affected_version,
        severity=body.severity,
        adverse_event=body.adverse_event,
        spec_deviation=body.spec_deviation,
        status="NEW",
    )
    db.add(fb)
    await db.flush()
    await audit(db, "FeedbackItem", fb.id, AuditAction.CREATE, current_user.user_id,
                f"{rid} via {body.source}")
    await db.commit()
    await db.refresh(fb)
    return fb


# ── Update mutable fields (only before EVALUATED to avoid rewriting history) ─

@router.put("/{fb_id}", response_model=FeedbackRead)
async def update_feedback(
    fb_id: uuid.UUID,
    body: FeedbackUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("UPDATE_FEEDBACK")),
):
    fb = await _load(db, fb_id)
    if fb.status in ("ESCALATED", "CLOSED"):
        raise HTTPException(400, f"Cannot edit feedback in {fb.status} state")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(fb, field, value)
    await audit(db, "FeedbackItem", fb.id, AuditAction.UPDATE, current_user.user_id)
    await db.commit()
    await db.refresh(fb)
    return fb


# ── §6.2.1.2 + §6.2.1.3 evaluation ───────────────────────────────────────────

@router.patch("/{fb_id}/evaluate", response_model=FeedbackRead)
async def evaluate_feedback(
    fb_id: uuid.UUID,
    body: FeedbackEvaluate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("EVALUATE_FEEDBACK")),
):
    fb = await _load(db, fb_id)
    if fb.status in ("ESCALATED", "CLOSED"):
        raise HTTPException(400, f"Cannot re-evaluate feedback in {fb.status} state")

    fb.is_problem = body.is_problem
    fb.evaluation_notes = body.evaluation_notes
    fb.evaluated_by = body.evaluated_by
    fb.evaluated_at = datetime.now(timezone.utc)
    fb.safety_impact_assessment = body.safety_impact_assessment
    fb.change_needed = body.change_needed
    fb.status = "EVALUATED"

    await audit(db, "FeedbackItem", fb.id, AuditAction.UPDATE, current_user.user_id,
                f"Evaluated: is_problem={body.is_problem}, change_needed={body.change_needed}")
    await db.commit()
    await db.refresh(fb)
    return fb


# ── §6.2.2 / §6.2.3 escalation ──────────────────────────────────────────────

@router.patch("/{fb_id}/escalate", response_model=FeedbackRead)
async def escalate_feedback(
    fb_id: uuid.UUID,
    body: FeedbackEscalate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("EVALUATE_FEEDBACK")),
):
    fb = await _load(db, fb_id)
    if fb.status != "EVALUATED":
        raise HTTPException(400, "Feedback must be EVALUATED before it can be escalated")
    if bool(body.to_problem) == bool(body.to_change_request):
        raise HTTPException(400, "Set exactly one of to_problem or to_change_request")

    extra = f"\n\n— extra notes —\n{body.extra_notes}" if body.extra_notes else ""

    if body.to_problem:
        from app.modules.compliance.problems.capa.model import ProblemReport
        # FeedbackItem.severity (COSMETIC/MINOR/MAJOR/SAFETY) → ProblemReport
        # severity (LOW/MEDIUM/HIGH/CRITICAL). Keep this map narrow so future
        # additions stay explicit.
        sev_map = {"COSMETIC": "LOW", "MINOR": "LOW", "MAJOR": "HIGH", "SAFETY": "CRITICAL"}
        safety_block = (
            f"\n\n— §6.2.1.3 safety impact assessment —\n{fb.safety_impact_assessment}"
            if fb.safety_impact_assessment else ""
        )
        pr = ProblemReport(
            project_id=fb.project_id,
            title=f"[{fb.readable_id}] {fb.summary}",
            description=(fb.description or "") + safety_block + extra,
            severity=sev_map.get(fb.severity, "MEDIUM"),
            source=fb.source,
            reported_by=fb.reporter,
            status="OPEN",
        )
        db.add(pr)
        await db.flush()
        fb.escalated_problem_id = pr.id
        await audit(db, "ProblemReport", pr.id, AuditAction.CREATE, current_user.user_id,
                    f"Escalated from feedback {fb.readable_id}")

    if body.to_change_request:
        from app.modules.compliance.change_control.model import ChangeRequest, ChangeRequestState
        cr = ChangeRequest(
            project_id=fb.project_id,
            title=f"[CR ← {fb.readable_id}] {fb.summary}",
            description=(fb.description or "") + extra,
            status=ChangeRequestState.OPEN,
            modifies_released_software=True,  # all post-market feedback targets released software
        )
        db.add(cr)
        await db.flush()
        fb.escalated_change_request_id = cr.id
        await audit(db, "ChangeRequest", cr.id, AuditAction.CREATE, current_user.user_id,
                    f"Escalated from feedback {fb.readable_id}")

    fb.status = "ESCALATED"
    await audit(db, "FeedbackItem", fb.id, AuditAction.UPDATE, current_user.user_id,
                "Escalated to " + ("ProblemReport" if body.to_problem else "ChangeRequest"))
    await db.commit()
    await db.refresh(fb)
    return fb


# ── Close ────────────────────────────────────────────────────────────────────

@router.patch("/{fb_id}/close", response_model=FeedbackRead)
async def close_feedback(
    fb_id: uuid.UUID,
    body: FeedbackClose,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("EVALUATE_FEEDBACK")),
):
    fb = await _load(db, fb_id)
    if fb.status == "CLOSED":
        raise HTTPException(400, "Feedback already CLOSED")
    fb.closure_rationale = body.closure_rationale
    fb.status = "CLOSED"
    await audit(db, "FeedbackItem", fb.id, AuditAction.UPDATE, current_user.user_id,
                "Closed")
    await db.commit()
    await db.refresh(fb)
    return fb


# ── Delete (NEW only — preserves audit trail for triaged items) ─────────────

@router.delete("/{fb_id}", status_code=204)
async def delete_feedback(
    fb_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("DELETE_FEEDBACK")),
):
    fb = await _load(db, fb_id)
    if fb.status != "NEW":
        raise HTTPException(400, "Only NEW feedback can be deleted — use /close for triaged items")
    await audit(db, "FeedbackItem", fb.id, AuditAction.DELETE, current_user.user_id, fb.readable_id)
    await db.delete(fb)
    await db.commit()
