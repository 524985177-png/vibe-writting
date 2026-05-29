import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { FileText, ArrowLeft, Sparkles, X, BookOpen } from 'lucide-react'
import { useProjectStore } from '../stores/projectStore'
import { aiApi, documentApi } from '../api/client'

export default function ProjectDashboard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { currentProject, chapters, fetchProject, fetchChapters } = useProjectStore()
  const [showInitWizard, setShowInitWizard] = useState(false)
  const [answers, setAnswers] = useState({
    genre: '', protagonist_structure: 'single',
    protagonist_personality: '', core_conflict: '',
    target_chapters: '20', synopsis: '',
  })
  const [generating, setGenerating] = useState(false)
  const [generatingStatus, setGeneratingStatus] = useState('')
  const [outlinePreview, setOutlinePreview] = useState(null)

  useEffect(() => {
    fetchProject(id)
    fetchChapters(id)
  }, [id])

  const handleInitProject = async () => {
    setGenerating(true)
    setGeneratingStatus('正在连接 AI 模型...')
    try {
      const timer = setTimeout(() => setGeneratingStatus('AI 正在生成大纲，预计需要 1-2 分钟，请耐心等待...'), 3000)
      await aiApi.generateOutline({ project_id: parseInt(id), answers })
      clearTimeout(timer)
      setGeneratingStatus('大纲生成完成！正在加载...')
      await fetchProject(id)
      // 拉取大纲内容展示
      try {
        const { data } = await documentApi.get(id, 'outline')
        setOutlinePreview(data.content)
      } catch {}
      setShowInitWizard(false)
      setGeneratingStatus('')
    } catch (err) {
      setGeneratingStatus('')
      alert('生成大纲失败：' + (err.response?.data?.detail || err.message))
    } finally {
      setGenerating(false)
    }
  }

  if (!currentProject) {
    return <div className="text-center py-12 text-gray-500">加载中...</div>
  }

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
                {currentProject.current_chapter_count}/{currentProject.target_chapters} 章
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to={`/project/${id}/chat`}
              className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-medium shadow-sm shadow-purple-200 transition-all">
              <Sparkles className="w-4 h-4" />
              开始创作
            </Link>
          </div>
        </div>
        {/* 进度条 */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
            <span>创作进度</span>
            <span className="font-medium text-gray-600">
              {Math.round(((currentProject.current_chapter_count || 0) / (currentProject.target_chapters || 1)) * 100)}%
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="bg-gradient-to-r from-purple-500 to-indigo-500 h-2 rounded-full transition-all"
              style={{ width: `${Math.min(100, ((currentProject.current_chapter_count || 0) / (currentProject.target_chapters || 1)) * 100)}%` }} />
          </div>
        </div>
      </div>

      {/* 快捷入口 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Link to={`/project/${id}/chat`}
          className="bg-white rounded-xl border border-gray-200 p-4 hover:border-purple-200 hover:shadow-md transition-all group text-center">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center mx-auto mb-2 group-hover:bg-purple-100 transition-colors">
            <Sparkles className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-sm font-medium text-gray-700">AI 创作</p>
          <p className="text-xs text-gray-400 mt-0.5">聊天式写作</p>
        </Link>
        <Link to={`/project/${id}/documents`}
          className="bg-white rounded-xl border border-gray-200 p-4 hover:border-purple-200 hover:shadow-md transition-all group text-center">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-2 group-hover:bg-blue-100 transition-colors">
            <BookOpen className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-sm font-medium text-gray-700">文档管理</p>
          <p className="text-xs text-gray-400 mt-0.5">大纲 / 世界观</p>
        </Link>
        <button onClick={() => setShowInitWizard(true)}
          className="bg-white rounded-xl border border-gray-200 p-4 hover:border-purple-200 hover:shadow-md transition-all group text-center">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-2 group-hover:bg-amber-100 transition-colors">
            <FileText className="w-5 h-5 text-amber-500" />
          </div>
          <p className="text-sm font-medium text-gray-700">AI 立项</p>
          <p className="text-xs text-gray-400 mt-0.5">生成大纲</p>
        </button>
      </div>

      {/* 章节列表 */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-800">章节列表</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              共 {chapters.length} 章
              {chapters.length > 0 && ` · ${chapters.reduce((s, c) => s + (c.word_count || 0), 0).toLocaleString()} 字`}
            </p>
          </div>
        </div>
        {chapters.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400 mb-3">还没有章节</p>
            <Link to={`/project/${id}/chat`}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors">
              <Sparkles className="w-3.5 h-3.5" />
              开始创作
            </Link>
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

      {/* AI 立项向导弹窗 */}
      {showInitWizard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <h2 className="text-lg font-bold mb-4">AI 立项向导</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">1. 题材与风格</label>
                <input value={answers.genre} onChange={(e) => setAnswers({ ...answers, genre: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder="玄幻、言情、悬疑、科幻..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">2. 主角结构</label>
                <select value={answers.protagonist_structure} onChange={(e) => setAnswers({ ...answers, protagonist_structure: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500">
                  <option value="single">单主角</option>
                  <option value="dual">双主角</option>
                  <option value="ensemble">群像</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">3. 主角核心性格</label>
                <textarea value={answers.protagonist_personality} onChange={(e) => setAnswers({ ...answers, protagonist_personality: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder="描述主角的性格特点..." rows={2} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">4. 核心冲突</label>
                <textarea value={answers.core_conflict} onChange={(e) => setAnswers({ ...answers, core_conflict: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder="主角想要什么？什么阻止了他？" rows={2} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">5. 主线梗概</label>
                <textarea value={answers.synopsis} onChange={(e) => setAnswers({ ...answers, synopsis: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder="用 150-300 字概括主线故事..." rows={4} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleInitProject} disabled={generating}
                className="flex-1 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
                {generating ? '⏳ AI 生成中...' : '✨ 生成大纲'}
              </button>
              <button onClick={() => setShowInitWizard(false)} disabled={generating}
                className="flex-1 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                取消
              </button>
            </div>
            {generatingStatus && (
              <p className="text-sm text-purple-600 mt-3 text-center animate-pulse">{generatingStatus}</p>
            )}
          </div>
        </div>
      )}

      {/* 大纲预览弹窗 */}
      {outlinePreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-800">
                <Sparkles className="w-5 h-5 inline text-purple-500 mr-1" />
                大纲已生成
              </h2>
              <button onClick={() => setOutlinePreview(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed font-sans">{outlinePreview}</pre>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button onClick={() => setOutlinePreview(null)}
                className="flex-1 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">
                开始写作
              </button>
              <button onClick={() => { setOutlinePreview(null); navigate(`/project/${id}/documents`) }}
                className="flex-1 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
                编辑大纲
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
