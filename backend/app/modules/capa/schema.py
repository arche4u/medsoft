from __future__ import annotations
from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel
import uuid


class ProblemLinkRead(BaseModel):
    id: uuid.UUID
    problem_id: uuid.UUID
    linked_type: str
    linked_id: str
    linked_name: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}


class ProblemLinkCreate(BaseModel):
    linked_type: str
    linked_id: str
    linked_name: Optional[str] = None


class RootCauseRead(BaseModel):
    id: uuid.UUID
    problem_id: uuid.UUID
    root_cause_type: str
    description: str
    identified_by: Optional[str]
    identified_at: datetime
    created_at: datetime
    model_config = {"from_attributes": True}


class RootCauseCreate(BaseModel):
    root_cause_type: str
    description: str
    identified_by: Optional[str] = None


class CAPAVerificationRead(BaseModel):
    id: uuid.UUID
    capa_id: uuid.UUID
    verification_method: Optional[str]
    result: str
    evidence_link: Optional[str]
    verified_by: Optional[str]
    verified_at: datetime
    notes: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}


class CAPAVerificationCreate(BaseModel):
    verification_method: Optional[str] = None
    result: str = "PASS"
    evidence_link: Optional[str] = None
    verified_by: Optional[str] = None
    notes: Optional[str] = None


class CAPARead(BaseModel):
    id: uuid.UUID
    problem_id: uuid.UUID
    action_type: str
    description: str
    assigned_to: Optional[str]
    due_date: Optional[date]
    status: str
    verifications: List[CAPAVerificationRead]
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class CAPACreate(BaseModel):
    action_type: str = "CORRECTIVE"
    description: str
    assigned_to: Optional[str] = None
    due_date: Optional[date] = None


class CAPAUpdate(BaseModel):
    action_type: Optional[str] = None
    description: Optional[str] = None
    assigned_to: Optional[str] = None
    due_date: Optional[date] = None
    status: Optional[str] = None


class ProblemReportRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    description: Optional[str]
    source: Optional[str]
    severity: str
    status: str
    related_release_id: Optional[uuid.UUID]
    reported_by: Optional[str]
    links: List[ProblemLinkRead]
    root_causes: List[RootCauseRead]
    capas: List[CAPARead]
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class ProblemReportCreate(BaseModel):
    project_id: uuid.UUID
    title: str
    description: Optional[str] = None
    source: Optional[str] = None
    severity: str = "MEDIUM"
    related_release_id: Optional[uuid.UUID] = None
    reported_by: Optional[str] = None


class ProblemReportUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    source: Optional[str] = None
    severity: Optional[str] = None
    reported_by: Optional[str] = None


class ProblemStatusTransition(BaseModel):
    status: str


class MaintenanceRecordRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    related_release_id: Optional[uuid.UUID]
    change_request_id: Optional[uuid.UUID]
    description: str
    update_type: str
    deployed_version: Optional[str]
    deployment_date: Optional[date]
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class MaintenanceRecordCreate(BaseModel):
    project_id: uuid.UUID
    related_release_id: Optional[uuid.UUID] = None
    change_request_id: Optional[uuid.UUID] = None
    description: str
    update_type: str = "PATCH"
    deployed_version: Optional[str] = None
    deployment_date: Optional[date] = None


class MaintenanceRecordUpdate(BaseModel):
    description: Optional[str] = None
    update_type: Optional[str] = None
    deployed_version: Optional[str] = None
    deployment_date: Optional[date] = None


class CAPAReleaseCheck(BaseModel):
    has_open_capas: bool
    has_unverified_capas: bool
    has_unresolved_critical: bool
    is_blocked: bool
    block_reasons: List[str]
