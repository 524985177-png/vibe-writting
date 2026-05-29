"""章节管理 API。"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models.chapter import Chapter
from ..models.project import Project
from ..schemas.chapter import ChapterCreate, ChapterUpdate, ChapterResponse, ChapterListResponse

router = APIRouter(prefix="/api/projects/{project_id}/chapters", tags=["chapters"])


@router.get("", response_model=ChapterListResponse)
async def list_chapters(project_id: int, db: AsyncSession = Depends(get_db)):
    """获取项目的所有章节。"""
    result = await db.execute(
        select(Chapter)
        .where(Chapter.project_id == project_id)
        .order_by(Chapter.chapter_number)
    )
    chapters = list(result.scalars().all())
    return ChapterListResponse(chapters=chapters, total=len(chapters))


@router.post("", response_model=ChapterResponse)
async def create_chapter(project_id: int, data: ChapterCreate, db: AsyncSession = Depends(get_db)):
    """创建新章节。"""
    # 检查项目存在
    project_result = await db.execute(select(Project).where(Project.id == project_id))
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 检查章节号不重复
    existing = await db.execute(
        select(Chapter).where(
            Chapter.project_id == project_id,
            Chapter.chapter_number == data.chapter_number,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"第 {data.chapter_number} 章已存在")

    chapter = Chapter(project_id=project_id, **data.model_dump())
    db.add(chapter)

    # 自动更新项目章节数
    project.current_chapter_count = (project.current_chapter_count or 0) + 1

    await db.commit()
    await db.refresh(chapter)
    return chapter


@router.get("/{chapter_id}", response_model=ChapterResponse)
async def get_chapter(project_id: int, chapter_id: int, db: AsyncSession = Depends(get_db)):
    """获取章节详情。"""
    result = await db.execute(
        select(Chapter).where(Chapter.id == chapter_id, Chapter.project_id == project_id)
    )
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")
    return chapter


@router.put("/{chapter_id}", response_model=ChapterResponse)
async def update_chapter(
    project_id: int, chapter_id: int, data: ChapterUpdate, db: AsyncSession = Depends(get_db)
):
    """更新章节内容。"""
    result = await db.execute(
        select(Chapter).where(Chapter.id == chapter_id, Chapter.project_id == project_id)
    )
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(chapter, key, value)

    # 自动计算字数
    if "content" in update_data:
        chapter.word_count = len(update_data["content"].replace(" ", "").replace("\n", ""))

    await db.commit()
    await db.refresh(chapter)
    return chapter


@router.delete("/{chapter_id}")
async def delete_chapter(project_id: int, chapter_id: int, db: AsyncSession = Depends(get_db)):
    """删除章节。"""
    result = await db.execute(
        select(Chapter).where(Chapter.id == chapter_id, Chapter.project_id == project_id)
    )
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")

    # 自动更新项目章节数
    project_result = await db.execute(select(Project).where(Project.id == project_id))
    project = project_result.scalar_one_or_none()
    if project and (project.current_chapter_count or 0) > 0:
        project.current_chapter_count = project.current_chapter_count - 1

    await db.delete(chapter)
    await db.commit()
    return {"message": "章节已删除"}
