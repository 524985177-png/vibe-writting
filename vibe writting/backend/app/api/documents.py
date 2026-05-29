"""文档管理 API。"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models.document import Document

router = APIRouter(prefix="/api/projects/{project_id}/documents", tags=["documents"])


class DocumentUpdate(BaseModel):
    content: str
    title: Optional[str] = None


class DocumentResponse(BaseModel):
    id: int
    project_id: int
    doc_type: str
    title: str
    content: str
    updated_at: str

    model_config = {"from_attributes": True}


@router.get("")
async def list_documents(project_id: int, db: AsyncSession = Depends(get_db)):
    """获取项目的所有文档。"""
    result = await db.execute(
        select(Document).where(Document.project_id == project_id)
    )
    docs = list(result.scalars().all())
    return [
        {
            "id": d.id,
            "doc_type": d.doc_type,
            "title": d.title,
            "content": d.content,
            "updated_at": d.updated_at.isoformat() if d.updated_at else "",
        }
        for d in docs
    ]


@router.get("/{doc_type}")
async def get_document(project_id: int, doc_type: str, db: AsyncSession = Depends(get_db)):
    """获取指定类型的文档。"""
    result = await db.execute(
        select(Document).where(
            Document.project_id == project_id, Document.doc_type == doc_type
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    return {
        "id": doc.id,
        "doc_type": doc.doc_type,
        "title": doc.title,
        "content": doc.content,
        "updated_at": doc.updated_at.isoformat() if doc.updated_at else "",
    }


@router.put("/{doc_type}")
async def update_document(
    project_id: int, doc_type: str, data: DocumentUpdate, db: AsyncSession = Depends(get_db)
):
    """更新文档内容。"""
    result = await db.execute(
        select(Document).where(
            Document.project_id == project_id, Document.doc_type == doc_type
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    doc.content = data.content
    if data.title:
        doc.title = data.title

    await db.commit()
    await db.refresh(doc)
    return {
        "id": doc.id,
        "doc_type": doc.doc_type,
        "title": doc.title,
        "content": doc.content,
        "updated_at": doc.updated_at.isoformat() if doc.updated_at else "",
    }
