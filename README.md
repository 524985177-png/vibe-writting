# Vibe Writing

AI 驱动的长篇小说创作平台。基于 novel-create skill 的创作方法论，提供对话式 AI 写作体验。

## 功能特性

### 核心能力

- **对话式创作**：像 IDE 助手一样与 AI 协作，AI 拥有完整项目上下文
- **自动操作**：AI 自动创建角色、伏笔、时间线，无需手动操作
- **写前分析**：AI 先分析视角、冲突、钩子方向，用户确认后再写正文
- **场景规划**：AI 输出 3-5 个场景卡片，可视化展示创作计划
- **质量检查**：自动检测字数、AI 痕迹、情绪补偿、段落节奏
- **三层记忆**：宪法记忆（世界观/法则）→ 项目记忆（大纲/伏笔）→ 会话记忆（对话历史）

### 项目管理

- 5 问立项引导
- 大纲/世界观/法则/冲突设计文档管理
- 角色档案管理
- 伏笔追踪（埋设/回收）
- 时间线管理

### 对话功能

- 对话历史持久化（刷新不丢失）
- Rewind 回退（撤销操作+删除对话）
- 多轮对话记忆
- 动态快捷指令

## 技术栈

| 层   | 技术                               |
| --- | -------------------------------- |
| 前端  | React + Vite + TailwindCSS       |
| 后端  | Python + FastAPI                 |
| 数据库 | SQLite (可迁移到 PostgreSQL)         |
| AI  | Anthropic Claude / OpenAI 兼容 API |

## 环境要求

- Python 3.9+
- Node.js 18+
- npm 或 yarn

## 安装

### 一键安装（推荐）

```bash
git clone https://github.com/ShijingYangwow27/vibe-writting.git  # 克隆项目到本地
cd vibe-writing                                                # 进入项目目录
./setup.sh                                                     # 运行一键安装脚本
```

`setup.sh` 包含 5 个步骤，每步都有详细注释：

1. 检查 Python3 环境
2. 检查 Node.js 环境
3. 安装后端 Python 依赖（FastAPI、SQLAlchemy、Anthropic SDK 等）
4. 安装前端 Node 依赖（React、Vite、TailwindCSS 等）
5. 创建数据存储目录

### 手动安装

```bash
git clone https://github.com/ShijingYangwow27/vibe-writting.git  
# 克隆项目到本地

cd vibe-writing                                                # 进入项目目录

# 后端
cd backend
pip install -r requirements.txt
cd ..

# 前端
cd frontend
npm install
cd ..
```

## 配置 AI 模型

启动项目后，在前端「设置」页面配置 AI 模型供应商：

### 支持的供应商

| 类型           | 说明                  | 示例                                     |
| ------------ | ------------------- | -------------------------------------- |
| OpenAI 兼容    | 支持 OpenAI API 格式的服务 | OpenAI, DeepSeek, 智谱, Moonshot, Ollama |
| Anthropic 原生 | Claude 系列模型         | Claude Sonnet, Haiku                   |

### 配置步骤

1. 打开 `http://localhost:5173/settings`
2. 点击预设供应商（如 OpenAI）或「自定义供应商」
3. 填写：
   - **Base URL**：API 地址（如 `https://api.openai.com/v1`）
   - **API Key**：你的 API Key
   - **模型名称**：如 `gpt-4o`、`claude-sonnet-4-6`
4. 点击模型名称即可切换

### 预设供应商

| 供应商         | Base URL                               |
| ----------- | -------------------------------------- |
| OpenAI      | `https://api.openai.com/v1`            |
| DeepSeek    | `https://api.deepseek.com/v1`          |
| 智谱 (GLM)    | `https://open.bigmodel.cn/api/paas/v4` |
| Moonshot    | `https://api.moonshot.cn/v1`           |
| Ollama (本地) | `http://localhost:11434/v1`            |

## 启动

### 一键启动

```bash
./start.sh
```

### 分别启动

```bash
# 终端 1：启动后端
cd backend
python3 -m uvicorn app.main:app --reload --port 8000

# 终端 2：启动前端
cd frontend
npm run dev
```

### 访问

| 服务     | 地址                           |
| ------ | ---------------------------- |
| 前端界面   | <http://localhost:5173>      |
| 后端 API | <http://localhost:8000>      |
| API 文档 | <http://localhost:8000/docs> |

## 使用流程

1. **新建项目**：点击「新建项目」，填写项目名称、题材、5 问立项信息
2. **AI 生成大纲**：AI 根据你的设定生成完整故事框架
3. **创建角色/伏笔**：在聊天中描述，AI 自动创建
4. **写前分析**：说「写下一章」，AI 先输出分析（视角、冲突、场景规划）
5. **确认写作**：点击「确认写作」，AI 生成正文并自动保存
6. **质量检查**：章节保存后自动运行质量检查
7. **管理故事元素**：在「故事元素」页面管理伏笔、时间线、角色

## 项目结构

```
vibe-writing/
├── backend/                     # FastAPI 后端
│   ├── app/
│   │   ├── api/                 # 路由
│   │   │   ├── projects.py      # 项目管理
│   │   │   ├── chapters.py      # 章节管理
│   │   │   ├── ai.py            # AI 对话 + 写作
│   │   │   ├── documents.py     # 文档管理
│   │   │   ├── story_elements.py # 伏笔/时间线/角色
│   │   │   ├── conversations.py # 对话历史
│   │   │   └── quality.py       # 质量检查
│   │   ├── core/
│   │   │   ├── memory.py        # 三层记忆系统
│   │   │   └── prompt_manager.py # Prompt 管理
│   │   ├── models/              # 数据模型
│   │   ├── schemas/             # Pydantic Schema
│   │   └── services/
│   │       └── ai_service.py    # AI 服务封装
│   └── requirements.txt
├── frontend/                    # React 前端
│   ├── src/
│   │   ├── api/client.js        # API 客户端
│   │   ├── components/          # Toast 等通用组件
│   │   ├── pages/
│   │   │   ├── ProjectList.jsx      # 项目列表
│   │   │   ├── ProjectDashboard.jsx # 项目详情
│   │   │   ├── ChatWorkspace.jsx    # 聊天工作台（核心）
│   │   │   ├── DocumentManager.jsx  # 文档管理
│   │   │   ├── StoryElements.jsx    # 故事元素管理
│   │   │   └── Settings.jsx         # 模型设置
│   │   └── stores/              # Zustand 状态管理
│   └── package.json
└── skills/                      # novel-create skill（创作方法论）
    └── novel-create/
        ├── SKILL.md             # 创作规则与流程
        ├── references/          # 23 个写作参考文档
        └── scripts/             # 质量检查脚本
```

## API 接口

| 方法   | 路径                                        | 说明        |
| ---- | ----------------------------------------- | --------- |
| GET  | `/api/projects`                           | 项目列表      |
| POST | `/api/projects`                           | 创建项目      |
| POST | `/api/ai/chat`                            | AI 对话（流式） |
| POST | `/api/ai/generate-outline`                | 生成大纲      |
| POST | `/api/projects/{id}/quality/{chapter_id}` | 质量检查      |
| GET  | `/api/projects/{id}/foreshadowings`       | 伏笔列表      |
| GET  | `/api/projects/{id}/timeline`             | 时间线       |
| GET  | `/api/projects/{id}/characters`           | 角色列表      |
| GET  | `/api/projects/{id}/conversations`        | 对话历史      |

完整 API 文档：启动后访问 <http://localhost:8000/docs>

## 许可证

MIT
