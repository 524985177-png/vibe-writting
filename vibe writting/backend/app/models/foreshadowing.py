"""伏笔模型。"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Foreshadowing(Base):
    __tablename__ = "foreshadowings"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    name: Mapped[str] = mapped_column(String(200))
    foreshadow_type: Mapped[str] = mapped_column(String(50), default="")
    chapter_planted: Mapped[int] = mapped_column(Integer, default=0)
    chapter_resolved: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active/resolved
    related_chapters: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    project: Mapped["Project"] = relationship(back_populates="foreshadowings")


from .project import Project
