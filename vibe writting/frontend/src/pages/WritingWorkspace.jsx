import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Save, Check, FileText, Wand2 } from 'lucide-react'
import { useProjectStore } from '../stores/projectStore'
import { aiApi } from '../api/client'

// 英文字段名 → 中文标签映射
const fieldLabels = {
  pov: '视角', goal: '目标', conflict: '冲突',
  hook_direction: '钩子方向', character_state: '主角状态',
  scenes_preview: '场景预览', active_foreshadowings: '活跃伏笔',
}

// 场景卡片组件
function SceneCards({ scenes }) {
  if (!scenes || scenes.length === 0) return null
  const typeColors = {
    '铺垫': 'bg-blue-50 text-blue-600 border-blue-200',
    '冲突': 'bg-red-50 text-red-600 border-red-200',
    '高潮': 'bg-amber-50 text-amber-600 border-amber-200',
    '转折': 'bg-purple-50 text-purple-600 border-purple-200',
    '收尾': 'bg-green-50 text-green-600 border-green-200',
  }
  return (
    <div className="space-y-2">
      {scenes.map((scene, i) => (
        <div key={i} className="bg-white rounded-lg border border-gray-100 p-3 text-xs">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-5 h-5 rounded bg-purple-500 text-white flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
            <span className="font-medium text-gray-800">{scene.name}</span>
            {scene.scene_type && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] border ${typeColors[scene.scene_type] || 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                {scene.scene_type}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-600">
            {scene.location && <div><span className="text-gray-400">地点：</span>{scene.location}</div>}
            {scene.characters && <div><span className="text-gray-400">人物：</span>{Array.isArray(scene.characters) ? scene.characters.join(', ') : scene.characters}</div>}
            {scene.core_event && <div className="col-span-2"><span className="text-gray-400">事件：</span>{scene.core_event}</div>}
            {scene.emotion_arc && <div className="col-span-2"><span className="text-gray-400">情绪：</span>{scene.emotion_arc}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function WritingWorkspace() {
  const { id, chapterId } = useParams()
  const { currentProject, chapters, fetchProject, fetchChapters, updateChapter } = useProjectStore()
  const [toast] = useState(null)

  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [wordCount, setWordCount] = useState(0)
  const [selectedChapter, setSelectedChapter] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [planning, setPlanning] = useState(false)
  const editorRef = useRef(null)

  useEffect(() => { fetchProject(id); fetchChapters(id) }, [id])

  useEffect(() => {
    if (chapterId && chapters.length > 0) {
      const ch = chapters.find((c) => c.id === parseInt(chapterId))
      if (ch) { setSelectedChapter(ch); setContent(ch.content || '') }
    }
  }, [chapterId, chapters])

  useEffect(() => { setWordCount(content.replace(/\s/g, '').length) }, [content])

  const handleSave = async () => {
    if (!selectedChapter) return
    setSaving(true)
    try {
      await updateChapter(id, selectedChapter.id, { content, status: 'completed' })
      setLastSaved(new Date())
      fetchChapters(id)
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  const handleAnalyze = async () => {
    if (!selectedChapter) return
    setAnalyzing(true)
    try {
      const { data } = await aiApi.analyze(selectedChapter.id)
      await updateChapter(id, selectedChapter.id, { pre_analysis: data })
      setSelectedChapter(prev => ({ ...prev, pre_analysis: data }))
      fetchChapters(id)
    } catch (err) { console.error(err) }
    setAnalyzing(false)
  }

  const handlePlanScenes = async () => {
    if (!selectedChapter) return
    setPlanning(true)
    try {
      const { data } = await aiApi.planScenes(selectedChapter.id)
      const sceneData = { scenes: data.scenes || data }
      await updateChapter(id, selectedChapter.id, { scene_plan: sceneData })
      setSelectedChapter(prev => ({ ...prev, scene_plan: sceneData }))
      fetchChapters(id)
    } catch (err) { console.error(err) }
    setPlanning(false)
  }

  const handlePolish = async () => {
    if (!selectedChapter) return
    const text = window.getSelection().toString() || content.slice(-500)
    if (!text) return
    try {
      const { data } = await aiApi.polish(text)
      if (window.getSelection().toString()) {
        setContent((prev) => prev.replace(text, data.result))
      } else { setContent(data.result) }
    } catch (err) { console.error(err) }
  }

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSave() }
  }

  // 解析写前分析
  const analysis = selectedChapter?.pre_analysis?.analysis || selectedChapter?.pre_analysis
  // 解析场景规划
  const scenePlan = selectedChapter?.scene_plan?.scenes || selectedChapter?.scene_plan

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-100 gap-px">
      {/* 左侧：章节列表 + 分析 */}
      <div className="w-72 flex-shrink-0 bg-white flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200">
          <Link to={`/project/${id}`} className="flex items-center gap-1 text-gray-400 hover:text-gray-600 mb-3 text-xs transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> 返回项目
          </Link>
          <h2 className="text-sm font-semibold text-gray-800">章节编辑</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* 章节列表 */}
          <div className="p-3 space-y-1 border-b border-gray-100">
            {chapters.map((ch) => (
              <Link key={ch.id} to={`/project/${id}/write/${ch.id}`}
                className={`w-full text-left p-2.5 rounded-lg transition-all text-sm ${
                  ch.id === selectedChapter?.id ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                }`}>
                <span className="text-xs text-gray-400 mr-2">#{ch.chapter_number}</span>
                {ch.title || `第${ch.chapter_number}章`}
              </Link>
            ))}
          </div>
          {/* 写前分析 */}
          {selectedChapter && (
            <div className="p-3 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-800">写前分析</h3>
                <button onClick={handleAnalyze} disabled={analyzing}
                  className="text-[10px] text-purple-600 hover:text-purple-700 disabled:opacity-50">
                  {analyzing ? '分析中...' : '🔄 刷新'}
                </button>
              </div>
              {analysis ? (
                <div className="text-xs text-gray-600 space-y-1.5 max-h-48 overflow-y-auto">
                  {typeof analysis === 'string' ? (
                    <div className="whitespace-pre-wrap leading-relaxed">
                      {analysis
                        .replace(/^#{1,6}\s*/gm, '')
                        .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
                        .replace(/^- /gm, '• ')
                        .replace(/---+/g, '')
                        .replace(/\n{3,}/g, '\n\n')
                        .trim()
                        .slice(0, 1500)
                      }
                    </div>
                  ) : (
                    Object.entries(analysis)
                      .filter(([k]) => k !== 'analysis')
                      .map(([k, v]) => {
                        const label = fieldLabels[k] || k
                        const val = String(v).replace(/[#*\-]/g, '').trim().slice(0, 150)
                        return <div key={k}><span className="text-gray-400">{label}：</span>{val}</div>
                      })
                  )}
                </div>
              ) : (
                <button onClick={handleAnalyze} disabled={analyzing}
                  className="w-full text-center py-2 text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg hover:border-purple-300 hover:text-purple-600 transition-colors disabled:opacity-50">
                  {analyzing ? '分析中...' : '生成写前分析'}
                </button>
              )}
            </div>
          )}
          {/* 场景规划 */}
          {selectedChapter && (
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-800">场景规划</h3>
                <button onClick={handlePlanScenes} disabled={planning}
                  className="text-[10px] text-purple-600 hover:text-purple-700 disabled:opacity-50">
                  {planning ? '规划中...' : '🔄 刷新'}
                </button>
              </div>
              {scenePlan ? (
                <SceneCards scenes={scenePlan} />
              ) : (
                <button onClick={handlePlanScenes} disabled={planning}
                  className="w-full text-center py-2 text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg hover:border-purple-300 hover:text-purple-600 transition-colors disabled:opacity-50">
                  {planning ? '规划中...' : '生成场景规划'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 中间：编辑器 */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedChapter ? (
          <>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded">第{selectedChapter.chapter_number}章</span>
                <span className="text-sm font-medium text-gray-800">{selectedChapter.title || '未命名'}</span>
                <span className="text-xs text-gray-400">· {wordCount} 字</span>
                {lastSaved && <span className="text-xs text-green-500 flex items-center gap-1"><Check className="w-3 h-3" /> 已保存</span>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handlePolish}
                  className="px-3 py-1.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 flex items-center gap-1 transition-colors">
                  <Wand2 className="w-3.5 h-3.5" /> 润色
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="px-4 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors btn-press">
                  <Save className="w-3.5 h-3.5" />
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <textarea ref={editorRef} value={content} onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full h-full min-h-[600px] px-8 py-6 text-[15px] leading-[2] text-gray-700 resize-none focus:outline-none"
                placeholder="在此编辑章节内容...&#10;&#10;Ctrl+S 保存" />
            </div>
            <div className="px-5 py-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
              <span>Ctrl+S 保存</span>
              <span>{wordCount} 字</span>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center">
            <FileText className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">选择左侧章节开始编辑</p>
          </div>
        )}
      </div>
    </div>
  )
}
