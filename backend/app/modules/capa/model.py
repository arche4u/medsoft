import uuid
from sqlalchemy import Column, String, Text, Boolean, DateTime, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.base import Base


class ProblemReport(Base):
    __tablename__ = "problem_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    source = Column(String(100), nullable=True)          # FIELD / AUDIT / TESTING / CUSTOMER / INTERNAL
    severity = Column(String(20), nullable=False, default="MEDIUM")  # LOW / MEDIUM / HIGH / CRITICAL
    status = Column(String(30), nullable=False, default="OPEN")      # OPEN / INVESTIGATING / RESOLVED / CLOSED
    related_release_id = Column(UUID(as_uuid=True), ForeignKey("releases.id", ondelete="SET NULL"), nullable=True)
    reported_by = Column(String(200), nullable=True)
    # §9 — explicit field-discovery date (vs system-logged created_at)
    detection_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    links = relationship("ProblemLink", back_populates="problem", cascade="all, delete-orphan", lazy="selectin")
    root_causes = relationship("RootCause", back_populates="problem", cascade="all, delete-orphan", lazy="selectin")
    capas = relationship("CAPA", back_populates="problem", cascade="all, delete-orphan", lazy="selectin")


class ProblemLink(Base):
    __tablename__ = "problem_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    problem_id = Column(UUID(as_uuid=True), ForeignKey("problem_reports.id", ondelete="CASCADE"), nullable=False)
    linked_type = Column(String(50), nullable=False)   # REQUIREMENT / RISK / TEST_CASE / COMPONENT / CONFIG_ITEM
    linked_id = Column(String(255), nullable=False)
    linked_name = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    problem = relationship("ProblemReport", back_populates="links")


class RootCause(Base):
    __tablename__ = "root_causes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    problem_id = Column(UUID(as_uuid=True), ForeignKey("problem_reports.id", ondelete="CASCADE"), nullable=False)
    root_cause_type = Column(String(50), nullable=False)  # DESIGN / CODE / PROCESS / REQUIREMENTS / ENVIRONMENT / HUMAN_ERROR
    description = Column(Text, nullable=False)
    identified_by = Column(String(200), nullable=True)
    identified_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    problem = relationship("ProblemReport", back_populates="root_causes")


class CAPA(Base):
    __tablename__ = "capas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    problem_id = Column(UUID(as_uuid=True), ForeignKey("problem_reports.id", ondelete="CASCADE"), nullable=False)
    action_type = Column(String(20), nullable=False, default="CORRECTIVE")  # CORRECTIVE / PREVENTIVE
    description = Column(Text, nullable=False)
    assigned_to = Column(String(200), nullable=True)
    due_date = Column(Date, nullable=True)
    status = Column(String(30), nullable=False, default="OPEN")  # OPEN / IN_PROGRESS / COMPLETED / VERIFIED
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    problem = relationship("ProblemReport", back_populates="capas")
    verifications = relationship("CAPAVerification", back_populates="capa", cascade="all, delete-orphan", lazy="selectin")


class CAPAVerification(Base):
    __tablename__ = "capa_verifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    capa_id = Column(UUID(as_uuid=True), ForeignKey("capas.id", ondelete="CASCADE"), nullable=False)
    verification_method = Column(String(100), nullable=True)
    result = Column(String(10), nullable=False, default="PASS")  # PASS / FAIL
    evidence_link = Column(String(500), nullable=True)
    verified_by = Column(String(200), nullable=True)
    verified_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    capa = relationship("CAPA", back_populates="verifications")


class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    related_release_id = Column(UUID(as_uuid=True), ForeignKey("releases.id", ondelete="SET NULL"), nullable=True)
    change_request_id = Column(UUID(as_uuid=True), ForeignKey("cm_change_requests.id", ondelete="SET NULL"), nullable=True)
    description = Column(Text, nullable=False)
    update_type = Column(String(50), nullable=False, default="PATCH")  # MAJOR / MINOR / PATCH / HOTFIX / EMERGENCY
    deployed_version = Column(String(100), nullable=True)
    deployment_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
