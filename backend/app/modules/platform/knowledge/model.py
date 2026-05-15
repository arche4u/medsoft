import uuid
from sqlalchemy import Boolean, ForeignKey, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.base import Base, TimestampMixin


class KnowledgeEntry(Base, TimestampMixin):
    """
    Knowledge base entries for AI context and human reference.
    Global entries (project_id=None, is_global=True) are seeded once and visible to all projects.
    Project entries (project_id set, is_global=False) are per-project and fully editable.
    """
    __tablename__ = "knowledge_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True
    )
    is_global: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Classification
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    # STANDARD_CLAUSE | CHECKLIST | COMPANY_RULE | REGULATORY | GUIDANCE

    standard: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # IEC62304 | ISO14971 | IEC62366 | FDA | MDR | ISO13485 | COMPANY

    clause_ref: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # e.g. §5.2, §7.1, Annex A

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str | None] = mapped_column(String(500), nullable=True)  # one-liner shown in lists
    content: Mapped[str | None] = mapped_column(Text, nullable=True)         # full guidance text
    tags: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
    sort_order: Mapped[int] = mapped_column(nullable=False, default=99)
