import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Trash2, BookOpen, Sparkles, X } from 'lucide-react'
import { useProjectStore } from '../stores/projectStore'
import { useToast } from '../components/Toast'
import { aiApi, documentApi } from '../api/client'

export default function ProjectList() {
  const navigate = useNavigate()
  const { projects, loading, fetchProjects, createProject, deleteProject } = useProjectStore()
  const { toast } = useToast()
  const [showCreate, setShowCreate] = useState(false)
  const [step, setStep] = useState(1) // 1=基本信息, 2=5问立项
  const [creating, setCreating] = useState(false)
  const [creatingStatus, setCreatingStatus] = useState('')
  const [outlinePreview, setOutlinePreview] = useState(null) // 生成的大纲预览
  const [previewProjectId, setPreviewProjectId] = useState(null)
  const [form, setForm] = useState({
    name: '',
    genre: '',
    target_chapters: '20',
    protagonist_structure: 'single',
    protagonist_personality: '',
    core_conflict: '',
    synopsis: '',
  })

  useEffect(() => { fetchProjects() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return

    setCreating(true)
    setCreatingStatus('正在创建项目...')
    try {
      // 1. 创建项目
      const project = await createProject({
        name: form.name,
        genre: form.genre,
        target_chapters: parseInt(form.target_chapters) || 20,
        protagonist_structure: form.protagonist_structure,
      })

      // 2. 调用 AI 生成大纲
      setCreatingStatus('项目已创建，AI 正在生成大纲，预计需要 1-2 分钟...')
      let outlineOk = false
      try {
        await aiApi.generateOutline({
          project_id: project.id,
          answers: {
            genre: form.genre,
            protagonist_structure: form.protagonist_structure,
            protagonist_personality: form.protagonist_personality,
            core_conflict: form.core_conflict,
            target_chapters: String(form.target_chapters),
            synopsis: form.synopsis,
          },
        })
        outlineOk = true
      } catch (err) {
        console.error('Outline generation failed:', err)
        toast.warning('项目已创建，但大纲生成失败：' + (err.response?.data?.detail || err.message))
      }

      // 3. 拉取大纲内容并展示
      setCreatingStatus('正在加载大纲...')
      try {
        const { data } = await documentApi.get(project.id, 'outline')
        setOutlinePreview(data.content)
        setPreviewProjectId(project.id)
      } catch {
        // 拉取失败就直接跳转
      }

      setShowCreate(false)
      setStep(1)
      setForm({ name: '', genre: '', target_chapters: '20', protagonist_structure: 'single', protagonist_personality: '', core_conflict: '', synopsis: '' })
      if (!outlineOk) navigate(`/project/${project.id}`)
    } catch (err) {
      toast.error('创建失败：' + (err.response?.data?.detail || err.message))
    } finally {
      setCreating(false)
      setCreatingStatus('')
    }
  }

  const handleDelete = async (id, name) => {
    if (confirm(`确定删除项目「${name}」？`)) {
      await deleteProject(id)
    }
  }

  const canNext = form.name.trim()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">我的项目</h1>
        <button
          onClick={() => { setShowCreate(true); setStep(1) }}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          <Plus className="w-4 h-4" />
          新建项目
        </button>
      </div>

      {/* 新建项目向导 */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* 头部 */}
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-gray-800">
                  {step === 1 ? '新建小说项目' : 'AI 立项向导'}
                </h2>
                <button onClick={() => { setShowCreate(false); setStep(1); setCreatingStatus('') }}
                  className="text-gray-400 hover:text-gray-600 p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {/* 步骤指示器 */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    step >= 1 ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>1</div>
                  <span className={`text-xs ${step >= 1 ? 'text-purple-600 font-medium' : 'text-gray-400'}`}>基本信息</span>
                </div>
                <div className={`flex-1 h-0.5 ${step >= 2 ? 'bg-purple-600' : 'bg-gray-200'}`} />
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    step >= 2 ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>2</div>
                  <span className={`text-xs ${step >= 2 ? 'text-purple-600 font-medium' : 'text-gray-400'}`}>AI 设定</span>
                </div>
              </div>
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {step === 1 && (
                <div className="space-y-4 animate-fade-in">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">项目名称 <span className="text-red-400">*</span></label>
                    <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                      placeholder="例如：星辰变、斗破苍穹" autoFocus />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">题材类型</label>
                    <div className="flex flex-wrap gap-2">
                      {['玄幻', '言情', '悬疑', '科幻', '都市', '历史', '官场', '武侠'].map((g) => (
                        <button key={g} onClick={() => setForm({ ...form, genre: g })}
                          className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                            form.genre === g
                              ? 'bg-purple-100 border-purple-300 text-purple-700'
                              : 'border-gray-200 text-gray-600 hover:border-purple-200'
                          }`}>
                          {g}
                        </button>
                      ))}
                    </div>
                    <input type="text" value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all mt-2"
                      placeholder="或自定义题材..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">目标章节数</label>
                      <input type="number" value={form.target_chapters} min="1"
                        onChange={(e) => setForm({ ...form, target_chapters: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">主角结构</label>
                      <select value={form.protagonist_structure} onChange={(e) => setForm({ ...form, protagonist_structure: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all">
                        <option value="single">单主角</option>
                        <option value="dual">双主角</option>
                        <option value="ensemble">群像</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4 animate-fade-in">
                  <div className="p-3 bg-purple-50 rounded-xl text-xs text-purple-600 mb-4">
                    💡 填写越详细，AI 生成的大纲越贴合你的想法。所有字段都可以留空让 AI 自由发挥。
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">主角核心性格</label>
                    <textarea value={form.protagonist_personality} onChange={(e) => setForm({ ...form, protagonist_personality: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all resize-none"
                      placeholder="例如：外表冷漠但内心热血，有强烈的正义感，但容易冲动..."
                      rows={2} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">核心冲突</label>
                    <textarea value={form.core_conflict} onChange={(e) => setForm({ ...form, core_conflict: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all resize-none"
                      placeholder="主角想要什么？什么阻止了他？"
                      rows={2} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">主线梗概</label>
                    <textarea value={form.synopsis} onChange={(e) => setForm({ ...form, synopsis: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all resize-none"
                      placeholder="用 150-300 字概括主线故事（可选）"
                      rows={4} />
                  </div>
                </div>
              )}
            </div>

            {/* 底部按钮 */}
            <div className="px-6 py-4 border-t border-gray-100">
              {step === 1 ? (
                <div className="flex gap-3">
                  <button onClick={() => canNext && setStep(2)} disabled={!canNext}
                    className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 font-medium transition-all btn-press">
                    下一步
                  </button>
                  <button onClick={() => { setShowCreate(false); setStep(1); setCreatingStatus('') }}
                    className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors">
                    取消
                  </button>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button onClick={handleCreate} disabled={creating}
                    className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2 transition-all btn-press">
                    {creating ? (
                      <><span className="animate-spin">⏳</span> AI 生成中...</>
                    ) : (
                      <><Sparkles className="w-4 h-4" /> 创建并生成大纲</>
                    )}
                  </button>
                  <button onClick={() => setStep(1)} disabled={creating}
                    className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors">
                    上一步
                  </button>
                </div>
              )}
              {creatingStatus && (
                <p className="text-sm text-purple-600 mt-3 text-center animate-pulse">{creatingStatus}</p>
              )}
            </div>
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
              <button onClick={() => { setOutlinePreview(null); navigate(`/project/${previewProjectId}`) }}
                className="text-gray-400 hover:text-gray-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 prose prose-sm max-w-none">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed font-sans">{outlinePreview}</pre>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button onClick={() => { setOutlinePreview(null); navigate(`/project/${previewProjectId}`) }}
                className="flex-1 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">
                进入项目
              </button>
              <button onClick={() => { setOutlinePreview(null); navigate(`/project/${previewProjectId}/documents`) }}
                className="flex-1 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
                编辑大纲
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 项目列表 */}
      {loading ? (
        <div className="text-center py-20">
          <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-400">加载中...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center justify-center mx-auto mb-6">
            <BookOpen className="w-10 h-10 text-purple-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">开始你的创作之旅</h2>
          <p className="text-sm text-gray-400 mb-6 max-w-sm mx-auto">
            创建一个新项目，AI 将帮助你完成从大纲到正文的完整创作流程
          </p>
          <button onClick={() => { setShowCreate(true); setStep(1) }}
            className="px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-medium shadow-lg shadow-purple-200 transition-all">
            <Plus className="w-4 h-4 inline mr-2" />
            新建项目
          </button>
        </div>
      ) : (
        <>
          {/* 统计概览 */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">项目总数</p>
              <p className="text-2xl font-bold text-gray-800">{projects.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">总章节数</p>
              <p className="text-2xl font-bold text-gray-800">
                {projects.reduce((sum, p) => sum + (p.current_chapter_count || 0), 0)}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">进行中</p>
              <p className="text-2xl font-bold text-purple-600">
                {projects.filter(p => (p.current_chapter_count || 0) > 0 && (p.current_chapter_count || 0) < (p.target_chapters || 1)).length}
              </p>
            </div>
          </div>

          {/* 项目卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => {
              const progress = Math.min(100, Math.round(((project.current_chapter_count || 0) / (project.target_chapters || 1)) * 100))
              const isActive = (project.current_chapter_count || 0) > 0 && progress < 100
              return (
                <div key={project.id} className="bg-white rounded-xl border border-gray-200 hover:border-purple-200 hover:shadow-lg transition-all group">
                  {/* 卡片头部 */}
                  <div className="p-5 pb-3">
                    <div className="flex items-start justify-between mb-3">
                      <Link to={`/project/${project.id}/chat`} className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-gray-800 group-hover:text-purple-600 transition-colors truncate">
                          {project.name}
                        </h3>
                      </Link>
                      <button onClick={() => handleDelete(project.id, project.name)}
                        className="text-gray-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-all ml-2">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {/* 标签 */}
                    <div className="flex items-center gap-2 mb-3">
                      {project.genre && (
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{project.genre}</span>
                      )}
                      {isActive && (
                        <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-600 rounded-full">创作中</span>
                      )}
                      {progress === 100 && (
                        <span className="text-xs px-2 py-0.5 bg-green-50 text-green-600 rounded-full">已完成</span>
                      )}
                    </div>
                    {/* 进度 */}
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                      <span>{project.current_chapter_count || 0} / {project.target_chapters} 章</span>
                      <span className="font-medium text-gray-600">{progress}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full transition-all ${
                        progress === 100 ? 'bg-green-500' : 'bg-gradient-to-r from-purple-500 to-indigo-500'
                      }`} style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  {/* 卡片底部 */}
                  <div className="px-5 py-3 border-t border-gray-100 flex gap-2">
                    <Link to={`/project/${project.id}/chat`}
                      className="flex-1 text-center py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors">
                      {isActive ? '继续创作' : '开始创作'}
                    </Link>
                    <Link to={`/project/${project.id}`}
                      className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      详情
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
