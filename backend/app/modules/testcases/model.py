import uuid
from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.base import Base, TimestampMixin


class TestCategory(Base, TimestampMixin):
    """Per-project test folder/category definitions (test suites, test phases, etc.)."""
    __tablename__ = "test_categories"
    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_test_category_project_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#546e7a")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=99)
    is_builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class TestCase(Base, TimestampMixin):
    __tablename__ = "testcases"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    readable_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    project: Mapped["Project"] = relationship(back_populates="testcases")
    tracelinks: Mapped[list["TraceLink"]] = relationship(back_populates="testcase", cascade="all, delete-orphan", passive_deletes=True)
