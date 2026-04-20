import uuid
from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.base import Base


class TraceLink(Base):
    __tablename__ = "tracelinks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    requirement_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("requirements.id"), nullable=False)
    testcase_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("testcases.id"), nullable=False)

    requirement: Mapped["Requirement"] = relationship(back_populates="tracelinks")
    testcase: Mapped["TestCase"] = relationship(back_populates="tracelinks")
