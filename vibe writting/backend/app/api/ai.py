"""AI 写作 API：支持多模型供应商配置。"""

from __future__ import annotations

import json
import re
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
    system_override: Optional[str] = None  # 自定义 system prompt


async def _build_full_project_context(project_id: int, db) -> str:
    """加载完整项目上下文：大纲、世界观、法则、角色、伏笔、时间线。"""
    from ..models.chapter import Chapter
    from ..models.character import Character
    from ..models.foreshadowing import Foreshadowing
    from ..models.timeline import TimelineEvent
    from ..models.document import Document
    from ..models.project import Project
    from sqlalchemy import select

    sections = []

    # 项目信息
    proj = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if proj:
        sections.append(f"## 项目信息\n- 书名：{proj.name}\n- 题材：{proj.genre}\n- 进度：{proj.current_chapter_count}/{proj.target_chapters} 章\n- 核心冲突：{proj.core_conflict}\n- 主线梗概：{proj.synopsis}")

    # L3 宪法记忆：世界观、法则、冲突设计、设定记录
    doc_types = ["outline", "worldview", "rules", "conflict", "settings", "dialogue"]
    doc_labels = {"outline": "大纲", "worldview": "世界观", "rules": "法则", "conflict": "冲突设计", "settings": "设定记录", "dialogue": "角色台词库"}
    for dt in doc_types:
        doc = (await db.execute(select(Document).where(Document.project_id == project_id, Document.doc_type == dt))).scalar_one_or_none()
        if doc and doc.content and len(doc.content.strip()) > 20:
            max_len = 5000 if dt == "outline" else 3000
            sections.append(f"## {doc_labels.get(dt, dt)}\n{doc.content[:max_len]}")

    # 角色（完整详情）
    chars = (await db.execute(select(Character).where(Character.project_id == project_id))).scalars().all()
    if chars:
        char_docs = []
        for c in chars:
            role_label = {"protagonist": "主角", "antagonist": "反派", "supporting": "配角"}.get(c.role, c.role)
            profile = c.profile_data or {}
            # 优先使用完整文档，否则用结构化字段
            if profile.get("full_document"):
                char_docs.append(f"### {c.name}（{role_label}）\n{profile['full_document'][:2000]}")
            else:
                details = []
                for key in ["性格核心", "核心价值观", "致命缺陷", "内心渴望", "背景故事", "成长目标"]:
                    if profile.get(key):
                        details.append(f"- {key}：{profile[key]}")
                char_docs.append(f"### {c.name}（{role_label}）\n" + "\n".join(details) if details else f"### {c.name}（{role_label}）")
        sections.append("## 角色详情\n" + "\n\n".join(char_docs))

    # 伏笔（完整详情）
    fss = (await db.execute(select(Foreshadowing).where(Foreshadowing.project_id == project_id))).scalars().all()
    if fss:
        fs_docs = []
        for f in fss:
            fs_docs.append(f"### {f.name}（{f.status}，第{f.chapter_planted}章埋设" + (f"→第{f.chapter_resolved}章回收" if f.chapter_resolved else "") + "）\n{f.notes[:1000] if f.notes else '暂无详细设计'}")
        sections.append("## 伏笔详情\n" + "\n\n".join(fs_docs))

    # 时间线（完整详情）
    tl = (await db.execute(select(TimelineEvent).where(TimelineEvent.project_id == project_id).order_by(TimelineEvent.chapter_number))).scalars().all()
    if tl:
        tl_lines = [f"- 第{e.chapter_number}章 [{e.event_type}]：{e.description}" for e in tl]
        sections.append("## 时间线\n" + "\n".join(tl_lines))

    # 章节列表
    chapters = (await db.execute(select(Chapter).where(Chapter.project_id == project_id).order_by(Chapter.chapter_number))).scalars().all()
    if chapters:
        ch_lines = [f"- 第{ch.chapter_number}章 {ch.title or ''}（{ch.word_count}字，{ch.status}）" for ch in chapters]
        sections.append("## 章节列表\n" + "\n".join(ch_lines))

    return "\n\n".join(sections)


@router.post("/chat")
async def chat_stream(data: ChatRequest, db: AsyncSession = Depends(get_db)):
    """通用对话接口，AI 拥有完整项目上下文并可自主执行操作。"""
    ai = AIService(db)
    if not ai.is_configured:
        raise HTTPException(status_code=400, detail="未配置模型供应商")

    # 优先使用自定义 system prompt
    if data.system_override:
        system_prompt = data.system_override
    else:
        # 加载完整项目上下文
        project_context = await _build_full_project_context(data.project_id, db)

        # 根据用户消息动态加载相关 references
        from ..core.prompt_manager import load_reference
        ref_context = ""
        msg_lower = data.message.lower()
        # 根据关键词加载对应的 reference
        ref_map = {
            "角色": ["character-building", "character-template"],
            "冲突": ["conflict-design"],
            "世界观": ["worldbuilding-logic", "worldbuilding-presentation"],
            "伏笔": ["suspense-design"],
            "对话": ["dialogue-writing"],
            "钩子": ["hook-techniques"],
            "情绪": ["reader-compensation"],
            "群像": ["ensemble-writing"],
            "非线性": ["nonlinear-narrative"],
            "金手指": ["golden-finger-design"],
            "大纲": ["outline-template", "plot-structures"],
            "节奏": ["chapter-guide"],
        }
        loaded_refs = set()
        for keyword, refs in ref_map.items():
            if keyword in msg_lower:
                for ref in refs:
                    if ref not in loaded_refs:
                        content = load_reference(ref)
                        if not content.startswith("[Reference not found"):
                            ref_context += f"\n\n---\n\n{content[:2000]}"
                            loaded_refs.add(ref)

        # 始终加载核心创作规则
        for ref in ["chapter-guide", "dialogue-writing", "hook-techniques"]:
            if ref not in loaded_refs:
                content = load_reference(ref)
                if not content.startswith("[Reference not found"):
                    ref_context += f"\n\n---\n\n{content[:2000]}"
                    loaded_refs.add(ref)

        system_prompt = f"""你是用户的AI创作助手，拥有对这个小说项目的完整读写能力。你可以查看、创建、修改项目中的所有内容。

## 项目完整数据
{project_context}

## 你的能力
你可以像IDE助手一样操作这个项目：

### 读取
- 你可以看到项目的大纲全文、所有角色详情、伏笔、时间线、章节
- 当用户问到相关内容时，直接引用项目数据回答

### 创建
当用户要求创建内容时，直接创建并确认：
- 创建角色（单个或多个/群像）
- 创建伏笔
- 创建时间线事件
- 更新已有内容

### 操作指令格式
在回复末尾输出操作指令（可多个）：
[ACTION:CREATE_CHARACTER:{{"name":"名字","role":"protagonist/antagonist/supporting","profile_data":{{"性格核心":"...","核心价值观":"...","致命缺陷":"...","内心渴望":"...","背景故事":"...","成长目标":"...","完整描述":"完整markdown"}}}}]
[ACTION:CREATE_FORESHADOWING:{{"name":"名称","foreshadow_type":"类型","chapter_planted":0,"notes":"完整markdown"}}]
[ACTION:CREATE_TIMELINE:{{"chapter_number":0,"event_time":"时间","description":"描述","event_type":"plot/relationship/character_change"}}]
[ACTION:CREATE_CHAPTER:{{"title":"章节标题","content":"完整正文内容markdown"}}]
[ACTION:UPDATE_CHARACTER:ID:{{字段更新}}]
[ACTION:UPDATE_FORESHADOWING:ID:{{字段更新}}]
[ACTION:UPDATE_CHAPTER:ID:{{"content":"更新后的正文"}}]

## 重要：你必须输出操作指令
当用户要求你做任何创建/修改操作时，你**必须**在回复末尾输出 [ACTION:...] 指令。这是系统保存你工作的唯一方式。
- 如果用户让你写章节，必须输出 [ACTION:CREATE_CHAPTER:...]
- 如果你只给回复文本但不输出 ACTION，你的工作成果将不会被保存
- 操作指令格式是机器可读的，必须严格遵守

## 工作原则
1. 用户说什么，你就做什么——不要问太多确认问题，直接行动
2. 写章节时，先输出正文，最后一行输出 [ACTION:CREATE_CHAPTER:{{"title":"章节标题"}}]
3. 创建角色时给出完整、详细的设计
4. 创建群像时，每个角色一个独立ACTION
5. 主动引用项目中已有的内容
6. 操作指令放最后一行

## 回复风格
- 中文，像一个真正的创作伙伴
- 直接行动，不问"你确定吗？"
- 创建完成后告诉用户做了什么"""
        # 注入参考知识
        if ref_context:
            system_prompt += f"\n\n## 创作参考知识（来自专业写作指南）\n{ref_context[:8000]}"
        system_prompt += f"\n\n## 项目记忆\n{(await ai.memory.build_memory_for_writing(data.project_id, 0))[:1000]}"

    async def event_generator():
        print("DEBUG: event_generator started", flush=True)
        try:
            async for chunk in _event_generator_body():
                print(f"DEBUG: yielding chunk: {chunk[:50]}", flush=True)
                yield chunk
        except Exception as e:
            import traceback
            traceback.print_exc()
            err_msg = f"错误：{str(e)}"
            yield f"data: {json.dumps({'content': err_msg}, ensure_ascii=False)}\n\n"
            yield "data: {\"done\": true}\n\n"

    async def _event_generator_body():
        is_confirm_write = '确认写作' in data.message or '开始写' in data.message or '就这样写' in data.message

        if is_confirm_write:
            chapters_result = await db.execute(
                select(Chapter).where(Chapter.project_id == data.project_id, Chapter.status == "writing")
                .order_by(Chapter.chapter_number.desc())
            )
            chapter = chapters_result.scalar_one_or_none()
            if not chapter:
                yield f"data: {json.dumps({'content': '没有找到待写作的章节，请先说「写下一章」。'}, ensure_ascii=False)}\n\n"
                yield "data: {\"done\": true}\n\n"
                return

            analysis_text = ""
            for h in reversed(data.history or []):
                if h.get("role") == "assistant" and "写前分析" in h.get("content", ""):
                    analysis_text = h["content"]
                    break

            write_prompt = f"""【最重要的指令】你是一个小说家。请直接输出小说正文。绝对不要输出任何分析、思考、评论、解释。不要说"好的"、"我需要"、"用户希望"这类话。第一行是标题（# 开头），第二行开始就是正文。

## 写前分析（仅供你参考，不要输出）
{analysis_text[:3000]}

## 输出规则
1. 第一行：# 章节标题
2. 第二行起：直接是小说正文
3. 不要任何分析、解释、评论
4. 不要"好的，用户要求..."这类开头
5. 目标 3000-5000 字
6. 开头有钩子，结尾留悬念
7. 角色不能 OOC，展示不讲述
8. 不要 AI 味（避免"此外""然而"等套语）
10. 伏笔追踪：项目记忆中有活跃伏笔，本章应至少推进或呼应一条
11. 情绪补偿：主角受挫后必须有补偿

请直接输出："""

            full_content = ""
            async for chunk in ai._call_ai_stream(system_prompt, write_prompt, max_tokens=8192, history=data.history):
                full_content += chunk
                yield f"data: {json.dumps({'content': chunk}, ensure_ascii=False)}\n\n"

            clean_content = full_content
            # 智能过滤：找到正文起始位置，丢弃前面的 AI 分析文本
            clean_content = _strip_ai_meta(clean_content)
            # 清理残留的操作标签
            clean_content = re.sub(r'\[ACTION:\w+:.+?\]', '', clean_content)
            clean_content = clean_content.strip()
            title_match = re.match(r'^#\s*(.+)', clean_content)
            if title_match:
                chapter.title = title_match.group(1).strip()
                clean_content = re.sub(r'^#\s*.+\n?', '', clean_content).strip()
            chapter.content = clean_content
            chapter.word_count = len(clean_content.replace(" ", "").replace("\n", ""))
            chapter.status = "completed"
            await db.commit()

            from ..models.foreshadowing import Foreshadowing
            fss = (await db.execute(select(Foreshadowing).where(Foreshadowing.project_id == data.project_id, Foreshadowing.status == "active"))).scalars().all()
            mentioned_fs = [f.name for f in fss if f.name in clean_content]
            fs_msg = f"\n\n📌 **伏笔追踪**：本章涉及伏笔 → {', '.join(mentioned_fs)}" if mentioned_fs else ""

            save_msg = f"\n\n---\n✅ 已保存「第{chapter.chapter_number}章 {chapter.title}」（{chapter.word_count}字）{fs_msg}"
            yield f"data: {json.dumps({'content': save_msg}, ensure_ascii=False)}\n\n"

        else:
            action_results = await _handle_user_intent(data, db)

            chapter_created = None
            for ar in action_results:
                if ar.startswith("[ACTION:CHAPTER_CREATED:"):
                    parts = ar.split(":")
                    ch_id = int(parts[2])
                    chapter_created = (await db.execute(select(Chapter).where(Chapter.id == ch_id))).scalar_one_or_none()

            if chapter_created:
                context_prefix = f"""[系统通知] 已创建第{chapter_created.chapter_number}章「{chapter_created.title}」。

【重要指令】你现在的任务是"写前分析"，不是写正文。绝对不要输出正文内容。只输出以下分析框架：

### 写前分析
- 视角：跟谁的视角（一句话）
- 目标：本章推进什么（一句话）
- 冲突：核心冲突（一句话）
- 钩子方向：结尾怎么勾（一句话）
- 主角状态：主角处境（一句话）

### 场景规划
场景1：[名称]
- 地点/人物/事件/类型/情绪

场景2：[名称]
- 地点/人物/事件/类型/情绪

（3-5个场景）

分析完成后告诉用户"请确认，我开始写正文。"不要提前写正文。

"""
                full_prompt = context_prefix + data.message
            else:
                context_prefix = ""
                if action_results:
                    context_prefix = f"\n\n[系统通知] 你刚才为用户执行了以下操作：\n{chr(10).join(action_results)}\n请基于这些操作结果回复用户。\n\n"
                full_prompt = context_prefix + data.message

            full_content = ""
            async for chunk in ai._call_ai_stream(system_prompt, full_prompt, max_tokens=8192, history=data.history):
                full_content += chunk
                yield f"data: {json.dumps({'content': chunk}, ensure_ascii=False)}\n\n"

            if chapter_created and not chapter_created.content:
                scene_plan = _parse_scene_plan(full_content)
                clean_analysis = full_content
                filler_patterns = [
                    r'^.*写前分析.*$', r'^.*分析完毕.*$', r'^.*请确认.*$', r'^.*以下.*分析.*$',
                    r'^.*根据.*设定.*$', r'^.*我将.*$', r'^---+$', r'^##\s*写前分析\s*$',
                    r'^##\s*第三章.*$', r'^\*\*写前分析\*\*\s*$',
                ]
                for pattern in filler_patterns:
                    clean_analysis = re.sub(pattern, '', clean_analysis, flags=re.MULTILINE)
                clean_analysis = clean_analysis.strip()
                clean_analysis = re.sub(r'^第.{1,3}章.*写前分析.*\n?', '', clean_analysis).strip()
                clean_analysis = re.sub(r'^#+\s*.*\n?', '', clean_analysis).strip()
                chapter_created.pre_analysis = {"analysis": clean_analysis[:2000]}
                if scene_plan:
                    chapter_created.scene_plan = {"scenes": scene_plan}
                await db.commit()

            if action_results:
                result_text = "\n\n---\n" + "\n".join(action_results)
                yield f"data: {json.dumps({'content': result_text}, ensure_ascii=False)}\n\n"

        yield "data: {\"done\": true}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


def _strip_ai_meta(text: str) -> str:
    """智能过滤：找到正文起始位置，丢弃前面的 AI 分析/思考文本。"""
    lines = text.split('\n')
    # 找到第一个"像正文"的行：不是纯数字、不是列表项、不是分析性语句
    meta_indicators = [
        r'^用户要求', r'^我需要', r'^用户可能', r'^好的[，,]',
        r'^从分析', r'^开头怎么', r'^这个.*重要', r'^不用详细',
        r'^也许可以', r'^恐怕', r'^想到这里', r'^窗外的阳光',
        r'^拿起笔', r'^他重新坐到', r'^真正的麻烦', r'^让我开始',
        r'^根据写前', r'^分析中', r'^分析已完成', r'^写前分析',
        r'^###\s', r'^##\s', r'^\*\*', r'^[-•]\s',
        r'^\d+[.、]', r'^视角[：:]', r'^目标[：:]', r'^冲突[：:]',
        r'^钩子[：:]', r'^主角状态[：:]', r'^场景', r'^地点[：:]',
        r'^人物[：:]', r'^事件[：:]', r'^类型[：:]', r'^情绪[：:]',
        r'^请确认', r'^注意', r'^重要', r'^需要', r'^应该',
        r'^可以', r'^如果', r'^但是', r'^不过', r'^因此',
        r'^总之', r'^首先', r'^其次', r'^最后', r'^另外',
        r'^所以', r'^然而', r'^不过', r'^但是', r'^而且',
        r'^开头要有', r'^结尾留', r'^展示不', r'^避免',
        r'^让[我他她]', r'^现在', r'^接下来', r'^下面',
        r'^开始写', r'^开始创作', r'^正式开始', r'^正文如下',
    ]
    start_idx = 0
    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue
        # 跳过明显是分析/指令的行
        is_meta = False
        for pattern in meta_indicators:
            if re.match(pattern, line):
                is_meta = True
                break
        if is_meta:
            start_idx = i + 1
            continue
        # 如果不是分析行，检查是否像正文（段落较长、有叙事性）
        if len(line) > 20:
            # 可能是正文，但需要排除"让我开始写作"之类的过渡语
            if not re.match(r'^让我', line) and not re.match(r'^现在', line):
                start_idx = i
                break
    # 返回从正文起始位置开始的内容
    result = '\n'.join(lines[start_idx:]).strip()
    return result if result else text


def _parse_scene_plan(text: str) -> list[dict]:
    """从 AI 回复中解析场景规划。"""
    scene_pattern = re.compile(r'\*\*场景(\d+)[：:]\s*(.+?)\*\*([\s\S]*?)(?=\*\*场景\d+|$)', re.MULTILINE)
    scenes = []
    for match in scene_pattern.finditer(text):
        scene_content = match.group(3).strip()
        fields = {}
        field_pattern = re.compile(r'[-•]\s*(.+?)[：:]\s*(.+)', re.MULTILINE)
        for fm in field_pattern.finditer(scene_content):
            key = fm.group(1).strip().rstrip('*').lstrip('*')
            val = fm.group(2).strip()
            fields[key] = val
        scenes.append({
            "name": match.group(2).strip(),
            "location": fields.get("地点", ""),
            "characters": fields.get("人物", ""),
            "core_event": fields.get("事件", fields.get("核心事件", "")),
            "scene_type": fields.get("类型", ""),
            "emotion_arc": fields.get("情绪", fields.get("情绪走向", "")),
        })
    return scenes



async def _handle_user_intent(data: ChatRequest, db) -> list[str]:
    """分析用户意图，主动执行操作，不依赖 AI 输出格式。"""
    from ..models.chapter import Chapter
    from ..models.character import Character
    from ..models.project import Project
    from sqlalchemy import select, func as sqlfunc
    import re

    msg = data.message.lower()
    results = []

    # ── 写章节 ──
    if any(k in msg for k in ['写第', '写下一章', '生成正文', '写正文', '创作第', '续写', '写个章节', '输出章节']):
        # 先找是否有空章节（status=writing 且无内容）可以直接填充
        empty_chapter = (await db.execute(
            select(Chapter).where(
                Chapter.project_id == data.project_id,
                Chapter.status == "writing",
            ).order_by(Chapter.chapter_number)
        )).scalar_one_or_none()

        if empty_chapter and not empty_chapter.content:
            # 复用已有的空章节
            chapter = empty_chapter
        else:
            # 找下一个章节号
            count_result = await db.execute(select(sqlfunc.count(Chapter.id)).where(Chapter.project_id == data.project_id))
            max_num = count_result.scalar() or 0

            # 从消息中提取章节标题
            title_match = re.search(r'第(\d+)章\s*(.*)', data.message)
            if title_match:
                ch_num = int(title_match.group(1))
                ch_title = title_match.group(2).strip()
            else:
                ch_num = max_num + 1
                ch_title = f"第{ch_num}章"

            # 创建新章节
            chapter = Chapter(
                project_id=data.project_id,
                chapter_number=ch_num,
                title=ch_title,
                status="writing",
            )
            db.add(chapter)

            # 更新项目章节数
            proj = (await db.execute(select(Project).where(Project.id == data.project_id))).scalar_one_or_none()
            if proj:
                proj.current_chapter_count = (proj.current_chapter_count or 0) + 1

        await db.commit()
        await db.refresh(chapter)
        results.append(f"[ACTION:CHAPTER_CREATED:{chapter.id}:{chapter.chapter_number}:{chapter.title}]")
        return results

    # ── 创建角色 ──
    if any(k in msg for k in ['创建角色', '新建角色', '添加角色', '设计角色', '建立角色', '帮我设计一个']):
        if any(k in msg for k in ['角色', '人物', '反派', '主角', '配角']):
            # 提取角色名
            name_match = re.search(r'(?:角色|人物|设计一个?|创建)\s*[""「]?(.+?)[""」]?\s*(?:，|,|。|的|是)', msg)
            char_name = name_match.group(1) if name_match else "新角色"
            char = Character(
                project_id=data.project_id,
                name=char_name,
                role="supporting",
                profile_data={"created_from_chat": True, "user_message": data.message},
            )
            db.add(char)
            await db.commit()
            await db.refresh(char)
            results.append(f"[ACTION:CHARACTER_CREATED:{char.id}:{char_name}]")
            return results

    # ── 创建伏笔 ──
    if any(k in msg for k in ['创建伏笔', '埋伏笔', '添加伏笔', '设计伏笔']):
        from ..models.foreshadowing import Foreshadowing
        fs_match = re.search(r'(?:伏笔|设计)\s*[""「]?(.+?)[""」]?', msg)
        fs_name = fs_match.group(1) if fs_match else "新伏笔"
        fs = Foreshadowing(
            project_id=data.project_id,
            name=fs_name,
            notes=data.message,
        )
        db.add(fs)
        await db.commit()
        await db.refresh(fs)
        results.append(f"[ACTION:FORESHADOWING_CREATED:{fs.id}:{fs_name}]")
        return results

    # ── 创建时间线事件 ──
    if any(k in msg for k in ['创建事件', '记录事件', '添加事件']):
        from ..models.timeline import TimelineEvent
        ch_match = re.search(r'第(\d+)章', data.message)
        event = TimelineEvent(
            project_id=data.project_id,
            chapter_number=int(ch_match.group(1)) if ch_match else 0,
            description=data.message[:200],
            event_type="plot",
        )
        db.add(event)
        await db.commit()
        await db.refresh(event)
        results.append(f"[ACTION:TIMELINE_CREATED:{event.id}]")
        return results

    return results
