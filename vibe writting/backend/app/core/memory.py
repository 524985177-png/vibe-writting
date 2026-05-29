"""三层记忆系统：L1 会话工作记忆、L2 项目运行记忆、L3 宪法记忆。"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.project import Project
from ..models.chapter import Chapter
from ..models.character import Character
from ..models.document import Document
from ..models.foreshadowing import Foreshadowing
from ..models.timeline import TimelineEvent


class MemoryService:
    """管理三层记忆的加载与组装。"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def load_project(self, project_id: int) -> Project | None:
        """加载项目基本信息。"""
        result = await self.db.execute(select(Project).where(Project.id == project_id))
        return result.scalar_one_or_none()

    async def load_recent_chapters(self, project_id: int, count: int = 3) -> list[Chapter]:
        """加载最近完成的章节（L2 记忆）。"""
        result = await self.db.execute(
            select(Chapter)
            .where(Chapter.project_id == project_id, Chapter.status == "completed")
            .order_by(Chapter.chapter_number.desc())
            .limit(count)
        )
        return list(result.scalars().all())

    async def load_chapter(self, chapter_id: int) -> Chapter | None:
        """加载指定章节。"""
        result = await self.db.execute(select(Chapter).where(Chapter.id == chapter_id))
        return result.scalar_one_or_none()

    async def load_next_chapter(self, project_id: int) -> Chapter | None:
        """加载下一个待创作的章节。"""
        project = await self.load_project(project_id)
        if not project:
            return None
        result = await self.db.execute(
            select(Chapter)
            .where(
                Chapter.project_id == project_id,
                Chapter.chapter_number == project.current_chapter_count + 1,
            )
        )
        return result.scalar_one_or_none()

    async def load_characters(self, project_id: int) -> list[Character]:
        """加载所有角色（L3 记忆）。"""
        result = await self.db.execute(
            select(Character).where(Character.project_id == project_id)
        )
        return list(result.scalars().all())

    async def load_documents(self, project_id: int) -> list[Document]:
        """加载所有文档（L3 记忆）。"""
        result = await self.db.execute(
            select(Document).where(Document.project_id == project_id)
        )
        return list(result.scalars().all())

    async def load_document_by_type(self, project_id: int, doc_type: str) -> Document | None:
        """按类型加载单个文档。"""
        result = await self.db.execute(
            select(Document).where(
                Document.project_id == project_id, Document.doc_type == doc_type
            )
        )
        return result.scalar_one_or_none()

    async def load_foreshadowings(self, project_id: int, status: str = "active") -> list[Foreshadowing]:
        """加载伏笔记录。"""
        result = await self.db.execute(
            select(Foreshadowing).where(
                Foreshadowing.project_id == project_id,
                Foreshadowing.status == status,
            )
        )
        return list(result.scalars().all())

    async def load_timeline(self, project_id: int) -> list[TimelineEvent]:
        """加载时间线事件。"""
        result = await self.db.execute(
            select(TimelineEvent)
            .where(TimelineEvent.project_id == project_id)
            .order_by(TimelineEvent.chapter_number)
        )
        return list(result.scalars().all())

    async def build_memory_for_writing(self, project_id: int, chapter_number: int) -> str:
        """
        组装写作所需的完整记忆内容。

        按优先级加载：
        1. 项目基本信息
        2. 大纲
        3. 最近章节摘要
        4. 活跃伏笔
        5. 相关角色
        6. 世界观/法则
        """
        project = await self.load_project(project_id)
        if not project:
            return ""

        sections = []

        # 项目基本信息
        sections.append(f"""## 项目信息
- 书名：{project.name}
- 题材：{project.genre}
- 风格：{project.style}
- 主角结构：{project.protagonist_structure}
- POV 模式：{project.pov_mode}
- 核心冲突：{project.core_conflict}
- 当前进度：第 {project.current_chapter_count} 章 / 共 {project.target_chapters} 章
- 主线梗概：{project.synopsis}""")

        # 大纲
        outline_doc = await self.load_document_by_type(project_id, "outline")
        if outline_doc and outline_doc.content:
            sections.append(f"## 大纲\n\n{outline_doc.content[:3000]}")

        # 最近章节
        recent_chapters = await self.load_recent_chapters(project_id, 3)
        if recent_chapters:
            chapter_summaries = []
            for ch in recent_chapters:
                summary = ch.content[:500] + "..." if len(ch.content) > 500 else ch.content
                chapter_summaries.append(f"### 第{ch.chapter_number}章：{ch.title}\n{summary}")
            sections.append("## 最近章节摘要\n\n" + "\n\n".join(chapter_summaries))

        # 活跃伏笔
        foreshadowings = await self.load_foreshadowings(project_id)
        if foreshadowings:
            fs_lines = [f"- {f.name}（第{f.chapter_planted}章埋设）" for f in foreshadowings]
            sections.append("## 活跃伏笔\n\n" + "\n".join(fs_lines))

        # 角色
        characters = await self.load_characters(project_id)
        if characters:
            char_sections = []
            for c in characters:
                profile = c.profile_data or {}
                desc = f"- {c.name}（{c.role}）"
                if profile.get("性格核心"):
                    desc += f"：{profile['性格核心']}"
                char_sections.append(desc)
            sections.append("## 角色\n\n" + "\n".join(char_sections))

        # 世界观
        worldview_doc = await self.load_document_by_type(project_id, "worldview")
        if worldview_doc and worldview_doc.content:
            sections.append(f"## 世界观\n\n{worldview_doc.content[:2000]}")

        # 法则
        rules_doc = await self.load_document_by_type(project_id, "rules")
        if rules_doc and rules_doc.content:
            sections.append(f"## 法则\n\n{rules_doc.content[:1000]}")

        return "\n\n---\n\n".join(sections)

    async def build_memory_for_analysis(self, project_id: int) -> str:
        """组装写前分析所需的轻量记忆。"""
        project = await self.load_project(project_id)
        if not project:
            return ""

        sections = []
        sections.append(f"""## 项目状态
- 书名：{project.name}
- 题材：{project.genre}
- 当前进度：第 {project.current_chapter_count} 章 / 共 {project.target_chapters} 章
- 核心冲突：{project.core_conflict}""")

        recent_chapters = await self.load_recent_chapters(project_id, 2)
        if recent_chapters:
            for ch in recent_chapters:
                sections.append(f"### 第{ch.chapter_number}章结尾\n{ch.content[-300:]}")

        foreshadowings = await self.load_foreshadowings(project_id)
        if foreshadowings:
            fs_lines = [f"- {f.name}（第{f.chapter_planted}章）" for f in foreshadowings]
            sections.append("## 活跃伏笔\n" + "\n".join(fs_lines))

        return "\n\n".join(sections)
