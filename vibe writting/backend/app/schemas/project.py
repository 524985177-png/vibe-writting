"""项目相关 Schema。"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    genre: str = ""
    style: str = ""
    protagonist_structure: str = "single"
    target_chapters: int = 20
    pov_mode: str = "single"
    core_conflict: str = ""
    synopsis: str = ""


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    genre: Optional[str] = None
    style: Optional[str] = None
    protagonist_structure: Optional[str] = None
    target_chapters: Optional[int] = None
    current_chapter_count: Optional[int] = None
    pov_mode: Optional[str] = None
    core_conflict: Optional[str] = None
    synopsis: Optional[str] = None


class ProjectResponse(BaseModel):
    id: int
    name: str
    genre: str
    style: str
    protagonist_structure: str
    target_chapters: int
    current_chapter_count: int
    pov_mode: str
    core_conflict: str
    synopsis: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectListResponse(BaseModel):
    projects: list[ProjectResponse]
    total: int
