import uuid
from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.base import Base, TimestampMixin
from app.core.approval_signoff import ApprovalSignoffMixin


class RequirementCategory(Base, TimestampMixin):
    """Per-project requirement type definitions.

    No "builtin" behavior is enforced in code — everything dynamic about a
    category (label, color, sort order, readable-ID prefix, parent in the
    category tree) lives on this row. New projects are seeded with three
    starter categories (USER/SYSTEM/SOFTWARE wired into a parent chain) but
    those rows are first-class data the user can rename, recolor, restructure
    or delete (when no requirements use them).
    """
    __tablename__ = "requirement_categories"
    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_req_category_project_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#546e7a")
    # Marker for "this row came from the initial seed" — affects nothing in
    # the runtime behaviour, only useful for analytics/UI hints.
    is_builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=99)
    # Used to generate readable_ids like URQ-001/SYS-001/REG-001. Nullable for
    # legacy rows; the router falls back to the first 3 letters of `name` if
    # this isn't set, but new categories should always pick one.
    readable_id_prefix: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # Self-referential: child categories declare their parent type. The
    # requirement-hierarchy rule (a SYSTEM req parents under USER, a SOFTWARE
    # req under SYSTEM) is derived from this column — no hardcoded names.
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirement_categories.id", ondelete="SET NULL"), nullable=True
    )


class Requirement(Base, TimestampMixin):
    __tablename__ = "requirements"
    __table_args__ = (UniqueConstraint("project_id", "readable_id", name="uq_req_project_readable_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(50), nullable=False)   # references RequirementCategory.name
    readable_id: Mapped[str] = mapped_column(String(20), nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirements.id"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # Cross-category change-impact flag: set to True when an ancestor (parent
    # in any category) is edited. UI shows a "needs review" chip; user must
    # acknowledge or edit the requirement to clear it.
    needs_review: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    needs_review_reason: Mapped[str | None] = mapped_column(Text)

    project: Mapped["Project"] = relationship(back_populates="requirements")
    risks: Mapped[list["Risk"]] = relationship(
        back_populates="requirement", cascade="all, delete-orphan", passive_deletes=True
    )


# ── SRS baseline (IEC 62304 §5.2) ─────────────────────────────────────────────
# Mirrors the SDP versioning model. An APPROVED baseline freezes a snapshot of
# all requirements at that moment and locks the live requirement rows from
# further editing until a new draft is forked.

# ─────────────────────────────────────────────────────────────────────────────
# Two-tier SRS versioning (IEC 62304 §5.2):
#
#   RequirementCategoryBaseline (per category, per version) — signed off by
#       the team owning that category (USER reqs by clinical lead, SYSTEM by
#       sys engineer, etc.). Each category moves on its own cadence.
#
#   RequirementsBaseline (composite SRS release) — a manifest pinning specific
#       category-baseline versions. The thing that gets released, mirrored to
#       Configuration Management, and cited in the DHF.
#
#   RequirementsBaselineComponent — join: composite → category baselines.
# ─────────────────────────────────────────────────────────────────────────────


class RequirementCategoryBaseline(Base, TimestampMixin, ApprovalSignoffMixin):
    """A versioned, approvable snapshot of one category's requirements.

    e.g. "User Requirements v1.0" or "Software Requirements v1.1". Carries
    the standard prepared/reviewed/approved signoff via mixin. Lock semantics
    are per-category: USER reqs are editable when a USER baseline is in
    DRAFT/IN_REVIEW; SYSTEM/SOFTWARE/etc. lock independently.
    """
    __tablename__ = "requirement_category_baselines"
    __table_args__ = (
        UniqueConstraint("project_id", "category_name", "version", name="uq_catbaseline_proj_cat_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    category_name: Mapped[str] = mapped_column(String(50), nullable=False)  # USER/SYSTEM/SOFTWARE/<custom>
    version: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT")
    review_notes: Mapped[str | None] = mapped_column(Text)
    # prepared_by/at, reviewed_by/at, approved_by/at come from ApprovalSignoffMixin

    items: Mapped[list["RequirementCategoryBaselineItem"]] = relationship(
        back_populates="baseline",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="RequirementCategoryBaselineItem.readable_id",
        lazy="selectin",
    )


class RequirementCategoryBaselineItem(Base):
    """Frozen requirement snapshot for a category baseline. Survives if the
    live row is later deleted."""
    __tablename__ = "requirement_category_baseline_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    baseline_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirement_category_baselines.id", ondelete="CASCADE"), nullable=False
    )
    requirement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirements.id", ondelete="SET NULL"), nullable=True
    )
    readable_id: Mapped[str] = mapped_column(String(20), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    parent_readable_id: Mapped[str | None] = mapped_column(String(20))

    baseline: Mapped["RequirementCategoryBaseline"] = relationship(back_populates="items")


class RequirementsBaseline(Base, TimestampMixin, ApprovalSignoffMixin):
    """Composite SRS release manifest (IEC 62304 §5.2).

    Doesn't store its own item snapshot — instead, it references a set of
    `RequirementCategoryBaseline` rows (one per category) via the components
    join table. Approving a composite requires every referenced category
    baseline to already be APPROVED.
    """
    __tablename__ = "requirements_baselines"
    __table_args__ = (
        UniqueConstraint("project_id", "version", name="uq_reqbaseline_project_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT")
    review_notes: Mapped[str | None] = mapped_column(Text)
    # Auto-mirror to Configuration Management baseline so the SRS release
    # shows up under Config Management → Baselines.
    cm_baseline_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cm_baselines.id", ondelete="SET NULL"), nullable=True
    )
    # prepared_by/at, reviewed_by/at, approved_by/at come from ApprovalSignoffMixin

    components: Mapped[list["RequirementsBaselineComponent"]] = relationship(
        back_populates="baseline",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )

    # Legacy: pre-two-tier composite baselines stored items directly. The
    # `requirements_baseline_items` table is kept for migration/back-compat
    # but new composites no longer write to it.
    items: Mapped[list["RequirementsBaselineItem"]] = relationship(
        back_populates="baseline",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="RequirementsBaselineItem.readable_id",
        lazy="selectin",
    )


class RequirementsBaselineComponent(Base):
    """Join row: a composite SRS pins a specific category-baseline version."""
    __tablename__ = "requirements_baseline_components"
    __table_args__ = (
        UniqueConstraint("composite_baseline_id", "category_baseline_id", name="uq_baseline_component"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    composite_baseline_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirements_baselines.id", ondelete="CASCADE"), nullable=False
    )
    category_baseline_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirement_category_baselines.id", ondelete="RESTRICT"), nullable=False
    )

    baseline: Mapped["RequirementsBaseline"] = relationship(back_populates="components")
    category_baseline: Mapped["RequirementCategoryBaseline"] = relationship(lazy="selectin")


class RequirementsBaselineItem(Base):
    """Legacy direct-snapshot table. Kept for back-compat; new composites
    don't write to it. To be removed once no row references it."""
    __tablename__ = "requirements_baseline_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    baseline_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirements_baselines.id", ondelete="CASCADE"), nullable=False
    )
    requirement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirements.id", ondelete="SET NULL"), nullable=True
    )
    readable_id: Mapped[str] = mapped_column(String(20), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    parent_readable_id: Mapped[str | None] = mapped_column(String(20))

    baseline: Mapped["RequirementsBaseline"] = relationship(back_populates="items")
