"""AI 相关 Schema。"""

from pydantic import BaseModel


class ApiKeyRequest(BaseModel):
    api_key: str


class ApiKeyResponse(BaseModel):
    configured: bool
    message: str


class OutlineGenerationRequest(BaseModel):
    project_id: int
    answers: dict  # 5问回答


class PreAnalysisResponse(BaseModel):
    pov: str
    goal: str
    conflict: str
    hook_direction: str
    active_foreshadowings: list[str]
    character_state: str


class ScenePlanResponse(BaseModel):
    scenes: list[dict]


class UsageStatsResponse(BaseModel):
    total_input_tokens: int
    total_output_tokens: int
    total_cost: float
    call_count: int
