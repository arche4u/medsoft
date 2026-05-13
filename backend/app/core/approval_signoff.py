"""Shared "Prepared / Reviewed / Approved" signoff pattern.

Every controlled document in the platform (SDP, SRS baseline, future Risk
Management File, Architecture Specification, Test Plans, etc.) carries the
standard regulated-document signoff block of three roles:

- **Prepared by** — the author of the draft (set on DRAFT → IN_REVIEW).
- **Reviewed by** — peer/technical reviewer; should be a different person
  from the approver (set on IN_REVIEW → APPROVED).
- **Approved by** — quality / project authority signing off (set on
  IN_REVIEW → APPROVED).

This module owns the schema fragments, mixin, and helpers so each new
versioned-document module gets the same shape with one import.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel
from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column


class ApprovalSignoffMixin:
    """Mixin contributing the six prepared/reviewed/approved columns.

    Mix into any SQLAlchemy model that represents a versioned controlled
    document. All fields are nullable — they fill in as the doc moves through
    the lifecycle states.
    """
    prepared_by: Mapped[str | None] = mapped_column(String(200))
    prepared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_by: Mapped[str | None] = mapped_column(String(200))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[str | None] = mapped_column(String(200))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ApprovalSignoff(BaseModel):
    """Read-shape for the signoff block — embed in baseline read schemas."""
    prepared_by: Optional[str] = None
    prepared_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


def check_independence(reviewed_by: str | None, approved_by: str | None) -> str | None:
    """Warn — not error — when reviewer and approver are the same person.

    Independence between review and approval is an IEC 62304 / 21 CFR Part 820
    expectation but enforcing it strictly blocks legitimate small-team
    workflows. The user picked "warn but allow" — we surface the warning and
    let auditors decide.

    Returns a warning string if same person (case-insensitive after
    stripping), or None if the names differ or either is empty.
    """
    a = (reviewed_by or "").strip().casefold()
    b = (approved_by or "").strip().casefold()
    if not a or not b:
        return None
    if a == b:
        return (
            f"Reviewer and approver are the same person ('{reviewed_by}'). "
            f"IEC 62304 expects independence between review and approval — "
            f"please confirm this is acceptable in your QMS."
        )
    return None
