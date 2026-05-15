import uuid
from sqlalchemy import Column, String, Text, Float, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.base import Base


class SoftwareUnit(Base):
    __tablename__ = "software_units"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    component_id = Column(UUID(as_uuid=True), ForeignKey("sw_components.id", ondelete="SET NULL"), nullable=True)
    # IEC 62304 §4.3 — optional direct link from a §5.5 SoftwareUnit to the
    # §4.3 SoftwareItem it verifies. Lets the §4.3 compliance rollup count
    # unit coverage without going through a Requirement link.
    software_item_id = Column(UUID(as_uuid=True), ForeignKey("software_items.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    programming_language = Column(String(100), nullable=True)
    repository_url = Column(String(500), nullable=True)
    file_path = Column(String(500), nullable=True)
    safety_class = Column(String(1), nullable=False, default="A")
    status = Column(String(20), nullable=False, default="DRAFT")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    artifacts = relationship("CodeArtifact", back_populates="unit", cascade="all, delete-orphan", lazy="selectin")
    test_cases = relationship("UnitTestCase", back_populates="unit", cascade="all, delete-orphan", lazy="selectin")
    requirement_links = relationship("UnitRequirementLink", back_populates="unit", cascade="all, delete-orphan", lazy="selectin")
    risk_links = relationship("UnitRiskLink", back_populates="unit", cascade="all, delete-orphan", lazy="selectin")
    software_item = relationship("SoftwareItem", foreign_keys=[software_item_id], lazy="select")


class CodeArtifact(Base):
    __tablename__ = "code_artifacts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    unit_id = Column(UUID(as_uuid=True), ForeignKey("software_units.id", ondelete="CASCADE"), nullable=False)
    repository = Column(String(500), nullable=False)
    branch = Column(String(200), nullable=True)
    commit_id = Column(String(200), nullable=True)
    file_path = Column(String(500), nullable=True)
    version_tag = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    unit = relationship("SoftwareUnit", back_populates="artifacts")


class UnitTestCase(Base):
    __tablename__ = "unit_test_cases"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    unit_id = Column(UUID(as_uuid=True), ForeignKey("software_units.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    test_type = Column(String(50), nullable=False, default="FUNCTIONAL")
    expected_result = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    unit = relationship("SoftwareUnit", back_populates="test_cases")
    results = relationship("UnitTestResult", back_populates="test_case", cascade="all, delete-orphan", lazy="selectin", order_by="UnitTestResult.execution_date.desc()")


class UnitTestResult(Base):
    __tablename__ = "unit_test_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    test_case_id = Column(UUID(as_uuid=True), ForeignKey("unit_test_cases.id", ondelete="CASCADE"), nullable=False)
    execution_date = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    result = Column(String(10), nullable=False)
    logs = Column(Text, nullable=True)
    coverage_percentage = Column(Float, nullable=True)
    executed_by = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    test_case = relationship("UnitTestCase", back_populates="results")


class UnitRequirementLink(Base):
    __tablename__ = "unit_requirement_links"

    unit_id = Column(UUID(as_uuid=True), ForeignKey("software_units.id", ondelete="CASCADE"), primary_key=True)
    requirement_id = Column(UUID(as_uuid=True), ForeignKey("requirements.id", ondelete="CASCADE"), primary_key=True)

    unit = relationship("SoftwareUnit", back_populates="requirement_links")


class UnitRiskLink(Base):
    __tablename__ = "unit_risk_links"

    unit_id = Column(UUID(as_uuid=True), ForeignKey("software_units.id", ondelete="CASCADE"), primary_key=True)
    risk_id = Column(UUID(as_uuid=True), ForeignKey("risks.id", ondelete="CASCADE"), primary_key=True)

    unit = relationship("SoftwareUnit", back_populates="risk_links")
