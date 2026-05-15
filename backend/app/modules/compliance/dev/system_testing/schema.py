from __future__ import annotations
from datetime import datetime
from typing import Optional, List, Any, Dict
from pydantic import BaseModel
import uuid


class STResultCreate(BaseModel):
    result: str  # PASS | FAIL
    logs: Optional[str] = None
    actual_result: Optional[str] = None
    defects_found: Optional[str] = None
    executed_by: Optional[str] = None


class STResultRead(BaseModel):
    id: uuid.UUID
    test_case_id: uuid.UUID
    execution_date: datetime
    result: str
    logs: Optional[str]
    actual_result: Optional[str]
    defects_found: Optional[str]
    executed_by: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class SystemTestCaseCreate(BaseModel):
    project_id: uuid.UUID
    requirement_id: Optional[uuid.UUID] = None
    name: str
    description: Optional[str] = None
    test_type: str = "FUNCTIONAL"
    preconditions: Optional[str] = None
    test_steps: Optional[str] = None
    expected_result: Optional[str] = None
    safety_relevance: bool = False


class SystemTestCaseUpdate(BaseModel):
    requirement_id: Optional[uuid.UUID] = None
    name: Optional[str] = None
    description: Optional[str] = None
    test_type: Optional[str] = None
    preconditions: Optional[str] = None
    test_steps: Optional[str] = None
    expected_result: Optional[str] = None
    safety_relevance: Optional[bool] = None


class SystemTestCaseRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    requirement_id: Optional[uuid.UUID]
    name: str
    description: Optional[str]
    test_type: str
    preconditions: Optional[str]
    test_steps: Optional[str]
    expected_result: Optional[str]
    safety_relevance: bool
    results: List[STResultRead]
    latest_result: Optional[str]
    additional_requirement_ids: List[str]
    risk_ids: List[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SetLinksPayload(BaseModel):
    ids: List[str]


# ── Requirement coverage ───────────────────────────────────────────────────────

class RequirementCoverageItem(BaseModel):
    requirement_id: str
    readable_id: str
    title: str
    req_type: str
    test_count: int
    latest_result: Optional[str]
    is_covered: bool
    has_pass: bool


class ProjectTestCoverage(BaseModel):
    project_id: str
    total_requirements: int
    covered_requirements: int
    uncovered_requirements: int
    coverage_pct: float
    total_tests: int
    passed: int
    failed: int
    not_run: int
    pass_rate: float
    requirements: List[RequirementCoverageItem]
    release_blocked: bool
    release_block_reasons: List[str]


# ── Release management ─────────────────────────────────────────────────────────

class ReleaseArtifactCreate(BaseModel):
    artifact_type: str
    reference_id: str
    version: Optional[str] = None
    label: Optional[str] = None


class ReleaseArtifactRead(BaseModel):
    id: uuid.UUID
    release_id: uuid.UUID
    artifact_type: str
    reference_id: str
    version: Optional[str]
    label: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class ChecklistItemCreate(BaseModel):
    item_name: str
    category: str = "GENERAL"
    evidence_link: Optional[str] = None
    notes: Optional[str] = None
    sort_order: int = 0


class ChecklistItemUpdate(BaseModel):
    item_name: Optional[str] = None
    status: Optional[str] = None
    evidence_link: Optional[str] = None
    notes: Optional[str] = None


class ChecklistItemRead(BaseModel):
    id: uuid.UUID
    release_id: uuid.UUID
    item_name: str
    category: str
    status: str
    evidence_link: Optional[str]
    notes: Optional[str]
    is_auto: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReleaseGateResult(BaseModel):
    gate: str
    label: str
    passed: bool
    detail: str
    blocking: bool


class ReleaseReadiness(BaseModel):
    release_id: str
    project_id: str
    is_ready: bool
    gates: List[ReleaseGateResult]
    blocking_failures: List[str]


class ReleaseSnapshotRead(BaseModel):
    release_id: str
    captured_at: Optional[datetime]
    snapshot: Dict[str, Any]
