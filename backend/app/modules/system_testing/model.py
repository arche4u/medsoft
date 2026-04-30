import uuid
from sqlalchemy import Column, String, Text, Boolean, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.base import Base


class SystemTestCase(Base):
    __tablename__ = "system_test_cases"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    requirement_id = Column(UUID(as_uuid=True), ForeignKey("requirements.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    test_type = Column(String(50), nullable=False, default="FUNCTIONAL")
    preconditions = Column(Text, nullable=True)
    test_steps = Column(Text, nullable=True)
    expected_result = Column(Text, nullable=True)
    safety_relevance = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    results = relationship(
        "SystemTestResult", back_populates="test_case",
        cascade="all, delete-orphan", lazy="selectin",
        order_by="SystemTestResult.execution_date.desc()",
    )
    additional_req_links = relationship("STAdditionalReqLink", back_populates="test_case", cascade="all, delete-orphan", lazy="selectin")
    risk_links = relationship("STRiskLink", back_populates="test_case", cascade="all, delete-orphan", lazy="selectin")


class SystemTestResult(Base):
    __tablename__ = "system_test_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    test_case_id = Column(UUID(as_uuid=True), ForeignKey("system_test_cases.id", ondelete="CASCADE"), nullable=False)
    execution_date = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    result = Column(String(10), nullable=False)
    logs = Column(Text, nullable=True)
    actual_result = Column(Text, nullable=True)
    defects_found = Column(Text, nullable=True)
    executed_by = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    test_case = relationship("SystemTestCase", back_populates="results")


class STAdditionalReqLink(Base):
    __tablename__ = "st_additional_req_links"

    stc_id = Column(UUID(as_uuid=True), ForeignKey("system_test_cases.id", ondelete="CASCADE"), primary_key=True)
    requirement_id = Column(UUID(as_uuid=True), ForeignKey("requirements.id", ondelete="CASCADE"), primary_key=True)

    test_case = relationship("SystemTestCase", back_populates="additional_req_links")


class STRiskLink(Base):
    __tablename__ = "st_risk_links"

    stc_id = Column(UUID(as_uuid=True), ForeignKey("system_test_cases.id", ondelete="CASCADE"), primary_key=True)
    risk_id = Column(UUID(as_uuid=True), ForeignKey("risks.id", ondelete="CASCADE"), primary_key=True)

    test_case = relationship("SystemTestCase", back_populates="risk_links")


class ReleaseArtifact(Base):
    __tablename__ = "release_artifacts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    release_id = Column(UUID(as_uuid=True), ForeignKey("releases.id", ondelete="CASCADE"), nullable=False)
    artifact_type = Column(String(50), nullable=False)
    reference_id = Column(String(255), nullable=False)
    version = Column(String(100), nullable=True)
    label = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ReleaseChecklistItem(Base):
    __tablename__ = "release_checklist_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    release_id = Column(UUID(as_uuid=True), ForeignKey("releases.id", ondelete="CASCADE"), nullable=False)
    item_name = Column(String(255), nullable=False)
    category = Column(String(50), nullable=False, default="GENERAL")
    status = Column(String(20), nullable=False, default="PENDING")
    evidence_link = Column(String(500), nullable=True)
    notes = Column(Text, nullable=True)
    is_auto = Column(Boolean, nullable=False, default=False)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class ReleaseSnapshot(Base):
    __tablename__ = "release_snapshots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    release_id = Column(UUID(as_uuid=True), ForeignKey("releases.id", ondelete="CASCADE"), nullable=False, unique=True)
    snapshot_json = Column(Text, nullable=False)
    captured_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
