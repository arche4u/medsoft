from __future__ import annotations
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
import uuid

# ── Version history ───────────────────────────────────────────────────────────

class VersionHistoryRead(BaseModel):
    id: uuid.UUID
    config_item_id: uuid.UUID
    version: str
    change_request_id: Optional[uuid.UUID]
    change_summary: Optional[str]
    changed_by: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Config items ──────────────────────────────────────────────────────────────

class ConfigItemCreate(BaseModel):
    project_id: uuid.UUID
    name: str
    item_type: str
    reference_id: Optional[str] = None
    version: str = "1.0"
    description: Optional[str] = None


class ConfigItemUpdate(BaseModel):
    name: Optional[str] = None
    item_type: Optional[str] = None
    reference_id: Optional[str] = None
    description: Optional[str] = None


class ConfigItemNewVersion(BaseModel):
    version: str
    change_summary: Optional[str] = None
    changed_by: Optional[str] = None
    change_request_id: Optional[uuid.UUID] = None


class ConfigItemRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    baseline_id: Optional[uuid.UUID]
    name: str
    item_type: str
    reference_id: Optional[str]
    version: str
    status: str
    description: Optional[str]
    version_history: List[VersionHistoryRead]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Baselines ─────────────────────────────────────────────────────────────────

class BaselineCreate(BaseModel):
    project_id: uuid.UUID
    name: str
    description: Optional[str] = None
    created_by: Optional[str] = None
    config_item_ids: List[str] = []


class BaselineRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: Optional[str]
    is_released: bool
    created_by: Optional[str]
    created_at: datetime
    item_count: int
    items: List[BaselineItemRead]

    model_config = {"from_attributes": True}


class BaselineItemRead(BaseModel):
    id: uuid.UUID
    baseline_id: uuid.UUID
    config_item_id: uuid.UUID
    config_item_name: str
    config_item_type: str
    config_item_version: str
    config_item_status: str

    model_config = {"from_attributes": True}


BaselineRead.model_rebuild()


# ── Change requests ───────────────────────────────────────────────────────────

class ChangeImpactCreate(BaseModel):
    affected_item_type: str
    affected_item_id: str
    affected_item_name: Optional[str] = None
    impact_description: Optional[str] = None
    revalidation_required: bool = False


class ChangeImpactUpdate(BaseModel):
    affected_item_name: Optional[str] = None
    impact_description: Optional[str] = None
    revalidation_required: Optional[bool] = None
    revalidation_status: Optional[str] = None


class ChangeImpactRead(BaseModel):
    id: uuid.UUID
    change_request_id: uuid.UUID
    affected_item_type: str
    affected_item_id: str
    affected_item_name: Optional[str]
    impact_description: Optional[str]
    revalidation_required: bool
    revalidation_status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChangeRequestCreate(BaseModel):
    project_id: uuid.UUID
    title: str
    description: Optional[str] = None
    change_type: str = "ENHANCEMENT"
    priority: str = "MEDIUM"
    created_by: Optional[str] = None


class ChangeRequestUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    change_type: Optional[str] = None
    priority: Optional[str] = None
    resolution_notes: Optional[str] = None


class ChangeRequestStatusTransition(BaseModel):
    status: str
    resolution_notes: Optional[str] = None


class ChangeRequestRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    description: Optional[str]
    change_type: str
    priority: str
    status: str
    created_by: Optional[str]
    resolution_notes: Optional[str]
    impacts: List[ChangeImpactRead]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Release gate ──────────────────────────────────────────────────────────────

class CMReleaseCheck(BaseModel):
    has_open_critical: bool
    has_incomplete_impact: bool
    has_pending_revalidation: bool
    is_blocked: bool
    block_reasons: List[str]
