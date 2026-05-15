import enum
import uuid
from sqlalchemy import Boolean, Enum as SAEnum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.base import Base, TimestampMixin


class ChangeRequestState(str, enum.Enum):
    OPEN = "OPEN"
    IMPACT_ANALYSIS = "IMPACT_ANALYSIS"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    IMPLEMENTED = "IMPLEMENTED"


VALID_TRANSITIONS: dict[ChangeRequestState, set[ChangeRequestState]] = {
    ChangeRequestState.OPEN: {ChangeRequestState.IMPACT_ANALYSIS},
    ChangeRequestState.IMPACT_ANALYSIS: {ChangeRequestState.APPROVED, ChangeRequestState.REJECTED},
    ChangeRequestState.APPROVED: {ChangeRequestState.IMPLEMENTED},
    ChangeRequestState.REJECTED: set(),
    ChangeRequestState.IMPLEMENTED: set(),
}


class ChangeRequest(Base, TimestampMixin):
    __tablename__ = "change_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ChangeRequestState] = mapped_column(
        SAEnum(ChangeRequestState, name="changerequeststate"),
        nullable=False,
        default=ChangeRequestState.OPEN,
    )

    # ── IEC 62304 §6.2.3 — analyse Change Requests ───────────────────────────
    # When a CR modifies released software (§6.2.4), three additional analyses
    # are required: effect on the organization, on released software, and on
    # interfacing systems. Stored as free-form text — the IMPACT_ANALYSIS gate
    # in the router enforces these are filled before APPROVED for CRs flagged
    # `modifies_released_software=True`.
    # Default False so legacy/pre-release CRs aren't blocked. Set True via the
    # API when a CR targets a RELEASED version.
    modifies_released_software: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    effect_on_organization: Mapped[str | None] = mapped_column(Text)
    effect_on_released_software: Mapped[str | None] = mapped_column(Text)
    effect_on_interfacing_systems: Mapped[str | None] = mapped_column(Text)

    impacts: Mapped[list["ChangeImpact"]] = relationship(
        back_populates="change_request", cascade="all, delete-orphan"
    )


class ChangeImpact(Base):
    __tablename__ = "change_impacts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    change_request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("change_requests.id"), nullable=False
    )
    impacted_requirement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirements.id"), nullable=True
    )
    impacted_design_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("design_elements.id"), nullable=True
    )
    impacted_system_test_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("system_test_cases.id", ondelete="SET NULL"), nullable=True
    )
    impact_description: Mapped[str | None] = mapped_column(Text)

    change_request: Mapped["ChangeRequest"] = relationship(back_populates="impacts")
