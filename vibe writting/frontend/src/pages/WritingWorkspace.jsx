import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Play, Sparkles, Save, Wand2 } from 'lucide-react'
import { useProjectStore } from '../stores/projectStore'
import { aiApi, writeChapterStream } from '../api/client'

export default function WritingWorkspace() {
  const { id, chapterId } = useParams()
  const { currentProject, currentChapter, chapters, fetchProject, fetchChapters, updateChapter, setCurrentChapter } = useProjectStore()

  const [content, setContent] = useState('')
  const [isWriting, setIsWriting] = useState(false)
  const [preAnalysis, setPreAnalysis] = useState(null)
  const [scenePlan, setScenePlan] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [planning, setPlanning] = useState(false)
  const editorRef = useRef(null)

  useEffect(() => {
    fetchProject(id)
    fetchChapters(id)
  }, [id])

  useEffect(() => {
    if (chapterId && chapters.length > 0) {
      const ch = chapters.find((c) => c.id === parseInt(chapterId))
      if (ch) {
        setCurrentChapter(ch)
        setContent(ch.content || '')
        setPreAnalysis(ch.pre_analysis || null)
        setScenePlan(ch.scene_plan || null)
      }
    }
  }, [chapterId, chapters])

  // 写前分析
  const handleAnalyze = async () => {
    if (!currentChapter) return
    setAnalyzing(true)
    try {
      const { data } = await aiApi.analyze(currentChapter.id)
      setPreAnalysis(data)
      setAnalyzing(false)
    } catch (err) {
      alert('分析失败：' + (err.response?.data?.detail || err.message))
      setAnalyzing(false)
    }
  }

  // 场景规划
  const handlePlanScenes = async () => {
    if (!currentChapter) return
    setPlanning(true)
    try {
      const { data } = await aiApi.planScenes(currentChapter.id)
      setScenePlan(data.scenes)
      setPlanning(false)
    } catch (err) {
      alert('规划失败：' + (err.response?.data?.detail || err.message))
      setPlanning(false)
    }
  }

  // AI 写下一章（流式）
  const handleWrite = async () => {
    if (!currentChapter) return
    setIsWriting(true)
    setContent('')

    try {
      await writeChapterStream(
        currentChapter.id,
        scenePlan?.scenes || null,
        (chunk) => {
          setContent((prev) => prev + chunk)
        },
        (done) => {
          setIsWriting(false)
          fetchChapters(id)
        }
      )
    } catch (err) {
      alert('写作失败：' + err.message)
      setIsWriting(false)
    }
  }

  // 保存
  const handleSave = async () => {
    if (!currentChapter) return
    try {
      await updateChapter(id, currentChapter.id, { content, status: 'completed' })
      alert('保存成功')
    } catch (err) {
      alert('保存失败：' + err.message)
    }
  }

  // AI 润色
  const handlePolish = async () => {
    const selection = window.getSelection().toString()
    const text = selection || content
    if (!text) return
    try {
      const { data } = await aiApi.polish(text)
      if (selection) {
        setContent((prev) => prev.replace(selection, data.result))
      } else {
        setContent(data.result)
      }
    } catch (err) {
      alert('润色失败：' + err.message)
    }
  }

  const wordCount = content.replace(/\s/g, '').length

  return (
    <div className="flex gap-4 h-[calc(100vh-80px)]">
      {/* 左侧：写前分析 */}
      <div className="w-72 flex-shrink-0 bg-white rounded-xl border border-gray-200 p-4 overflow-y-auto">
        <Link to={`/project/${id}`} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-3 text-sm">
          <ArrowLeft className="w-4 h-4" /> 返回
        </Link>

        <h2 className="font-bold text-gray-800 mb-3">写前分析</h2>

        {!preAnalysis ? (
          <button onClick={handleAnalyze} disabled={analyzing}
            className="w-full flex items-center justify-center gap-2 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 disabled:opacity-50 text-sm">
            <Sparkles className="w-4 h-4" />
            {analyzing ? '分析中...' : 'AI 写前分析'}
          </button>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-xs mb-1">视角</p>
              <p className="text-gray-800">{preAnalysis.pov || '-'}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-xs mb-1">核心目标</p>
              <p className="text-gray-800">{preAnalysis.goal || '-'}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-xs mb-1">核心冲突</p>
              <p className="text-gray-800">{preAnalysis.conflict || '-'}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-xs mb-1">钩子方向</p>
              <p className="text-gray-800">{preAnalysis.hook_direction || '-'}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-xs mb-1">主角状态</p>
              <p className="text-gray-800">{preAnalysis.character_state || '-'}</p>
            </div>
          </div>
        )}

        <hr className="my-4" />

        <h3 className="font-bold text-gray-800 mb-3">场景规划</h3>

        {!scenePlan ? (
          <button onClick={handlePlanScenes} disabled={planning}
            className="w-full flex items-center justify-center gap-2 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-50 text-sm">
            <Wand2 className="w-4 h-4" />
            {planning ? '规划中...' : 'AI 场景规划'}
          </button>
        ) : (
          <div className="space-y-2 text-sm">
            {(scenePlan.scenes || scenePlan).map((scene, i) => (
              <div key={i} className="p-2 bg-blue-50 rounded-lg border border-blue-100">
                <p className="font-medium text-blue-800">{scene.name || `场景 ${i + 1}`}</p>
                <p className="text-gray-600 text-xs mt-1">{scene.core_event || scene.purpose || ''}</p>
                <p className="text-gray-400 text-xs mt-1">{scene.emotion_arc || ''}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 中间：编辑器 */}
      <div className="flex-1 flex flex-col bg-white rounded-xl border border-gray-200">
        {/* 工具栏 */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">
              第 {currentChapter?.chapter_number || '-'} 章
            </span>
            <span className="text-sm text-gray-400">·</span>
            <span className="text-sm text-gray-500">{wordCount} 字</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePolish} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1">
              <Wand2 className="w-3.5 h-3.5" />
              润色
            </button>
            <button onClick={handleSave} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1">
              <Save className="w-3.5 h-3.5" />
              保存
            </button>
            <button onClick={handleWrite} disabled={isWriting}
              className="px-4 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1">
              <Play className="w-3.5 h-3.5" />
              {isWriting ? '写作中...' : 'AI 写下一章'}
            </button>
          </div>
        </div>

        {/* 编辑区 */}
        <div className="flex-1 p-6 overflow-y-auto">
          <textarea
            ref={editorRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full min-h-[500px] text-lg leading-relaxed text-gray-800 resize-none focus:outline-none font-serif"
            placeholder={isWriting ? '' : '点击「AI 写下一章」开始创作，或直接在此输入内容...'}
            disabled={isWriting}
          />
        </div>
      </div>

      {/* 右侧：章节列表 */}
      <div className="w-56 flex-shrink-0 bg-white rounded-xl border border-gray-200 p-4 overflow-y-auto">
        <h3 className="font-bold text-gray-800 mb-3 text-sm">章节</h3>
        <div className="space-y-1">
          {chapters.map((ch) => (
            <Link
              key={ch.id}
              to={`/project/${id}/write/${ch.id}`}
              className={`block px-3 py-2 rounded-lg text-sm ${
                ch.id === parseInt(chapterId)
                  ? 'bg-purple-100 text-purple-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              #{ch.chapter_number} {ch.title || '未命名'}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
