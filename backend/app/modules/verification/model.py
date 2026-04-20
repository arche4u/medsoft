import enum
import uuid
from datetime import datetime
from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.base import Base


class ExecutionStatus(str, enum.Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    BLOCKED = "BLOCKED"


class TestExecution(Base):
    __tablename__ = "test_executions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    testcase_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("testcases.id"), nullable=False)
    status: Mapped[ExecutionStatus] = mapped_column(SAEnum(ExecutionStatus, name="executionstatus"), nullable=False)
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
