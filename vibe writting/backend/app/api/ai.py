"""AI 写作 API：支持多模型供应商配置。"""

from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..config import settings, ModelConfig, ModelProvider
from ..models.project import Project
from ..models.chapter import Chapter
from ..services.ai_service import AIService

router = APIRouter(prefix="/api/ai", tags=["ai"])


# ── 模型配置 API ──

class ProviderCreate(BaseModel):
    id: str
    name: str
    base_url: str = ""
    api_key: str = ""
    provider_type: str = "openai"
    models: list[str] = []


class ProviderUpdate(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    provider_type: Optional[str] = None
    models: Optional[list[str]] = None
    enabled: Optional[bool] = None


class ActiveModelUpdate(BaseModel):
    provider_id: str
    model: str


class ProviderResponse(BaseModel):
    id: str
    name: str
    base_url: str
    provider_type: str
    models: list[str]
    enabled: bool
    has_key: bool  # 不暴露实际 key


@router.get("/providers")
async def list_providers():
    """获取所有模型供应商。"""
    config = settings.model_config_obj
    return [
        ProviderResponse(
            id=p.id,
            name=p.name,
            base_url=p.base_url,
            provider_type=p.provider_type,
            models=p.models,
            enabled=p.enabled,
            has_key=bool(p.api_key),
        )
        for p in config.providers
    ]


@router.post("/providers")
async def create_provider(data: ProviderCreate):
    """添加模型供应商。"""
    config = settings.model_config_obj
    # 检查 ID 重复
    if any(p.id == data.id for p in config.providers):
        raise HTTPException(status_code=400, detail=f"供应商 ID '{data.id}' 已存在")

    provider = ModelProvider(**data.model_dump())
    config.providers.append(provider)
    # 如果是第一个供应商，自动设为激活
    if not config.active_provider_id:
        config.active_provider_id = provider.id
        if provider.models:
            config.active_model = provider.models[0]
    settings.save_model_config(config)
    return {"message": "供应商已添加", "id": provider.id}


@router.put("/providers/{provider_id}")
async def update_provider(provider_id: str, data: ProviderUpdate):
    """更新模型供应商。api_key 留空或不传则保持原值。"""
    config = settings.model_config_obj
    provider = next((p for p in config.providers if p.id == provider_id), None)
    if not provider:
        raise HTTPException(status_code=404, detail="供应商不存在")

    update_data = data.model_dump(exclude_unset=True)
    # api_key 留空 = 不修改，需要过滤掉
    if "api_key" in update_data and not update_data["api_key"]:
        del update_data["api_key"]
    for key, value in update_data.items():
        setattr(provider, key, value)
    settings.save_model_config(config)
    return {"message": "供应商已更新"}


@router.delete("/providers/{provider_id}")
async def delete_provider(provider_id: str):
    """删除模型供应商。"""
    config = settings.model_config_obj
    config.providers = [p for p in config.providers if p.id != provider_id]
    if config.active_provider_id == provider_id:
        config.active_provider_id = config.providers[0].id if config.providers else ""
        config.active_model = config.providers[0].models[0] if config.providers and config.providers[0].models else ""
    settings.save_model_config(config)
    return {"message": "供应商已删除"}


@router.post("/active-model")
async def set_active_model(data: ActiveModelUpdate):
    """设置当前使用的模型。"""
    config = settings.model_config_obj
    provider = next((p for p in config.providers if p.id == data.provider_id), None)
    if not provider:
        raise HTTPException(status_code=404, detail="供应商不存在")
    if data.model not in provider.models:
        raise HTTPException(status_code=400, detail="模型不在供应商的模型列表中")

    config.active_provider_id = data.provider_id
    config.active_model = data.model
    settings.save_model_config(config)
    return {"message": "模型已切换", "provider": data.provider_id, "model": data.model}


@router.get("/active-model")
async def get_active_model():
    """获取当前激活的模型。"""
    config = settings.model_config_obj
    provider = next((p for p in config.providers if p.id == config.active_provider_id), None)
    return {
        "provider_id": config.active_provider_id,
        "provider_name": provider.name if provider else "",
        "model": config.active_model,
        "configured": bool(provider and provider.api_key),
    }


@router.post("/test-connection")
async def test_connection(provider_id: str):
    """测试供应商连接。"""
    config = settings.model_config_obj
    provider = next((p for p in config.providers if p.id == provider_id), None)
    if not provider:
        raise HTTPException(status_code=404, detail="供应商不存在")

    try:
        db_gen = get_db()
        db = await db_gen.__anext__()
        ai = AIService(db)
        # 临时覆盖配置进行测试
        ai._provider = provider
        ai._config = ModelConfig(
            providers=[provider],
            active_provider_id=provider.id,
            active_model=provider.models[0] if provider.models else "",
        )
        result = await ai._call_ai("你是一个助手", "请回复连接成功", max_tokens=20)
        return {"success": True, "message": f"连接成功：{result[:50]}"}
    except Exception as e:
        return {"success": False, "message": f"连接失败：{str(e)}"}


# ── AI 写作 API（保持原有接口） ──

class OutlineGenerationRequest(BaseModel):
    project_id: int
    answers: dict


@router.post("/generate-outline")
async def generate_outline(data: OutlineGenerationRequest, db: AsyncSession = Depends(get_db)):
    """根据 5 问立项生成大纲。"""
    ai = AIService(db)
    if not ai.is_configured:
        raise HTTPException(status_code=400, detail="未配置模型供应商，请在设置中添加")

    result = await db.execute(select(Project).where(Project.id == data.project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    outline = await ai.generate_outline(data.project_id, data.answers)

    from ..models.document import Document
    doc_result = await db.execute(
        select(Document).where(Document.project_id == data.project_id, Document.doc_type == "outline")
    )
    doc = doc_result.scalar_one_or_none()
    if doc:
        doc.content = outline
    else:
        doc = Document(project_id=data.project_id, doc_type="outline", title="大纲", content=outline)
        db.add(doc)

    project.synopsis = data.answers.get("synopsis", "")
    project.core_conflict = data.answers.get("core_conflict", "")
    project.genre = data.answers.get("genre", "")
    await db.commit()

    return {"outline": outline, "project_id": data.project_id}


@router.post("/analyze/{chapter_id}")
async def analyze_chapter(chapter_id: int, db: AsyncSession = Depends(get_db)):
    """写前分析。"""
    ai = AIService(db)
    if not ai.is_configured:
        raise HTTPException(status_code=400, detail="未配置模型供应商")

    result = await db.execute(select(Chapter).where(Chapter.id == chapter_id))
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")

    analysis = await ai.analyze_for_chapter(chapter.project_id, chapter)
    chapter.pre_analysis = analysis
    await db.commit()
    return analysis


@router.post("/plan-scenes/{chapter_id}")
async def plan_scenes(chapter_id: int, db: AsyncSession = Depends(get_db)):
    """场景规划。"""
    ai = AIService(db)
    if not ai.is_configured:
        raise HTTPException(status_code=400, detail="未配置模型供应商")

    result = await db.execute(select(Chapter).where(Chapter.id == chapter_id))
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")

    pre_analysis = chapter.pre_analysis
    if not pre_analysis:
        pre_analysis = await ai.analyze_for_chapter(chapter.project_id, chapter)
        chapter.pre_analysis = pre_analysis

    scenes = await ai.plan_scenes(chapter.project_id, chapter, pre_analysis)
    chapter.scene_plan = {"scenes": scenes}
    await db.commit()
    return {"scenes": scenes}


@router.post("/write-stream/{chapter_id}")
async def write_chapter_stream(
    chapter_id: int,
    scene_plan: Optional[list[dict]] = None,
    db: AsyncSession = Depends(get_db),
):
    """流式生成正文。"""
    ai = AIService(db)
    if not ai.is_configured:
        raise HTTPException(status_code=400, detail="未配置模型供应商")

    result = await db.execute(select(Chapter).where(Chapter.id == chapter_id))
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")

    if not scene_plan:
        if not chapter.pre_analysis:
            chapter.pre_analysis = await ai.analyze_for_chapter(chapter.project_id, chapter)
        scenes = await ai.plan_scenes(chapter.project_id, chapter, chapter.pre_analysis)
        scene_plan = scenes
        chapter.scene_plan = {"scenes": scene_plan}
        await db.commit()

    async def event_generator():
        full_content = []
        async for chunk in ai.write_chapter_stream(chapter.project_id, chapter, scene_plan):
            full_content.append(chunk)
            yield f"data: {json.dumps({'content': chunk}, ensure_ascii=False)}\n\n"

        final_content = "".join(full_content)
        chapter.content = final_content
        chapter.word_count = len(final_content.replace(" ", "").replace("\n", ""))
        chapter.status = "completed"

        project_result = await db.execute(select(Project).where(Project.id == chapter.project_id))
        project = project_result.scalar_one_or_none()
        if project:
            project.current_chapter_count = max(project.current_chapter_count, chapter.chapter_number)
        await db.commit()

        yield f"data: {json.dumps({'done': True, 'word_count': chapter.word_count}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/polish")
async def polish_text(text: str, instruction: str = "润色以下段落", db: AsyncSession = Depends(get_db)):
    ai = AIService(db)
    if not ai.is_configured:
        raise HTTPException(status_code=400, detail="未配置模型供应商")
    result = await ai.polish_text(text, instruction)
    return {"result": result}


@router.post("/rewrite")
async def rewrite_text(text: str, instruction: str = "重写以下段落", db: AsyncSession = Depends(get_db)):
    ai = AIService(db)
    if not ai.is_configured:
        raise HTTPException(status_code=400, detail="未配置模型供应商")
    result = await ai.rewrite_text(text, instruction)
    return {"result": result}


@router.post("/expand")
async def expand_text(text: str, instruction: str = "扩写以下段落", db: AsyncSession = Depends(get_db)):
    ai = AIService(db)
    if not ai.is_configured:
        raise HTTPException(status_code=400, detail="未配置模型供应商")
    result = await ai.expand_text(text, instruction)
    return {"result": result}


# ── 对话接口 ──

class ChatRequest(BaseModel):
    project_id: int
    message: str
    history: Optional[list[dict]] = None


@router.post("/chat")
async def chat_stream(data: ChatRequest, db: AsyncSession = Depends(get_db)):
    """通用对话接口，流式输出。"""
    ai = AIService(db)
    if not ai.is_configured:
        raise HTTPException(status_code=400, detail="未配置模型供应商")

    # 加载项目记忆
    memory_content = await ai.memory.build_memory_for_writing(data.project_id, 0)

    system_prompt = f"""你是一位专业的长篇小说创作助手，当前正在帮助用户创作小说。

## 项目记忆
{memory_content[:3000]}

## 你的能力
- 回答创作相关问题
- 提供写作建议
- 讨论剧情走向
- 分析人物塑造

## 回复规则
- 用中文回复
- 简洁但有深度
- 如果用户想执行具体操作（写章节、生成大纲等），告诉他们直接说关键词即可
- 不要输出操作指令标签，直接回复自然语言"""

    async def event_generator():
        async for chunk in ai._call_ai_stream(system_prompt, data.message, max_tokens=2048):
            yield f"data: {json.dumps({'content': chunk}, ensure_ascii=False)}\n\n"
        yield "data: {\"done\": true}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
