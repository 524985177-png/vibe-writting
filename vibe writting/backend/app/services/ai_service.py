"""AI 写作服务：支持多模型供应商（OpenAI兼容 + Anthropic原生）。"""

from __future__ import annotations

import json
from typing import AsyncGenerator, Optional

import anthropic
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings, ModelConfig, ModelProvider
from ..core.prompt_manager import build_prompt, build_prompt_with_memory
from ..core.memory import MemoryService
from ..models.chapter import Chapter
from ..models.project import Project
from ..models.usage import UsageLog


def _get_active_provider(config: ModelConfig) -> ModelProvider | None:
    """获取当前激活的供应商。"""
    for p in config.providers:
        if p.id == config.active_provider_id and p.enabled:
            return p
    # 如果没有匹配的，返回第一个启用的
    for p in config.providers:
        if p.enabled:
            return p
    return None


class AIService:
    """AI 写作核心服务，支持多模型供应商。"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.memory = MemoryService(db)
        self._config = settings.model_config_obj
        self._provider = _get_active_provider(self._config)
        self._anthropic_client: anthropic.AsyncAnthropic | None = None
        self._http_client: httpx.AsyncClient | None = None

    @property
    def is_configured(self) -> bool:
        return self._provider is not None and bool(self._provider.api_key)

    @property
    def active_model(self) -> str:
        return self._config.active_model or (self._provider.models[0] if self._provider and self._provider.models else "")

    def _get_anthropic_client(self) -> anthropic.AsyncAnthropic:
        if self._anthropic_client is None:
            kwargs = {"api_key": self._provider.api_key}
            if self._provider.base_url:
                kwargs["base_url"] = self._provider.base_url
            self._anthropic_client = anthropic.AsyncAnthropic(**kwargs)
        return self._anthropic_client

    async def _get_http_client(self) -> httpx.AsyncClient:
        if self._http_client is None:
            self._http_client = httpx.AsyncClient(timeout=120.0)
        return self._http_client

    async def _call_openai_compatible(
        self,
        system_prompt: str,
        user_content: str,
        max_tokens: int = 4096,
        stream: bool = False,
        history: list[dict] | None = None,
    ) -> str | AsyncGenerator[str, None]:
        """通过 OpenAI 兼容 API 调用（支持 OpenAI/DeepSeek/通义千问/本地模型等）。支持对话历史。"""
        base_url = self._provider.base_url.rstrip("/")
        headers = {
            "Authorization": f"Bearer {self._provider.api_key}",
            "Content-Type": "application/json",
        }
        # 构建消息列表：system + history + current message
        messages = [{"role": "system", "content": system_prompt}]
        if history:
            messages.extend(history)
        messages.append({"role": "user", "content": user_content})

        payload = {
            "model": self._config.active_model,
            "messages": messages,
            "max_tokens": max_tokens,
            "stream": stream,
        }

        client = await self._get_http_client()

        if stream:
            return self._stream_openai_response(client, f"{base_url}/chat/completions", headers, payload)

        response = await client.post(f"{base_url}/chat/completions", headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
        msg = data["choices"][0]["message"]
        # 某些模型（如 mimo）把内容放在 reasoning_content 而非 content
        return msg.get("content") or msg.get("reasoning_content") or ""

    async def _stream_openai_response(
        self, client: httpx.AsyncClient, url: str, headers: dict, payload: dict
    ) -> AsyncGenerator[str, None]:
        """流式接收 OpenAI 兼容 API 响应。"""
        async with client.stream("POST", url, headers=headers, json=payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data_str = line[6:]
                if data_str.strip() == "[DONE]":
                    break
                try:
                    chunk = json.loads(data_str)
                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    # 某些模型（如 mimo）把内容放在 reasoning_content 而非 content
                    content = delta.get("content") or delta.get("reasoning_content") or ""
                    if content:
                        yield content
                except (json.JSONDecodeError, IndexError, KeyError):
                    continue

    async def _call_anthropic(
        self,
        system_prompt: str,
        user_content: str,
        max_tokens: int = 4096,
        stream: bool = False,
        history: list[dict] | None = None,
    ):
        """通过 Anthropic 原生 API 调用。支持对话历史。"""
        client = self._get_anthropic_client()
        # 构建消息列表：history + current message
        messages = []
        if history:
            messages.extend(history)
        messages.append({"role": "user", "content": user_content})

        kwargs = {
            "model": self._config.active_model,
            "max_tokens": max_tokens,
            "system": system_prompt,
            "messages": messages,
        }
        if stream:
            return client.messages.stream(**kwargs)
        response = await client.messages.create(**kwargs)
        return response

    async def _call_ai(
        self,
        system_prompt: str,
        user_content: str,
        max_tokens: int = 4096,
    ) -> str:
        """非流式调用，返回完整文本。"""
        if not self.is_configured:
            raise ValueError("未配置模型供应商，请在设置中添加")

        if self._provider.provider_type == "anthropic":
            response = await self._call_anthropic(system_prompt, user_content, max_tokens)
            return response.content[0].text
        else:
            result = await self._call_openai_compatible(system_prompt, user_content, max_tokens, stream=False)
            self._check_ai_error(result)
            return result

    def _check_ai_error(self, text: str):
        """检测 AI 返回的错误/拒绝响应。"""
        if not isinstance(text, str):
            return
        error_patterns = [
            "request was rejected",
            "high risk",
            "content policy",
            "safety",
            "rejected",
            "refused",
            "cannot comply",
            "unable to generate",
            "i cannot",
            "i'm unable",
            "sorry, but",
            "apologize",
            " violates ",
            "inappropriate",
        ]
        text_lower = text.lower()
        for pattern in error_patterns:
            if pattern in text_lower:
                raise ValueError(f"AI 模型拒绝了此请求：{text[:200]}")

    async def _call_ai_stream(
        self,
        system_prompt: str,
        user_content: str,
        max_tokens: int = 4096,
        history: list[dict] | None = None,
    ) -> AsyncGenerator[str, None]:
        """流式调用，逐块 yield 文本。支持对话历史。"""
        if not self.is_configured:
            raise ValueError("未配置模型供应商，请在设置中添加")

        if self._provider.provider_type == "anthropic":
            async with await self._call_anthropic(system_prompt, user_content, max_tokens, stream=True, history=history) as stream_ctx:
                async for text in stream_ctx.text_stream:
                    yield text
        else:
            stream_gen = await self._call_openai_compatible(system_prompt, user_content, max_tokens, stream=True, history=history)
            async for chunk in stream_gen:
                yield chunk

    async def _log_usage(
        self,
        project_id: int,
        chapter_id: int | None,
        task_type: str,
        input_tokens: int,
        output_tokens: int,
    ):
        """记录 AI 调用用量。"""
        cost = self._estimate_cost(input_tokens, output_tokens)
        usage = UsageLog(
            project_id=project_id,
            chapter_id=chapter_id,
            task_type=task_type,
            model=self._config.active_model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_estimate=cost,
        )
        self.db.add(usage)
        await self.db.commit()

    def _estimate_cost(self, input_tokens: int, output_tokens: int) -> float:
        """估算费用。"""
        # 简化估算：不同供应商价格不同，这里用通用估算
        return (input_tokens * 3.0 + output_tokens * 15.0) / 1_000_000

    async def generate_outline(self, project_id: int, answers: dict) -> str:
        """根据 5 问回答生成大纲。"""
        system_prompt = build_prompt("outline")
        user_content = f"""请根据以下立项回答，生成一份完整的小说大纲。

立项回答：
- 题材与风格：{answers.get('genre', '')}
- 主角结构：{answers.get('protagonist_structure', '')}
- 主角核心性格：{answers.get('protagonist_personality', '')}
- 核心冲突：{answers.get('core_conflict', '')}
- 预计章节规模：{answers.get('target_chapters', '')}
- 主线梗概：{answers.get('synopsis', '')}

请生成包含以下内容的大纲：
1. 基本信息
2. 新手快速主线梗概（四问法）
3. 冲突土壤与冲突链
4. 三层冲突设计
5. 五阶段推进表
6. 章节规划表（至少前 10 章）
7. 全书悬念线

输出 Markdown 格式。"""

        result = await self._call_ai(system_prompt, user_content, max_tokens=4096)
        await self._log_usage(project_id, None, "outline", 0, 0)
        return result

    async def analyze_for_chapter(self, project_id: int, chapter: Chapter) -> dict:
        """写前分析。"""
        memory_content = await self.memory.build_memory_for_writing(project_id, chapter.chapter_number)
        system_prompt = build_prompt_with_memory("analyze", memory_content)

        user_content = f"""请为第 {chapter.chapter_number} 章进行写前分析。

请输出 JSON 格式：
{{
    "pov": "本章主视角角色",
    "goal": "本章核心目标（要推进什么）",
    "conflict": "本章核心冲突",
    "hook_direction": "结尾钩子方向",
    "active_foreshadowings": ["需要在本章推进的伏笔列表"],
    "character_state": "主角当前状态摘要",
    "scenes_preview": ["场景1简述", "场景2简述", "场景3简述"]
}}"""

        result = await self._call_ai(system_prompt, user_content, max_tokens=2048)
        await self._log_usage(project_id, chapter.id, "analyze", 0, 0)

        text = result if isinstance(result, str) else ""
        try:
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]
            return json.loads(text.strip())
        except (json.JSONDecodeError, IndexError):
            return {"raw_analysis": text}

    async def plan_scenes(self, project_id: int, chapter: Chapter, pre_analysis: dict) -> list[dict]:
        """场景规划。"""
        memory_content = await self.memory.build_memory_for_writing(project_id, chapter.chapter_number)
        system_prompt = build_prompt_with_memory("plan_scenes", memory_content)

        user_content = f"""根据以下写前分析，为第 {chapter.chapter_number} 章规划 3-5 个场景。

写前分析：
{json.dumps(pre_analysis, ensure_ascii=False, indent=2)}

请输出 JSON 数组格式：
[
    {{
        "name": "场景名称",
        "location": "地点",
        "characters": ["出场角色"],
        "core_event": "核心事件",
        "scene_type": "铺垫/冲突/高潮/转折/收尾",
        "emotion_arc": "起点情绪 -> 终点情绪",
        "purpose": "叙事目的",
        "hidden_line": "暗线（伏笔或误导）"
    }}
]"""

        result = await self._call_ai(system_prompt, user_content, max_tokens=2048)
        await self._log_usage(project_id, chapter.id, "plan", 0, 0)

        text = result if isinstance(result, str) else ""
        try:
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]
            return json.loads(text.strip())
        except (json.JSONDecodeError, IndexError):
            return [{"name": "默认场景", "raw_plan": text}]

    async def write_chapter_stream(
        self, project_id: int, chapter: Chapter, scene_plan: list[dict]
    ) -> AsyncGenerator[str, None]:
        """流式生成正文。"""
        memory_content = await self.memory.build_memory_for_writing(project_id, chapter.chapter_number)
        system_prompt = build_prompt_with_memory("write", memory_content)

        scene_text = "\n".join(
            f"场景{i+1}：{s.get('name', '')} - {s.get('core_event', '')} ({s.get('emotion_arc', '')})"
            for i, s in enumerate(scene_plan)
        )

        recent_chapters = await self.memory.load_recent_chapters(project_id, 1)
        prev_ending = recent_chapters[0].content[-500:] if recent_chapters else ""

        user_content = f"""请根据以下场景规划，撰写第 {chapter.chapter_number} 章的完整正文。

## 场景规划
{scene_text}

## 上一章结尾（需要自然衔接）
{prev_ending if prev_ending else "这是第一章，无需衔接。"}

## 写作要求
1. 默认目标 3000-5000 字
2. 开头前 20% 必须有钩子
3. 每章至少推进一条线、回应一个旧悬念、留下一个新钩子
4. 直接输出纯正文，不写章节标题、概要、备注
5. 场景内部的 Beats 只作隐性骨架，正文要写成连续叙事

请直接输出正文："""

        # 流式输出
        async for chunk in self._call_ai_stream(system_prompt, user_content, max_tokens=8192):
            yield chunk

    async def polish_text(self, text: str, instruction: str = "润色以下段落") -> str:
        """润色文本。"""
        system_prompt = build_prompt("polish")
        result = await self._call_ai(
            system_prompt,
            f"{instruction}\n\n---\n\n{text}\n\n---\n\n请输出润色后的文本，保持原有风格：",
            max_tokens=4096,
        )
        return result if isinstance(result, str) else ""

    async def rewrite_text(self, text: str, instruction: str = "重写以下段落") -> str:
        """重写文本。"""
        system_prompt = build_prompt("rewrite")
        result = await self._call_ai(
            system_prompt,
            f"{instruction}\n\n---\n\n{text}\n\n---\n\n请输出重写后的文本：",
            max_tokens=4096,
        )
        return result if isinstance(result, str) else ""

    async def expand_text(self, text: str, instruction: str = "扩写以下段落") -> str:
        """扩写文本。"""
        system_prompt = build_prompt("expand")
        result = await self._call_ai(
            system_prompt,
            f"{instruction}\n\n---\n\n{text}\n\n---\n\n请输出扩写后的文本：",
            max_tokens=4096,
        )
        return result if isinstance(result, str) else ""
