"""应用配置：支持多模型供应商。"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from pydantic import BaseModel
from pydantic_settings import BaseSettings


class ModelProvider(BaseModel):
    """单个模型供应商配置。"""
    id: str                          # 唯一标识，如 "openai", "anthropic", "custom-1"
    name: str                        # 显示名称，如 "OpenAI", "Anthropic", "自定义"
    base_url: str = ""               # API 地址，如 "https://api.openai.com/v1"
    api_key: str = ""                # API Key
    provider_type: str = "openai"    # 供应商类型: openai / anthropic / google / custom
    models: list[str] = []           # 可用模型列表
    enabled: bool = True             # 是否启用


class ModelConfig(BaseModel):
    """模型全局配置。"""
    providers: list[ModelProvider] = []
    active_provider_id: str = ""     # 当前使用的供应商 ID
    active_model: str = ""           # 当前使用的模型名称


def _load_model_config() -> ModelConfig:
    """从 JSON 文件加载模型配置。"""
    config_path = Path("./data/model_config.json")
    if config_path.exists():
        try:
            data = json.loads(config_path.read_text(encoding="utf-8"))
            return ModelConfig(**data)
        except Exception:
            pass
    return ModelConfig()


def _save_model_config(config: ModelConfig) -> None:
    """保存模型配置到 JSON 文件。"""
    config_path = Path("./data/model_config.json")
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(
        json.dumps(config.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./data/vibe_writing.db"
    storage_root: str = "./data/projects"
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

    @property
    def storage_path(self) -> Path:
        path = Path(self.storage_root)
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def model_config_obj(self) -> ModelConfig:
        return _load_model_config()

    def save_model_config(self, config: ModelConfig) -> None:
        _save_model_config(config)


settings = Settings()
