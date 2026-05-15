import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


# ── Source / severity / status taxonomies ────────────────────────────────────
# Kept here so the frontend GETs them via /feedback/meta — never hardcoded.

FEEDBACK_SOURCES: list[dict] = [
    {"name": "CUSTOMER_SUPPORT", "label": "Customer Support",         "color": "#1565c0"},
    {"name": "VIGILANCE",        "label": "Vigilance / Adverse Event","color": "#b71c1c"},
    {"name": "PMCF",             "label": "Post-Market Clinical F-U", "color": "#6a1b9a"},
    {"name": "FIELD_SERVICE",    "label": "Field Service",            "color": "#e65100"},
    {"name": "INTERNAL",         "label": "Internal Report",          "color": "#546e7a"},
    {"name": "LITERATURE",       "label": "Literature",               "color": "#2e7d32"},
    {"name": "SOCIAL_MEDIA",     "label": "Social Media / Web",       "color": "#5d4037"},
    {"name": "REGULATORY",       "label": "Regulator Notification",   "color": "#0d47a1"},
]

FEEDBACK_SEVERITIES: list[dict] = [
    {"name": "COSMETIC", "label": "Cosmetic", "color": "#9e9e9e"},
    {"name": "MINOR",    "label": "Minor",    "color": "#2e7d32"},
    {"name": "MAJOR",    "label": "Major",    "color": "#e65100"},
    {"name": "SAFETY",   "label": "Safety",   "color": "#b71c1c"},
]

FEEDBACK_STATUSES: list[dict] = [
    {"name": "NEW",          "label": "New",          "color": "#1565c0"},
    {"name": "UNDER_REVIEW", "label": "Under Review", "color": "#e65100"},
    {"name": "EVALUATED",    "label": "Evaluated",    "color": "#6a1b9a"},
    {"name": "ESCALATED",    "label": "Escalated",    "color": "#b71c1c"},
    {"name": "CLOSED",       "label": "Closed",       "color": "#2e7d32"},
]


class FeedbackMeta(BaseModel):
    sources: list[dict]
    severities: list[dict]
    statuses: list[dict]


# ── CRUD payloads ────────────────────────────────────────────────────────────

class FeedbackCreate(BaseModel):
    project_id: uuid.UUID
    source: str = Field(min_length=1, max_length=30)
    reporter: str | None = None
    reported_at: datetime | None = None
    summary: str = Field(min_length=1, max_length=500)
    description: str | None = None
    affected_version: str | None = None
    severity: str = "MINOR"
    adverse_event: bool = False
    spec_deviation: bool = False


class FeedbackUpdate(BaseModel):
    source: str | None = None
    reporter: str | None = None
    reported_at: datetime | None = None
    summary: str | None = None
    description: str | None = None
    affected_version: str | None = None
    severity: str | None = None
    adverse_event: bool | None = None
    spec_deviation: bool | None = None


class FeedbackEvaluate(BaseModel):
    """§6.2.1.2 — record the evaluation decision and §6.2.1.3 safety
    assessment. Transitions status NEW/UNDER_REVIEW → EVALUATED."""
    is_problem: bool
    evaluation_notes: str | None = None
    evaluated_by: str | None = None
    safety_impact_assessment: str | None = None
    change_needed: bool | None = None


class FeedbackEscalate(BaseModel):
    """Transition EVALUATED → ESCALATED by creating a linked Problem Report
    (§9) or Change Request (§6.3). Exactly one of `to_problem` / `to_change_request`
    must be true; the router builds the linked entity using the feedback's
    summary + description as its seed content."""
    to_problem: bool = False
    to_change_request: bool = False
    extra_notes: str | None = None


class FeedbackClose(BaseModel):
    """Close a feedback item — either after escalation completes, or to mark
    a non-actionable item with a rationale."""
    closure_rationale: str


class FeedbackRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    readable_id: str
    source: str
    reporter: str | None
    reported_at: datetime | None
    summary: str
    description: str | None
    affected_version: str | None
    severity: str
    adverse_event: bool
    spec_deviation: bool
    is_problem: bool | None
    status: str
    evaluation_notes: str | None
    evaluated_by: str | None
    evaluated_at: datetime | None
    safety_impact_assessment: str | None
    change_needed: bool | None
    closure_rationale: str | None
    escalated_problem_id: uuid.UUID | None
    escalated_change_request_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime | None
    model_config = ConfigDict(from_attributes=True)
