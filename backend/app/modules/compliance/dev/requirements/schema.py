import uuid
from datetime import datetime
from pydantic import BaseModel, model_validator


class RequirementCategoryCreate(BaseModel):
    project_id: uuid.UUID
    name: str
    label: str
    color: str = "#546e7a"
    parent_id: uuid.UUID | None = None   # optional: nest under an existing category
    readable_id_prefix: str | None = None  # e.g. "REG" for REG-001

    @model_validator(mode="after")
    def normalise_name(self):
        self.name = self.name.strip().upper().replace(" ", "_")
        if not self.name:
            raise ValueError("name must not be empty")
        if self.readable_id_prefix:
            self.readable_id_prefix = self.readable_id_prefix.strip().upper()
        return self


class RequirementCategoryRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    label: str
    color: str
    is_builtin: bool
    sort_order: int
    readable_id_prefix: str | None = None
    parent_id: uuid.UUID | None = None

    model_config = {"from_attributes": True}


class RequirementCategoryUpdate(BaseModel):
    label: str | None = None
    color: str | None = None
    sort_order: int | None = None   # hierarchy level; lower = higher in tree
    readable_id_prefix: str | None = None
    parent_id: uuid.UUID | None = None


class RequirementCreate(BaseModel):
    project_id: uuid.UUID
    type: str
    # Parent/no-parent rule is derived from the category's parent_id chain in
    # the router (`_validate_hierarchy`) — no hardcoded type-name checks here.
    parent_id: uuid.UUID | None = None
    title: str
    description: str | None = None


class RequirementUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    parent_id: uuid.UUID | None = None


class RequirementRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    type: str
    readable_id: str
    parent_id: uuid.UUID | None
    title: str
    description: str | None
    needs_review: bool = False
    needs_review_reason: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UploadSummary(BaseModel):
    total_added: int
    total_skipped: int
    added: list[dict]
    skipped: list[dict]


# ── SRS baseline schemas (IEC 62304 §5.2) ─────────────────────────────────────

class RequirementsBaselineItemRead(BaseModel):
    id: uuid.UUID
    baseline_id: uuid.UUID
    requirement_id: uuid.UUID | None
    readable_id: str
    type: str
    title: str
    description: str | None
    parent_readable_id: str | None

    model_config = {"from_attributes": True}


class RequirementsBaselineCreate(BaseModel):
    project_id: uuid.UUID
    version: str


class RequirementsBaselineSummary(BaseModel):
    """Lightweight read for lists — no items array."""
    id: uuid.UUID
    project_id: uuid.UUID
    version: str
    status: str
    prepared_by: str | None
    prepared_at: datetime | None
    reviewed_by: str | None
    reviewed_at: datetime | None
    approved_by: str | None
    approved_at: datetime | None
    cm_baseline_id: uuid.UUID | None
    item_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class RequirementsBaselineRead(BaseModel):
    """Detail read with frozen items array."""
    id: uuid.UUID
    project_id: uuid.UUID
    version: str
    status: str
    prepared_by: str | None
    prepared_at: datetime | None
    reviewed_by: str | None
    reviewed_at: datetime | None
    approved_by: str | None
    approved_at: datetime | None
    review_notes: str | None
    cm_baseline_id: uuid.UUID | None
    items: list[RequirementsBaselineItemRead]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RequirementsBaselineStatusTransition(BaseModel):
    """Body for /requirements/baselines/{id}/status. See SDPStatusTransition
    for the role-name rules — same shape, same semantics."""
    status: str
    prepared_by: str | None = None
    reviewed_by: str | None = None
    approved_by: str | None = None
    review_notes: str | None = None


class RequirementsBaselineTransitionResult(BaseModel):
    """Envelope around a transitioned baseline that surfaces non-blocking
    warnings (e.g. reviewer == approver) to the UI."""
    baseline: RequirementsBaselineRead
    warnings: list[str] = []


# ── Per-category baseline schemas (two-tier model) ────────────────────────────

class RequirementCategoryBaselineItemRead(BaseModel):
    id: uuid.UUID
    baseline_id: uuid.UUID
    requirement_id: uuid.UUID | None
    readable_id: str
    type: str
    title: str
    description: str | None
    parent_readable_id: str | None

    model_config = {"from_attributes": True}


class RequirementCategoryBaselineCreate(BaseModel):
    project_id: uuid.UUID
    category_name: str
    version: str


class RequirementCategoryBaselineSummary(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    category_name: str
    version: str
    status: str
    prepared_by: str | None
    prepared_at: datetime | None
    reviewed_by: str | None
    reviewed_at: datetime | None
    approved_by: str | None
    approved_at: datetime | None
    item_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class RequirementCategoryBaselineRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    category_name: str
    version: str
    status: str
    prepared_by: str | None
    prepared_at: datetime | None
    reviewed_by: str | None
    reviewed_at: datetime | None
    approved_by: str | None
    approved_at: datetime | None
    review_notes: str | None
    items: list[RequirementCategoryBaselineItemRead]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RequirementCategoryBaselineStatusTransition(BaseModel):
    status: str
    prepared_by: str | None = None
    reviewed_by: str | None = None
    approved_by: str | None = None
    review_notes: str | None = None


class RequirementCategoryBaselineTransitionResult(BaseModel):
    baseline: RequirementCategoryBaselineRead
    warnings: list[str] = []


# ── Composite SRS components & manifest schemas ───────────────────────────────

class RequirementsBaselineComponentRead(BaseModel):
    """One entry in a composite SRS manifest — a pinned category baseline."""
    id: uuid.UUID
    composite_baseline_id: uuid.UUID
    category_baseline_id: uuid.UUID
    category_baseline: RequirementCategoryBaselineSummary

    model_config = {"from_attributes": True}


class CompositeBaselineCreate(BaseModel):
    """Create a composite SRS manifest pinning a list of category baselines.

    `category_baseline_ids` may be empty (you can pin components later via
    PUT /baselines/{id}/components)."""
    project_id: uuid.UUID
    version: str
    category_baseline_ids: list[uuid.UUID] = []


class CompositeBaselineComponentsUpdate(BaseModel):
    """Body for PUT /baselines/{id}/components — replaces the manifest
    pinning. The frontend calls this from a confirmation-gated re-pin modal."""
    category_baseline_ids: list[uuid.UUID]


class CompositeBaselineRead(BaseModel):
    """Composite SRS manifest read with its components inlined."""
    id: uuid.UUID
    project_id: uuid.UUID
    version: str
    status: str
    prepared_by: str | None
    prepared_at: datetime | None
    reviewed_by: str | None
    reviewed_at: datetime | None
    approved_by: str | None
    approved_at: datetime | None
    review_notes: str | None
    cm_baseline_id: uuid.UUID | None
    components: list[RequirementsBaselineComponentRead]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CompositeBaselineSummary(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    version: str
    status: str
    prepared_by: str | None
    prepared_at: datetime | None
    reviewed_by: str | None
    reviewed_at: datetime | None
    approved_by: str | None
    approved_at: datetime | None
    cm_baseline_id: uuid.UUID | None
    component_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class CompositeBaselineStatusTransition(BaseModel):
    """Body for PUT /baselines/{id}/status."""
    status: str
    prepared_by: str | None = None
    reviewed_by: str | None = None
    approved_by: str | None = None
    review_notes: str | None = None


class CompositeBaselineTransitionResult(BaseModel):
    composite: CompositeBaselineRead
    warnings: list[str] = []


class CategoryLockEntry(BaseModel):
    """Per-category lock state — one row per (project, category) that has any baseline."""
    category_name: str
    is_locked: bool
    locked_by_baseline_id: uuid.UUID | None = None
    locked_by_version: str | None = None
    has_open_draft: bool
    open_draft_id: uuid.UUID | None = None
    open_draft_version: str | None = None
    open_draft_status: str | None = None


class RequirementsLockState(BaseModel):
    """Per-category lock state for the project. The UI walks `categories` to
    render lock banners and gate edit affordances per-section."""
    categories: list[CategoryLockEntry]
