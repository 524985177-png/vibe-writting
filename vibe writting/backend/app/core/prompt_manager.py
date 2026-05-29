"""Prompt 管理器：按需组装 system prompt。"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

SKILL_DIR = Path(__file__).resolve().parent.parent.parent.parent / "skills" / "novel-create"

# 基础创作规则（始终加载）
BASE_PROMPT = """你是一位专业的长篇小说创作助手。请严格遵循以下核心原则：

1. 先读档，再下笔。
2. 大纲、人物、法则优先于临场发挥。
3. 先定场景任务，再写正文。
4. 每章必须推进剧情，不能只注水。
5. 写完必须检查，并且按问题类型定向返修。

## 创作强规则
- 展示，不要空讲；冲突驱动剧情；人物不能 OOC。
- 默认单一主 POV；没有明确收益，不要在同章乱切视角。
- 每个场景都要有任务；每章结尾都要有钩子，且不用低风险虚假悬念。
- 不靠机械降神收尾；写完必须做一次 AI 痕迹净化复检。

## 语言规则
- 少空泛感叹、总结性感悟、AI 高发词和空心华丽词，减少"他感到很""她觉得"一类抽象心理。
- 长短句交替，尽量用动作、反应、对话承载情绪。
- 对话避免剧本化堆叠；语气词只在角色口吻确有需要时少量使用。

## 视角规则
- 当前 POV 只能直接写他此刻可见、可闻、可感、可想、可推断到的内容。
- 非当前 POV 的内心、真实动机和即时判断，默认不要直接写死。
"""

# 按任务类型需要的 reference 模块
TASK_REFERENCES = {
    "analyze": ["chapter-workflow", "consistency"],
    "plan_scenes": ["chapter-workflow", "chapter-guide"],
    "write": ["chapter-guide", "chapter-template", "dialogue-writing", "hook-techniques"],
    "polish": ["quality-checklist", "dialogue-writing"],
    "rewrite": ["chapter-guide", "dialogue-writing"],
    "expand": ["content-expansion", "daily-narrative"],
    "check": ["quality-checklist", "consistency"],
    "outline": ["outline-template", "plot-structures", "conflict-design"],
    "character": ["character-building", "character-template"],
    "worldview": ["worldbuilding-logic", "worldbuilding-presentation"],
}

# Reference 文件名到路径的映射
REFERENCE_MAP = {
    "chapter-guide": "references/chapter-guide.md",
    "chapter-template": "references/chapter-template.md",
    "chapter-workflow": "references/chapter-workflow.md",
    "character-building": "references/character-building.md",
    "character-template": "references/character-template.md",
    "conflict-design": "references/conflict-design.md",
    "consistency": "references/consistency.md",
    "content-expansion": "references/content-expansion.md",
    "daily-narrative": "references/daily-narrative.md",
    "dialogue-writing": "references/dialogue-writing.md",
    "ensemble-writing": "references/ensemble-writing.md",
    "golden-finger-design": "references/golden-finger-design.md",
    "hook-techniques": "references/hook-techniques.md",
    "idea-incubation": "references/idea-incubation.md",
    "literary-opening": "references/literary-opening.md",
    "nonlinear-narrative": "references/nonlinear-narrative.md",
    "outline-template": "references/outline-template.md",
    "plot-structures": "references/plot-structures.md",
    "quality-checklist": "references/quality-checklist.md",
    "reader-compensation": "references/reader-compensation.md",
    "suspense-design": "references/suspense-design.md",
    "worldbuilding-logic": "references/worldbuilding-logic.md",
    "worldbuilding-presentation": "references/worldbuilding-presentation.md",
}


def load_reference(name: str) -> str:
    """加载单个 reference 文件内容。"""
    ref_path = SKILL_DIR / REFERENCE_MAP.get(name, "")
    if ref_path.exists():
        return ref_path.read_text(encoding="utf-8")
    return f"[Reference not found: {name}]"


def build_prompt(task_type: str, extra_references: list[str] | None = None) -> str:
    """
    根据任务类型组装 system prompt。

    Args:
        task_type: 任务类型 (analyze/plan_scenes/write/polish/check/outline 等)
        extra_references: 额外需要加载的 reference 模块名列表
    """
    prompt = BASE_PROMPT

    # 加载任务对应的 reference
    ref_names = TASK_REFERENCES.get(task_type, [])
    if extra_references:
        ref_names = list(set(ref_names + extra_references))

    for ref_name in ref_names:
        content = load_reference(ref_name)
        if not content.startswith("[Reference not found"):
            prompt += f"\n\n---\n\n{content}"

    return prompt


def build_prompt_with_memory(task_type: str, memory_content: str, extra_references: list[str] | None = None) -> str:
    """
    组装包含记忆内容的 system prompt。

    Args:
        task_type: 任务类型
        memory_content: 记忆文件内容（task_log、大纲、伏笔等）
        extra_references: 额外 reference
    """
    base = build_prompt(task_type, extra_references)
    return f"{base}\n\n---\n\n## 当前项目记忆\n\n{memory_content}"
