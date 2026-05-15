import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.base import Base, TimestampMixin
from app.core.approval_signoff import ApprovalSignoffMixin


# ── Component types (IEC 62304 §5.3 hierarchy) ────────────────────────────────
# SYSTEM    → top-level software system (one per project, no parent)
# SUBSYSTEM → major functional grouping (parent: SYSTEM)
# ITEM      → deployable software item (parent: SUBSYSTEM)
# UNIT      → lowest testable unit (parent: ITEM or SUBSYSTEM)

# ── Status workflow ───────────────────────────────────────────────────────────
# DRAFT → REVIEW → APPROVED
# APPROVED blocks all mutations; fork creates a new version.

# ── Interface types ───────────────────────────────────────────────────────────
# DATA     → data exchange (files, databases, shared memory)
# CONTROL  → command/control signals
# API      → function calls, REST, RPC
# SIGNAL   → hardware/sensor signals, interrupts

# ── Data flow criticality ─────────────────────────────────────────────────────
# LOW / MEDIUM / HIGH / CRITICAL


class SWComponent(Base, TimestampMixin):
    __tablename__ = "sw_components"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sw_components.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    component_type: Mapped[str] = mapped_column(String(20), nullable=False, default="SUBSYSTEM")
    safety_class: Mapped[str] = mapped_column(String(1), nullable=False, default="A")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT")
    version: Mapped[str] = mapped_column(String(20), nullable=False, default="1.0")
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    diagram_source: Mapped[str | None] = mapped_column(Text, nullable=True)
    approved_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    req_links: Mapped[list["SWComponentReqLink"]] = relationship(
        "SWComponentReqLink", back_populates="component", cascade="all, delete-orphan", lazy="selectin"
    )
    risk_links: Mapped[list["SWComponentRiskLink"]] = relationship(
        "SWComponentRiskLink", back_populates="component", cascade="all, delete-orphan", lazy="selectin"
    )
    tc_links: Mapped[list["SWComponentTCLink"]] = relationship(
        "SWComponentTCLink", back_populates="component", cascade="all, delete-orphan", lazy="selectin"
    )
    outgoing_interfaces: Mapped[list["SWInterface"]] = relationship(
        "SWInterface", foreign_keys="SWInterface.source_component_id",
        back_populates="source", cascade="all, delete-orphan", lazy="selectin"
    )
    incoming_interfaces: Mapped[list["SWInterface"]] = relationship(
        "SWInterface", foreign_keys="SWInterface.target_component_id",
        back_populates="target", lazy="selectin"
    )
    children: Mapped[list["SWComponent"]] = relationship(
        "SWComponent", foreign_keys=[parent_id], back_populates="parent", lazy="select"
    )
    parent: Mapped["SWComponent | None"] = relationship(
        "SWComponent", foreign_keys=[parent_id], back_populates="children", remote_side=[id]
    )


class SWInterface(Base, TimestampMixin):
    __tablename__ = "sw_interfaces"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    source_component_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sw_components.id", ondelete="CASCADE"), nullable=False
    )
    target_component_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sw_components.id", ondelete="CASCADE"), nullable=False
    )
    interface_type: Mapped[str] = mapped_column(String(20), nullable=False, default="API")
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_format: Mapped[str | None] = mapped_column(String(200), nullable=True)
    communication_method: Mapped[str | None] = mapped_column(String(200), nullable=True)
    safety_relevant: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    source: Mapped["SWComponent"] = relationship(
        "SWComponent", foreign_keys=[source_component_id],
        back_populates="outgoing_interfaces", lazy="selectin"
    )
    target: Mapped["SWComponent"] = relationship(
        "SWComponent", foreign_keys=[target_component_id],
        back_populates="incoming_interfaces", lazy="selectin"
    )
    data_flows: Mapped[list["SWDataFlow"]] = relationship(
        "SWDataFlow", back_populates="interface", cascade="all, delete-orphan", lazy="selectin"
    )


class SWDataFlow(Base, TimestampMixin):
    __tablename__ = "sw_data_flows"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    interface_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sw_interfaces.id", ondelete="CASCADE"), nullable=False
    )
    data_name: Mapped[str] = mapped_column(String(300), nullable=False)
    data_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    frequency: Mapped[str | None] = mapped_column(String(100), nullable=True)
    criticality: Mapped[str] = mapped_column(String(20), nullable=False, default="LOW")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    interface: Mapped["SWInterface"] = relationship("SWInterface", back_populates="data_flows")


class SWComponentReqLink(Base):
    __tablename__ = "sw_component_req_links"
    __table_args__ = (UniqueConstraint("component_id", "requirement_id", name="uq_swcomp_req"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    component_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sw_components.id", ondelete="CASCADE"), nullable=False
    )
    requirement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirements.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    component: Mapped["SWComponent"] = relationship("SWComponent", back_populates="req_links")


class SWComponentRiskLink(Base):
    __tablename__ = "sw_component_risk_links"
    __table_args__ = (UniqueConstraint("component_id", "risk_id", name="uq_swcomp_risk"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    component_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sw_components.id", ondelete="CASCADE"), nullable=False
    )
    risk_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("risks.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    component: Mapped["SWComponent"] = relationship("SWComponent", back_populates="risk_links")


class SWComponentTCLink(Base):
    __tablename__ = "sw_component_tc_links"
    __table_args__ = (UniqueConstraint("component_id", "system_test_id", name="uq_swcomp_tc"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    component_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sw_components.id", ondelete="CASCADE"), nullable=False
    )
    system_test_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("system_test_cases.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    component: Mapped["SWComponent"] = relationship("SWComponent", back_populates="tc_links")


# ── Architecture Document baseline (IEC 62304 §5.3) ──────────────────────────
#
# A versioned, approvable snapshot of the project's software architecture
# (all components, interfaces, and data flows at the moment of approval).
# Mirrors the SDP/SRS pattern: prepared/reviewed/approved signoff trail,
# DRAFT → IN_REVIEW → APPROVED → OBSOLETE lifecycle, auto-mirrored to a
# CMBaseline at approval time so it shows up as a release artifact under
# Configuration Management.

class ArchitectureBaseline(Base, TimestampMixin, ApprovalSignoffMixin):
    """A versioned snapshot of the project's Software Architecture Document."""
    __tablename__ = "architecture_baselines"
    __table_args__ = (
        UniqueConstraint("project_id", "version", name="uq_archbaseline_proj_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT")
    review_notes: Mapped[str | None] = mapped_column(Text)
    cm_baseline_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cm_baselines.id", ondelete="SET NULL"), nullable=True
    )
    # prepared_by/at, reviewed_by/at, approved_by/at come from ApprovalSignoffMixin

    components: Mapped[list["ArchitectureBaselineComponent"]] = relationship(
        back_populates="baseline",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ArchitectureBaselineComponent.sort_order",
        lazy="selectin",
    )
    interfaces: Mapped[list["ArchitectureBaselineInterface"]] = relationship(
        back_populates="baseline",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )


class ArchitectureBaselineComponent(Base):
    """Frozen SWComponent snapshot at the moment the baseline was approved."""
    __tablename__ = "architecture_baseline_components"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    baseline_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("architecture_baselines.id", ondelete="CASCADE"), nullable=False
    )
    component_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sw_components.id", ondelete="SET NULL"), nullable=True
    )
    # Frozen fields — survive if the live component is later deleted/renamed.
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    component_type: Mapped[str] = mapped_column(String(20), nullable=False)
    safety_class: Mapped[str] = mapped_column(String(1), nullable=False)
    version: Mapped[str] = mapped_column(String(20), nullable=False)
    rationale: Mapped[str | None] = mapped_column(Text)
    parent_name: Mapped[str | None] = mapped_column(String(500))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    baseline: Mapped["ArchitectureBaseline"] = relationship(back_populates="components")


class ArchitectureBaselineInterface(Base):
    """Frozen SWInterface snapshot (with data flows flattened into JSON-ish
    fields kept inline so the snapshot survives interface deletion)."""
    __tablename__ = "architecture_baseline_interfaces"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    baseline_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("architecture_baselines.id", ondelete="CASCADE"), nullable=False
    )
    interface_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sw_interfaces.id", ondelete="SET NULL"), nullable=True
    )
    # Frozen field values
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    interface_type: Mapped[str] = mapped_column(String(20), nullable=False)
    source_component_name: Mapped[str] = mapped_column(String(500), nullable=False)
    target_component_name: Mapped[str] = mapped_column(String(500), nullable=False)
    data_format: Mapped[str | None] = mapped_column(String(200))
    communication_method: Mapped[str | None] = mapped_column(String(200))
    safety_relevant: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # `data_flows_summary` is a free-form text dump (rows of "name | type |
    # freq | criticality | description") so the audit trail preserves them
    # without a third snapshot table. PDFs render it verbatim.
    data_flows_summary: Mapped[str | None] = mapped_column(Text)

    baseline: Mapped["ArchitectureBaseline"] = relationship(back_populates="interfaces")
