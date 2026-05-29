#!/bin/bash
# Vibe Writing 启动脚本

set -e

echo "🚀 启动 Vibe Writing..."

# 检查并创建 .env 文件
if [ ! -f backend/.env ]; then
    cp backend/.env.example backend/.env
    echo "📝 已创建 backend/.env"
    echo "⚠️  请编辑 backend/.env 填入 ANTHROPIC_API_KEY"
fi

# 创建数据目录
mkdir -p backend/data

# 杀掉占用端口的进程
lsof -ti :8000 | xargs kill -9 2>/dev/null || true
lsof -ti :5173 | xargs kill -9 2>/dev/null || true
sleep 1

echo ""
echo "📦 启动后端 (FastAPI on :8000)..."
cd backend
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..

echo ""
echo "🎨 启动前端 (Vite on :5173)..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

sleep 2

echo ""
echo "════════════════════════════════════════"
echo "  ✅ Vibe Writing 已启动！"
echo ""
echo "  前端: http://localhost:5173"
echo "  后端: http://localhost:8000"
echo "  API:  http://localhost:8000/docs"
echo "════════════════════════════════════════"
echo ""
echo "按 Ctrl+C 停止所有服务"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
