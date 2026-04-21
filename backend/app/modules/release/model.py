import enum
import uuid
from sqlalchemy import Enum as SAEnum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.base import Base, TimestampMixin


class ReleaseStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED = "APPROVED"
    RELEASED = "RELEASED"


VALID_RELEASE_TRANSITIONS: dict[ReleaseStatus, set[ReleaseStatus]] = {
    ReleaseStatus.DRAFT: {ReleaseStatus.UNDER_REVIEW},
    ReleaseStatus.UNDER_REVIEW: {ReleaseStatus.APPROVED},
    ReleaseStatus.APPROVED: {ReleaseStatus.RELEASED},
    ReleaseStatus.RELEASED: set(),
}


class Release(Base, TimestampMixin):
    __tablename__ = "releases"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[ReleaseStatus] = mapped_column(
        SAEnum(ReleaseStatus, name="releasestatus"),
        nullable=False,
        default=ReleaseStatus.DRAFT,
    )

    items: Mapped[list["ReleaseItem"]] = relationship(
        back_populates="release", cascade="all, delete-orphan"
    )


class ReleaseItem(Base):
    __tablename__ = "release_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    release_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("releases.id"), nullable=False
    )
    requirement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirements.id"), nullable=True
    )
    testcase_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("testcases.id"), nullable=True
    )
    design_element_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("design_elements.id"), nullable=True
    )

    release: Mapped["Release"] = relationship(back_populates="items")
