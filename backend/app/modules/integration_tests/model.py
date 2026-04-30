import uuid
from sqlalchemy import Column, String, Text, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.base import Base


class IntegrationTestCase(Base):
    __tablename__ = "integration_test_cases"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    interface_id = Column(UUID(as_uuid=True), ForeignKey("sw_interfaces.id", ondelete="SET NULL"), nullable=True)
    source_component_id = Column(UUID(as_uuid=True), ForeignKey("sw_components.id", ondelete="SET NULL"), nullable=True)
    target_component_id = Column(UUID(as_uuid=True), ForeignKey("sw_components.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    test_type = Column(String(50), nullable=False, default="DATA_FLOW")
    preconditions = Column(Text, nullable=True)
    test_steps = Column(Text, nullable=True)
    expected_result = Column(Text, nullable=True)
    safety_relevance = Column(Boolean, nullable=False, default=False)
    latency_threshold_ms = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    results = relationship(
        "IntegrationTestResult", back_populates="test_case",
        cascade="all, delete-orphan", lazy="selectin",
        order_by="IntegrationTestResult.execution_date.desc()",
    )
    requirement_links = relationship("ITCRequirementLink", back_populates="test_case", cascade="all, delete-orphan", lazy="selectin")
    risk_links = relationship("ITCRiskLink", back_populates="test_case", cascade="all, delete-orphan", lazy="selectin")


class IntegrationTestResult(Base):
    __tablename__ = "integration_test_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    test_case_id = Column(UUID(as_uuid=True), ForeignKey("integration_test_cases.id", ondelete="CASCADE"), nullable=False)
    execution_date = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    result = Column(String(10), nullable=False)
    logs = Column(Text, nullable=True)
    latency_ms = Column(Float, nullable=True)
    data_integrity_check = Column(String(10), nullable=True)
    executed_by = Column(String(200), nullable=True)
    error_details = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    test_case = relationship("IntegrationTestCase", back_populates="results")


class ITCRequirementLink(Base):
    __tablename__ = "itc_requirement_links"

    itc_id = Column(UUID(as_uuid=True), ForeignKey("integration_test_cases.id", ondelete="CASCADE"), primary_key=True)
    requirement_id = Column(UUID(as_uuid=True), ForeignKey("requirements.id", ondelete="CASCADE"), primary_key=True)

    test_case = relationship("IntegrationTestCase", back_populates="requirement_links")


class ITCRiskLink(Base):
    __tablename__ = "itc_risk_links"

    itc_id = Column(UUID(as_uuid=True), ForeignKey("integration_test_cases.id", ondelete="CASCADE"), primary_key=True)
    risk_id = Column(UUID(as_uuid=True), ForeignKey("risks.id", ondelete="CASCADE"), primary_key=True)

    test_case = relationship("IntegrationTestCase", back_populates="risk_links")
