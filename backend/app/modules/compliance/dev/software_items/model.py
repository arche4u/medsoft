import uuid
from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.base import Base, TimestampMixin


# ── Item types (IEC 62304 §5 decomposition) ───────────────────────────────────
# SYSTEM    → top-level software system
# SUBSYSTEM → software subsystem
# UNIT      → software unit (lowest level, directly testable)

# ── Safety classes (IEC 62304 §4.3) ──────────────────────────────────────────
# A → no injury or damage to health possible
# B → non-serious injury possible
# C → death or serious injury possible

# ── Status workflow ───────────────────────────────────────────────────────────
# DRAFT → REVIEWED → APPROVED
# Compliance enforcement gates transitions


class SoftwareItem(Base, TimestampMixin):
    __tablename__ = "software_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("software_items.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    item_type: Mapped[str] = mapped_column(String(50), nullable=False, default="SUBSYSTEM")
    safety_class: Mapped[str] = mapped_column(String(1), nullable=False, default="A")
    classification_justification: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT")

    risk_links: Mapped[list["SoftwareItemRiskLink"]] = relationship(
        "SoftwareItemRiskLink", back_populates="item", cascade="all, delete-orphan", lazy="selectin"
    )
    requirement_links: Mapped[list["SoftwareItemRequirementLink"]] = relationship(
        "SoftwareItemRequirementLink", back_populates="item", cascade="all, delete-orphan", lazy="selectin"
    )
    children: Mapped[list["SoftwareItem"]] = relationship(
        "SoftwareItem", foreign_keys=[parent_id], back_populates="parent", lazy="select"
    )
    parent: Mapped["SoftwareItem | None"] = relationship(
        "SoftwareItem", foreign_keys=[parent_id], back_populates="children", remote_side=[id]
    )


class SoftwareItemRiskLink(Base):
    __tablename__ = "software_item_risk_links"
    __table_args__ = (UniqueConstraint("software_item_id", "risk_id", name="uq_si_risk"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    software_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("software_items.id", ondelete="CASCADE"), nullable=False
    )
    risk_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("risks.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[uuid.UUID] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    item: Mapped["SoftwareItem"] = relationship("SoftwareItem", back_populates="risk_links")


class SoftwareItemRequirementLink(Base):
    __tablename__ = "software_item_requirement_links"
    __table_args__ = (UniqueConstraint("software_item_id", "requirement_id", name="uq_si_req"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    software_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("software_items.id", ondelete="CASCADE"), nullable=False
    )
    requirement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirements.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[uuid.UUID] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    item: Mapped["SoftwareItem"] = relationship("SoftwareItem", back_populates="requirement_links")
