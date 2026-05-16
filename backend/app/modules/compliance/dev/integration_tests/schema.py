from __future__ import annotations
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
import uuid


class ITCResultCreate(BaseModel):
    result: str  # PASS | FAIL
    logs: Optional[str] = None
    latency_ms: Optional[float] = None
    data_integrity_check: Optional[str] = None  # PASS | FAIL
    executed_by: Optional[str] = None
    error_details: Optional[str] = None


class ITCResultRead(BaseModel):
    id: uuid.UUID
    test_case_id: uuid.UUID
    execution_date: datetime
    result: str
    logs: Optional[str]
    latency_ms: Optional[float]
    data_integrity_check: Optional[str]
    executed_by: Optional[str]
    error_details: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class IntegrationTestCaseCreate(BaseModel):
    project_id: uuid.UUID
    interface_id: Optional[uuid.UUID] = None
    source_component_id: Optional[uuid.UUID] = None
    target_component_id: Optional[uuid.UUID] = None
    name: str
    description: Optional[str] = None
    test_type: str = "DATA_FLOW"
    preconditions: Optional[str] = None
    test_steps: Optional[str] = None
    expected_result: Optional[str] = None
    safety_relevance: bool = False
    latency_threshold_ms: Optional[float] = None


class IntegrationTestCaseUpdate(BaseModel):
    interface_id: Optional[uuid.UUID] = None
    source_component_id: Optional[uuid.UUID] = None
    target_component_id: Optional[uuid.UUID] = None
    name: Optional[str] = None
    description: Optional[str] = None
    test_type: Optional[str] = None
    preconditions: Optional[str] = None
    test_steps: Optional[str] = None
    expected_result: Optional[str] = None
    safety_relevance: Optional[bool] = None
    latency_threshold_ms: Optional[float] = None


class IntegrationTestCaseRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    interface_id: Optional[uuid.UUID]
    source_component_id: Optional[uuid.UUID]
    target_component_id: Optional[uuid.UUID]
    name: str
    description: Optional[str]
    test_type: str
    preconditions: Optional[str]
    test_steps: Optional[str]
    expected_result: Optional[str]
    safety_relevance: bool
    latency_threshold_ms: Optional[float]
    results: List[ITCResultRead]
    latest_result: Optional[str]
    requirement_ids: List[str]
    risk_ids: List[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SetLinksPayload(BaseModel):
    ids: List[str]


# ── Coverage / compliance ──────────────────────────────────────────────────────

class InterfaceCoverageItem(BaseModel):
    interface_id: str
    interface_name: str
    source_component: str
    target_component: str
    interface_type: str
    safety_relevant: bool
    test_count: int
    latest_result: Optional[str]
    has_error_handling_test: bool
    has_pass: bool
    latency_ok: bool
    is_covered: bool
    coverage_gap: Optional[str]


class ProjectCoverage(BaseModel):
    project_id: str
    total_interfaces: int
    covered_interfaces: int
    uncovered_interfaces: int
    coverage_pct: float
    total_tests: int
    passed: int
    failed: int
    not_run: int
    pass_rate: float
    safety_relevant_uncovered: int
    # §5.6 — when `safety_relevant_only=true` was passed, `interfaces` is
    # already filtered to safety-relevant rows; these counters expose how
    # many non-safety interfaces were excluded so callers can show context.
    safety_relevant_only: bool = False
    total_interfaces_all: int | None = None
    excluded_non_safety_interfaces: int | None = None
    interfaces: List[InterfaceCoverageItem]
    release_blocked: bool
    release_block_reasons: List[str]


class PerformanceMetrics(BaseModel):
    test_case_id: str
    test_case_name: str
    interface_id: Optional[str]
    latency_threshold_ms: Optional[float]
    executions: int
    avg_latency_ms: Optional[float]
    max_latency_ms: Optional[float]
    min_latency_ms: Optional[float]
    threshold_breaches: int
    data_integrity_pass_rate: Optional[float]
