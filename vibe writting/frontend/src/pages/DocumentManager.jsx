import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Save, Check, FileText, Clock } from 'lucide-react'
import { documentApi } from '../api/client'
import { useToast } from '../components/Toast'

const DOC_TYPES = [
  { type: 'outline', label: '大纲', icon: '📋', desc: '故事框架与章节规划' },
  { type: 'worldview', label: '世界观', icon: '🌍', desc: '世界设定与规则' },
  { type: 'rules', label: '法则', icon: '📏', desc: '不可违背的故事法则' },
  { type: 'conflict', label: '冲突设计', icon: '⚔️', desc: '冲突链与张力设计' },
  { type: 'settings', label: '设定记录', icon: '📝', desc: '具体设定与细节' },
  { type: 'dialogue', label: '角色台词库', icon: '💬', desc: '角色经典台词' },
]

export default function DocumentManager() {
  const { id } = useParams()
  const [documents, setDocuments] = useState([])
  const [activeDoc, setActiveDoc] = useState(null)
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const { toast } = useToast()
  const [wordCount, setWordCount] = useState(0)
  const autoSaveTimer = useRef(null)
  const editorRef = useRef(null)

  useEffect(() => { loadDocuments() }, [id])

  // 自动保存（30秒无操作）
  useEffect(() => {
    if (!activeDoc) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      if (content !== '' && content !== (documents.find(d => d.doc_type === activeDoc.doc_type)?.content || '')) {
        handleSave(true)
      }
    }, 30000)
    return () => clearTimeout(autoSaveTimer.current)
  }, [content])

  // 统计字数
  useEffect(() => {
    setWordCount(content.replace(/\s/g, '').length)
  }, [content])

  const loadDocuments = async () => {
    try {
      const { data } = await documentApi.list(id)
      setDocuments(data)
      if (data.length > 0 && !activeDoc) {
        selectDoc(data[0])
      }
    } catch (err) {
      console.error('Failed to load documents:', err)
    }
  }

  const selectDoc = async (doc) => {
    setActiveDoc(doc)
    try {
      const { data } = await documentApi.get(id, doc.doc_type)
      setContent(data.content)
    } catch {
      setContent(doc.content || '')
    }
  }

  const handleSave = async (isAutoSave = false) => {
    if (!activeDoc) return
    if (!isAutoSave) setSaving(true)
    try {
      await documentApi.update(id, activeDoc.doc_type, { content })
      setSaved(true)
      setLastSaved(new Date())
      setTimeout(() => setSaved(false), 2000)
      if (!isAutoSave) {
        // 更新本地文档列表
        setDocuments(prev => prev.map(d =>
          d.doc_type === activeDoc.doc_type ? { ...d, content } : d
        ))
      }
    } catch (err) {
      if (!isAutoSave) toast.error('保存失败：' + err.message)
    } finally {
      if (!isAutoSave) setSaving(false)
    }
  }

  // Ctrl/Cmd + S 保存
  const handleKeyDown = useCallback((e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      handleSave()
    }
  }, [content, activeDoc])

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-100 gap-px">
      {/* 左侧：文档列表 */}
      <div className="w-64 flex-shrink-0 bg-white flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200">
          <Link to={`/project/${id}`} className="flex items-center gap-1 text-gray-400 hover:text-gray-600 mb-3 text-xs transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> 返回项目
          </Link>
          <h2 className="text-sm font-semibold text-gray-800">项目文档</h2>
          <p className="text-xs text-gray-400 mt-0.5">管理你的创作设定</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {DOC_TYPES.map((dt) => {
            const doc = documents.find((d) => d.doc_type === dt.type)
            const hasContent = doc?.content && doc.content.length > 50
            return (
              <button
                key={dt.type}
                onClick={() => doc && selectDoc(doc)}
                className={`w-full text-left p-3 rounded-xl transition-all group ${
                  activeDoc?.doc_type === dt.type
                    ? 'bg-purple-50 border border-purple-200'
                    : 'hover:bg-gray-50 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">{dt.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${
                      activeDoc?.doc_type === dt.type ? 'text-purple-700' : 'text-gray-700 group-hover:text-gray-900'
                    }`}>
                      {dt.label}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{dt.desc}</p>
                  </div>
                  {hasContent && (
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 右侧：编辑器 */}
      <div className="flex-1 flex flex-col bg-white">
        {activeDoc ? (
          <>
            {/* 编辑器头部 */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <span className="text-xl">
                  {DOC_TYPES.find((d) => d.type === activeDoc.doc_type)?.icon}
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">
                    {DOC_TYPES.find((d) => d.type === activeDoc.doc_type)?.label}
                  </h2>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{wordCount} 字</span>
                    {lastSaved && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {lastSaved.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {saved && (
                  <span className="flex items-center gap-1 text-xs text-green-600 animate-fade-in">
                    <Check className="w-3.5 h-3.5" /> 已保存
                  </span>
                )}
                <button onClick={() => handleSave()} disabled={saving}
                  className="px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5 transition-all btn-press">
                  <Save className="w-3.5 h-3.5" />
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
            {/* 编辑器 */}
            <div className="flex-1 overflow-y-auto">
              <textarea
                ref={editorRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full h-full min-h-[600px] px-8 py-6 text-sm leading-8 text-gray-700 resize-none focus:outline-none font-serif"
                placeholder="在此编辑文档内容...&#10;&#10;支持 Markdown 格式&#10;Ctrl/Cmd + S 保存&#10;30 秒无操作自动保存"
              />
            </div>
            {/* 底部状态栏 */}
            <div className="px-6 py-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
              <span>Markdown 格式 · Ctrl+S 保存 · 30s 自动保存</span>
              <span>{wordCount} 字</span>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-20 h-20 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-sm text-gray-400">选择左侧文档开始编辑</p>
          </div>
        )}
      </div>
    </div>
  )
}
