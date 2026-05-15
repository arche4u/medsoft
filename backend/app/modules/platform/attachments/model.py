"""Polymorphic attachment storage.

Each row points at a logical entity via (entity_type, entity_id). The
content lives on disk under `backend/uploads/<project_id>/<id>__<filename>`.
Wired up first for design elements and software units, but the schema is
generic so any module can use it without changes.
"""
import uuid
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base, TimestampMixin


class Attachment(Base, TimestampMixin):
    """Image or PDF supporting document attached to any entity in the system."""
    __tablename__ = "attachments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    # Polymorphic pointer to the owning entity. Not a real FK — entity_id is
    # a UUID stored as String so we don't have to add per-entity-type FKs.
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False)
    # File metadata
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    # Optional human-friendly note from the uploader
    description: Mapped[str | None] = mapped_column(Text)
    uploaded_by: Mapped[str | None] = mapped_column(String(200))
