"""项目管理 API。"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models.project import Project
from ..models.chapter import Chapter
from ..models.document import Document
from ..schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse, ProjectListResponse

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=ProjectListResponse)
async def list_projects(db: AsyncSession = Depends(get_db)):
    """获取所有项目，章节数使用实际计数。"""
    from ..models.chapter import Chapter
    from sqlalchemy import func as sqlfunc

    result = await db.execute(select(Project).order_by(Project.updated_at.desc()))
    projects = list(result.scalars().all())

    # 同步每个项目的实际章节数
    for project in projects:
        count_result = await db.execute(
            select(sqlfunc.count(Chapter.id)).where(Chapter.project_id == project.id)
        )
        actual_count = count_result.scalar() or 0
        if project.current_chapter_count != actual_count:
            project.current_chapter_count = actual_count
    await db.commit()

    return ProjectListResponse(projects=projects, total=len(projects))


@router.post("", response_model=ProjectResponse)
async def create_project(data: ProjectCreate, db: AsyncSession = Depends(get_db)):
    """创建新项目。"""
    project = Project(**data.model_dump())
    db.add(project)
    await db.flush()

    # 创建默认文档
    default_docs = [
        {"doc_type": "outline", "title": "大纲", "content": f"# {project.name} 大纲\n\n"},
        {"doc_type": "worldview", "title": "世界观", "content": "# 世界观\n\n"},
        {"doc_type": "rules", "title": "法则", "content": "# 法则\n\n"},
        {"doc_type": "conflict", "title": "冲突设计", "content": "# 冲突设计\n\n"},
        {"doc_type": "settings", "title": "设定记录", "content": "# 设定记录\n\n"},
        {"doc_type": "dialogue", "title": "角色台词库", "content": "# 角色台词库\n\n"},
    ]
    for doc_data in default_docs:
        doc = Document(project_id=project.id, **doc_data)
        db.add(doc)

    await db.commit()
    await db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: int, db: AsyncSession = Depends(get_db)):
    """获取项目详情，章节数使用实际计数。"""
    from ..models.chapter import Chapter
    from sqlalchemy import func as sqlfunc

    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 同步实际章节数
    count_result = await db.execute(
        select(sqlfunc.count(Chapter.id)).where(Chapter.project_id == project_id)
    )
    actual_count = count_result.scalar() or 0
    if project.current_chapter_count != actual_count:
        project.current_chapter_count = actual_count
        await db.commit()
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: int, data: ProjectUpdate, db: AsyncSession = Depends(get_db)):
    """更新项目信息。"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(project, key, value)

    await db.commit()
    await db.refresh(project)
    return project


@router.delete("/{project_id}")
async def delete_project(project_id: int, db: AsyncSession = Depends(get_db)):
    """删除项目。"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    await db.delete(project)
    await db.commit()
    return {"message": "项目已删除"}
