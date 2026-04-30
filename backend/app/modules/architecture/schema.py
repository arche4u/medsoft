import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


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
    component_type: str = Field(default="SUBSYSTEM", pattern="^(SYSTEM|SUBSYSTEM|ITEM|UNIT)$")
    safety_class: str = Field(default="A", pattern="^[ABC]$")
    rationale: str | None = None

class ComponentUpdate(BaseModel):
    parent_id: uuid.UUID | None = None
    name: str | None = None
    description: str | None = None
    component_type: str | None = Field(default=None, pattern="^(SYSTEM|SUBSYSTEM|ITEM|UNIT)$")
    safety_class: str | None = Field(default=None, pattern="^[ABC]$")
    rationale: str | None = None

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
