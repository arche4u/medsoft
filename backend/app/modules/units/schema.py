from __future__ import annotations
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
import uuid


class CodeArtifactCreate(BaseModel):
    repository: str
    branch: Optional[str] = None
    commit_id: Optional[str] = None
    file_path: Optional[str] = None
    version_tag: Optional[str] = None


class CodeArtifactUpdate(BaseModel):
    repository: Optional[str] = None
    branch: Optional[str] = None
    commit_id: Optional[str] = None
    file_path: Optional[str] = None
    version_tag: Optional[str] = None


class CodeArtifactRead(BaseModel):
    id: uuid.UUID
    unit_id: uuid.UUID
    repository: str
    branch: Optional[str]
    commit_id: Optional[str]
    file_path: Optional[str]
    version_tag: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UnitTestResultCreate(BaseModel):
    result: str  # PASS | FAIL
    logs: Optional[str] = None
    coverage_percentage: Optional[float] = None
    executed_by: Optional[str] = None


class UnitTestResultRead(BaseModel):
    id: uuid.UUID
    test_case_id: uuid.UUID
    execution_date: datetime
    result: str
    logs: Optional[str]
    coverage_percentage: Optional[float]
    executed_by: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class UnitTestCaseCreate(BaseModel):
    name: str
    description: Optional[str] = None
    test_type: str = "FUNCTIONAL"
    expected_result: Optional[str] = None


class UnitTestCaseUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    test_type: Optional[str] = None
    expected_result: Optional[str] = None


class UnitTestCaseRead(BaseModel):
    id: uuid.UUID
    unit_id: uuid.UUID
    name: str
    description: Optional[str]
    test_type: str
    expected_result: Optional[str]
    results: List[UnitTestResultRead]
    latest_result: Optional[str] = None   # computed
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SoftwareUnitCreate(BaseModel):
    project_id: uuid.UUID
    component_id: Optional[uuid.UUID] = None
    software_item_id: Optional[uuid.UUID] = None
    name: str
    description: Optional[str] = None
    programming_language: Optional[str] = None
    repository_url: Optional[str] = None
    file_path: Optional[str] = None
    safety_class: str = "A"


class SoftwareUnitUpdate(BaseModel):
    component_id: Optional[uuid.UUID] = None
    software_item_id: Optional[uuid.UUID] = None
    name: Optional[str] = None
    description: Optional[str] = None
    programming_language: Optional[str] = None
    repository_url: Optional[str] = None
    file_path: Optional[str] = None
    safety_class: Optional[str] = None


class SoftwareUnitRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    component_id: Optional[uuid.UUID]
    software_item_id: Optional[uuid.UUID]
    name: str
    description: Optional[str]
    programming_language: Optional[str]
    repository_url: Optional[str]
    file_path: Optional[str]
    safety_class: str
    status: str
    artifacts: List[CodeArtifactRead]
    test_cases: List[UnitTestCaseRead]
    requirement_ids: List[str]
    risk_ids: List[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SetLinksPayload(BaseModel):
    ids: List[str]


class UnitStatusTransition(BaseModel):
    status: str  # DRAFT | IMPLEMENTED | VERIFIED


class UnitComplianceCheck(BaseModel):
    rule: str
    label: str
    required: bool
    satisfied: bool
    detail: str


class UnitCompliance(BaseModel):
    unit_id: str
    safety_class: str
    is_compliant: bool
    checks: List[UnitComplianceCheck]
    blocks: List[str]


class UnitCoverageMetrics(BaseModel):
    unit_id: str
    total_test_cases: int
    executed: int
    passed: int
    failed: int
    not_run: int
    avg_coverage: Optional[float]
    min_coverage: Optional[float]
    pass_rate: float
