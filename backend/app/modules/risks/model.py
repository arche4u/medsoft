import uuid
from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.base import Base


def _compute_level(severity: int, probability: int) -> str:
    score = severity * probability
    if score <= 4:
        return "LOW"
    elif score <= 9:
        return "MEDIUM"
    return "HIGH"


class Risk(Base):
    __tablename__ = "risks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    requirement_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("requirements.id"), nullable=False)
    hazard: Mapped[str] = mapped_column(String(500), nullable=False)
    hazardous_situation: Mapped[str] = mapped_column(String(500), nullable=False)
    harm: Mapped[str] = mapped_column(String(500), nullable=False)
    severity: Mapped[int] = mapped_column(Integer, nullable=False)
    probability: Mapped[int] = mapped_column(Integer, nullable=False)
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False)

    requirement: Mapped["Requirement"] = relationship(back_populates="risks")
