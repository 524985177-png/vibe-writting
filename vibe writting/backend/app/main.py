"""Vibe Writing 后端主入口。"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db
from .api import projects, chapters, ai, documents


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时初始化数据库。"""
    await init_db()
    yield


app = FastAPI(
    title="Vibe Writing",
    description="AI 驱动的长篇小说创作平台",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS 配置（允许前端开发服务器访问）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(projects.router)
app.include_router(chapters.router)
app.include_router(ai.router)
app.include_router(documents.router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "vibe-writing"}
