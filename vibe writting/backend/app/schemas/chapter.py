"""章节相关 Schema。"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ChapterCreate(BaseModel):
    chapter_number: int
    title: str = ""


class ChapterUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    status: Optional[str] = None
    chapter_number: Optional[int] = None
    scene_plan: Optional[dict] = None


class ChapterResponse(BaseModel):
    id: int
    project_id: int
    chapter_number: int
    title: str
    content: str
    status: str
    word_count: int
    scene_plan: Optional[dict]
    quality_score: Optional[dict]
    pre_analysis: Optional[dict]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChapterListResponse(BaseModel):
    chapters: list[ChapterResponse]
    total: int


class WriteChapterRequest(BaseModel):
    chapter_id: int
    scene_plan: Optional[dict] = None


class PolishRequest(BaseModel):
    text: str
    instruction: str = "润色以下段落，保持原有风格，提升文学质量"


class RewriteRequest(BaseModel):
    text: str
    instruction: str = "重写以下段落"


class ExpandRequest(BaseModel):
    text: str
    instruction: str = "扩写以下段落，增加细节和描写"
