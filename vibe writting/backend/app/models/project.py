"""项目模型。"""

from datetime import datetime

from sqlalchemy import String, Text, Integer, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    genre: Mapped[str] = mapped_column(String(100), default="")
    style: Mapped[str] = mapped_column(String(100), default="")
    protagonist_structure: Mapped[str] = mapped_column(String(50), default="single")
    target_chapters: Mapped[int] = mapped_column(Integer, default=20)
    current_chapter_count: Mapped[int] = mapped_column(Integer, default=0)
    pov_mode: Mapped[str] = mapped_column(String(50), default="single")
    core_conflict: Mapped[str] = mapped_column(Text, default="")
    synopsis: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    chapters: Mapped[list["Chapter"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    characters: Mapped[list["Character"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    documents: Mapped[list["Document"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    foreshadowings: Mapped[list["Foreshadowing"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    timeline_events: Mapped[list["TimelineEvent"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    usage_logs: Mapped[list["UsageLog"]] = relationship(back_populates="project", cascade="all, delete-orphan")


from .chapter import Chapter
from .character import Character
from .document import Document
from .foreshadowing import Foreshadowing
from .timeline import TimelineEvent
from .usage import UsageLog
