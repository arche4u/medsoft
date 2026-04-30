import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.base import Base, TimestampMixin


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
        "SWComponent", foreign_keys=[source_component_id], back_populates="outgoing_interfaces"
    )
    target: Mapped["SWComponent"] = relationship(
        "SWComponent", foreign_keys=[target_component_id], back_populates="incoming_interfaces"
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
    __table_args__ = (UniqueConstraint("component_id", "testcase_id", name="uq_swcomp_tc"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    component_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sw_components.id", ondelete="CASCADE"), nullable=False
    )
    testcase_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("testcases.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    component: Mapped["SWComponent"] = relationship("SWComponent", back_populates="tc_links")
