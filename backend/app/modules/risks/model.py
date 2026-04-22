import uuid
from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.base import Base, TimestampMixin


def _compute_level(severity: int, probability: int) -> str:
    score = severity * probability
    if score <= 4:
        return "LOW"
    elif score <= 9:
        return "MEDIUM"
    return "HIGH"


class Risk(Base):
    __tablename__ = "risks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    requirement_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("requirements.id", ondelete="CASCADE"), nullable=False)
    hazard: Mapped[str] = mapped_column(String(500), nullable=False)
    hazardous_situation: Mapped[str] = mapped_column(String(500), nullable=False)
    harm: Mapped[str] = mapped_column(String(500), nullable=False)
    severity: Mapped[int] = mapped_column(Integer, nullable=False)
    probability: Mapped[int] = mapped_column(Integer, nullable=False)
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False)
    mitigation: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    requirement: Mapped["Requirement"] = relationship(back_populates="risks")


class SoftwareSafetyProfile(Base, TimestampMixin):
    """Per-project IEC 62304 safety classification and RPN methodology declaration."""
    __tablename__ = "software_safety_profiles"
    __table_args__ = (UniqueConstraint("project_id", name="uq_safety_profile_project"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)

    # IEC 62304 safety class
    iec62304_class: Mapped[str] = mapped_column(String(1), nullable=False, default="C")  # A | B | C
    classification_rationale: Mapped[str | None] = mapped_column(Text, nullable=True)

    # RPN methodology
    rpn_scale: Mapped[int] = mapped_column(Integer, nullable=False, default=5)  # 5 or 10
    severity_definitions: Mapped[str | None] = mapped_column(Text, nullable=True)   # JSON
    probability_definitions: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON

    # Compliance acknowledgements
    iso14971_aligned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    software_failure_assumption: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Document references
    sdp_section_reference: Mapped[str | None] = mapped_column(String(300), nullable=True)
    approved_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    review_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
