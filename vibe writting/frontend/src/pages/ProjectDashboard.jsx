import { useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { FileText, ArrowLeft, Sparkles, BookOpen, Eye } from 'lucide-react'
import { useProjectStore } from '../stores/projectStore'

export default function ProjectDashboard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { currentProject, chapters, fetchProject, fetchChapters } = useProjectStore()

  useEffect(() => {
    fetchProject(id)
    fetchChapters(id)
  }, [id])

  if (!currentProject) {
    return <div className="text-center py-12 text-gray-500">加载中...</div>
  }

  const progress = Math.round(((currentProject.current_chapter_count || 0) / (currentProject.target_chapters || 1)) * 100)
  const totalWords = chapters.reduce((s, c) => s + (c.word_count || 0), 0)

  return (
    <div>
      <Link to="/" className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-6 text-sm">
        <ArrowLeft className="w-4 h-4" /> 返回项目列表
      </Link>

      {/* 项目头部 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{currentProject.name}</h1>
            <div className="flex items-center gap-3 mt-2">
              {currentProject.genre && (
                <span className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full">{currentProject.genre}</span>
              )}
              <span className="text-sm text-gray-400">
                {currentProject.current_chapter_count}/{currentProject.target_chapters} 章 · {totalWords.toLocaleString()} 字
              </span>
            </div>
          </div>
        </div>
        {/* 进度条 */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
            <span>创作进度</span>
            <span className="font-medium text-gray-600">{progress}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="bg-gradient-to-r from-purple-500 to-indigo-500 h-2 rounded-full transition-all"
              style={{ width: `${Math.min(100, progress)}%` }} />
          </div>
        </div>
      </div>

      {/* 快捷入口 */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Link to={`/project/${id}/chat`}
          className="bg-white rounded-xl border border-gray-200 p-5 hover:border-purple-200 hover:shadow-md transition-all group text-center">
          <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center mx-auto mb-3 group-hover:bg-purple-100 transition-colors">
            <Sparkles className="w-6 h-6 text-purple-500" />
          </div>
          <p className="text-sm font-semibold text-gray-800">AI 创作</p>
          <p className="text-xs text-gray-400 mt-1">对话式写作，生成章节</p>
        </Link>
        <Link to={`/project/${id}/documents`}
          className="bg-white rounded-xl border border-gray-200 p-5 hover:border-purple-200 hover:shadow-md transition-all group text-center">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-3 group-hover:bg-blue-100 transition-colors">
            <BookOpen className="w-6 h-6 text-blue-500" />
          </div>
          <p className="text-sm font-semibold text-gray-800">文档管理</p>
          <p className="text-xs text-gray-400 mt-1">大纲 / 世界观 / 冲突设计</p>
        </Link>
        <Link to={`/project/${id}/elements`}
          className="bg-white rounded-xl border border-gray-200 p-5 hover:border-purple-200 hover:shadow-md transition-all group text-center">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center mx-auto mb-3 group-hover:bg-emerald-100 transition-colors">
            <Eye className="w-6 h-6 text-emerald-500" />
          </div>
          <p className="text-sm font-semibold text-gray-800">故事元素</p>
          <p className="text-xs text-gray-400 mt-1">伏笔 / 时间线 / 角色</p>
        </Link>
      </div>

      {/* 章节列表 */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-800">章节列表</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              共 {chapters.length} 章 · {totalWords.toLocaleString()} 字
            </p>
          </div>
        </div>
        {chapters.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400 mb-3">还没有章节</p>
            <button onClick={() => navigate(`/project/${id}/chat`)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors">
              <Sparkles className="w-3.5 h-3.5" />
              开始创作
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {chapters.map((ch) => (
              <Link key={ch.id} to={`/project/${id}/chat`}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors group">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center group-hover:bg-purple-100 transition-colors">
                    <span className="text-xs font-bold text-purple-600">{ch.chapter_number}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{ch.title || `第${ch.chapter_number}章`}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{ch.word_count} 字</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  ch.status === 'completed' ? 'bg-green-50 text-green-600' :
                  ch.status === 'writing' ? 'bg-yellow-50 text-yellow-600' :
                  'bg-gray-50 text-gray-400'
                }`}>
                  {ch.status === 'completed' ? '已完成' : ch.status === 'writing' ? '写作中' : '待创作'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
