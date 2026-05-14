import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

from .constants import COMPONENT_TYPE_PATTERN


# ── Data Flow ─────────────────────────────────────────────────────────────────

class DataFlowCreate(BaseModel):
    data_name: str
    data_type: str | None = None
    frequency: str | None = None
    criticality: str = Field(default="LOW", pattern="^(LOW|MEDIUM|HIGH|CRITICAL)$")
    description: str | None = None

class DataFlowUpdate(BaseModel):
    data_name: str | None = None
    data_type: str | None = None
    frequency: str | None = None
    criticality: str | None = Field(default=None, pattern="^(LOW|MEDIUM|HIGH|CRITICAL)$")
    description: str | None = None

class DataFlowRead(BaseModel):
    id: uuid.UUID
    interface_id: uuid.UUID
    data_name: str
    data_type: str | None
    frequency: str | None
    criticality: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ── Interface ─────────────────────────────────────────────────────────────────

class InterfaceCreate(BaseModel):
    project_id: uuid.UUID
    source_component_id: uuid.UUID
    target_component_id: uuid.UUID
    interface_type: str = Field(default="API", pattern="^(DATA|CONTROL|API|SIGNAL)$")
    name: str
    description: str | None = None
    data_format: str | None = None
    communication_method: str | None = None
    safety_relevant: bool = False

class InterfaceUpdate(BaseModel):
    interface_type: str | None = Field(default=None, pattern="^(DATA|CONTROL|API|SIGNAL)$")
    name: str | None = None
    description: str | None = None
    data_format: str | None = None
    communication_method: str | None = None
    safety_relevant: bool | None = None

class InterfaceRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    source_component_id: uuid.UUID
    target_component_id: uuid.UUID
    source_component_name: str = ""
    target_component_name: str = ""
    interface_type: str
    name: str
    description: str | None
    data_format: str | None
    communication_method: str | None
    safety_relevant: bool
    data_flows: list[DataFlowRead] = []
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ── Component ─────────────────────────────────────────────────────────────────

class ComponentCreate(BaseModel):
    project_id: uuid.UUID
    parent_id: uuid.UUID | None = None
    name: str
    description: str | None = None
    component_type: str = Field(default="SUBSYSTEM", pattern=COMPONENT_TYPE_PATTERN)
    safety_class: str = Field(default="A", pattern="^[ABC]$")
    rationale: str | None = None
    diagram_source: str | None = None

class ComponentUpdate(BaseModel):
    parent_id: uuid.UUID | None = None
    name: str | None = None
    description: str | None = None
    component_type: str | None = Field(default=None, pattern=COMPONENT_TYPE_PATTERN)
    safety_class: str | None = Field(default=None, pattern="^[ABC]$")
    rationale: str | None = None
    diagram_source: str | None = None

class ComponentStatusTransition(BaseModel):
    status: str = Field(pattern="^(DRAFT|REVIEW|APPROVED)$")
    approved_by: str | None = None

class ComponentRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    parent_id: uuid.UUID | None
    name: str
    description: str | None
    component_type: str
    safety_class: str
    status: str
    version: str
    rationale: str | None
    diagram_source: str | None
    approved_by: str | None
    approved_at: datetime | None
    requirement_ids: list[uuid.UUID] = []
    risk_ids: list[uuid.UUID] = []
    testcase_ids: list[uuid.UUID] = []
    interface_count: int = 0
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ── Tree node (recursive) ─────────────────────────────────────────────────────

class ComponentTreeNode(BaseModel):
    id: uuid.UUID
    name: str
    component_type: str
    safety_class: str
    status: str
    version: str
    description: str | None
    requirement_ids: list[uuid.UUID] = []
    risk_ids: list[uuid.UUID] = []
    testcase_ids: list[uuid.UUID] = []
    interface_count: int = 0
    is_compliant: bool = True
    children: list["ComponentTreeNode"] = []


ComponentTreeNode.model_rebuild()


# ── Component-type taxonomy (single source: constants.py) ─────────────────────

class ComponentTypeInfo(BaseModel):
    """One entry of the IEC 62304 §5.3 component-type taxonomy. Served by
    GET /architecture/component-types so the frontend never hardcodes the
    SYSTEM→SUBSYSTEM→ITEM→UNIT chain, parent rules, ordering, or chip colours."""
    name: str
    order: int
    parents: list[str]
    color: str
    bg: str


# ── Link payloads ─────────────────────────────────────────────────────────────

class SetLinksPayload(BaseModel):
    ids: list[uuid.UUID]


# ── Compliance ────────────────────────────────────────────────────────────────

class ArchComplianceCheck(BaseModel):
    rule: str
    label: str
    required: bool
    satisfied: bool
    detail: str

class ArchComplianceStatus(BaseModel):
    component_id: uuid.UUID
    safety_class: str
    is_compliant: bool
    checks: list[ArchComplianceCheck]
    blocks: list[str]


# ── Architecture baseline schemas (IEC 62304 §5.3) ────────────────────────────

class ArchitectureBaselineComponentRead(BaseModel):
    id: uuid.UUID
    baseline_id: uuid.UUID
    component_id: uuid.UUID | None
    name: str
    description: str | None
    component_type: str
    safety_class: str
    version: str
    rationale: str | None
    parent_name: str | None
    sort_order: int

    model_config = ConfigDict(from_attributes=True)


class ArchitectureBaselineInterfaceRead(BaseModel):
    id: uuid.UUID
    baseline_id: uuid.UUID
    interface_id: uuid.UUID | None
    name: str
    description: str | None
    interface_type: str
    source_component_name: str
    target_component_name: str
    data_format: str | None
    communication_method: str | None
    safety_relevant: bool
    data_flows_summary: str | None

    model_config = ConfigDict(from_attributes=True)


class ArchitectureBaselineCreate(BaseModel):
    project_id: uuid.UUID
    version: str


class ArchitectureBaselineSummary(BaseModel):
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
    interface_count: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ArchitectureBaselineRead(BaseModel):
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
    components: list[ArchitectureBaselineComponentRead]
    interfaces: list[ArchitectureBaselineInterfaceRead]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ArchitectureBaselineStatusTransition(BaseModel):
    status: str
    prepared_by: str | None = None
    reviewed_by: str | None = None
    approved_by: str | None = None
    review_notes: str | None = None


class ArchitectureBaselineTransitionResult(BaseModel):
    baseline: ArchitectureBaselineRead
    warnings: list[str] = []


class ArchitectureLockState(BaseModel):
    is_locked: bool
    locked_by_baseline_id: uuid.UUID | None = None
    locked_by_version: str | None = None
    has_open_draft: bool
    open_draft_id: uuid.UUID | None = None
    open_draft_version: str | None = None
    open_draft_status: str | None = None
