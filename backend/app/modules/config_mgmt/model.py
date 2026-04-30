import uuid
from sqlalchemy import Column, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.base import Base


class CMBaseline(Base):
    __tablename__ = "cm_baselines"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    is_released = Column(Boolean, nullable=False, default=False)
    created_by = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    items = relationship("CMBaselineItem", back_populates="baseline", cascade="all, delete-orphan", lazy="selectin")


class CMConfigItem(Base):
    __tablename__ = "cm_config_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    baseline_id = Column(UUID(as_uuid=True), ForeignKey("cm_baselines.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    item_type = Column(String(50), nullable=False)
    reference_id = Column(String(255), nullable=True)
    version = Column(String(100), nullable=False, default="1.0")
    status = Column(String(20), nullable=False, default="DRAFT")
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    version_history = relationship("CMVersionHistory", back_populates="config_item", cascade="all, delete-orphan", lazy="selectin", order_by="CMVersionHistory.created_at.desc()")


class CMBaselineItem(Base):
    __tablename__ = "cm_baseline_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    baseline_id = Column(UUID(as_uuid=True), ForeignKey("cm_baselines.id", ondelete="CASCADE"), nullable=False)
    config_item_id = Column(UUID(as_uuid=True), ForeignKey("cm_config_items.id", ondelete="CASCADE"), nullable=False)

    baseline = relationship("CMBaseline", back_populates="items")
    config_item = relationship("CMConfigItem", lazy="selectin")


class CMChangeRequest(Base):
    __tablename__ = "cm_change_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    change_type = Column(String(50), nullable=False, default="ENHANCEMENT")
    priority = Column(String(20), nullable=False, default="MEDIUM")
    status = Column(String(30), nullable=False, default="OPEN")
    created_by = Column(String(200), nullable=True)
    resolution_notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    impacts = relationship("CMChangeImpact", back_populates="change_request", cascade="all, delete-orphan", lazy="selectin")


class CMChangeImpact(Base):
    __tablename__ = "cm_change_impacts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    change_request_id = Column(UUID(as_uuid=True), ForeignKey("cm_change_requests.id", ondelete="CASCADE"), nullable=False)
    affected_item_type = Column(String(50), nullable=False)
    affected_item_id = Column(String(255), nullable=False)
    affected_item_name = Column(String(255), nullable=True)
    impact_description = Column(Text, nullable=True)
    revalidation_required = Column(Boolean, nullable=False, default=False)
    revalidation_status = Column(String(20), nullable=False, default="PENDING")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    change_request = relationship("CMChangeRequest", back_populates="impacts")


class CMVersionHistory(Base):
    __tablename__ = "cm_version_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    config_item_id = Column(UUID(as_uuid=True), ForeignKey("cm_config_items.id", ondelete="CASCADE"), nullable=False)
    version = Column(String(100), nullable=False)
    change_request_id = Column(UUID(as_uuid=True), ForeignKey("cm_change_requests.id", ondelete="SET NULL"), nullable=True)
    change_summary = Column(Text, nullable=True)
    changed_by = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    config_item = relationship("CMConfigItem", back_populates="version_history")
