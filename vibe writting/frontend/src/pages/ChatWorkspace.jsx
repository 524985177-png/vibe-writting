import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, Sparkles, BookOpen, PenLine, FileText, Copy, Check, ChevronRight, Search, Trash2 } from 'lucide-react'
import { useProjectStore } from '../stores/projectStore'
import { useToast } from '../components/Toast'
import { aiApi, documentApi, writeChapterStream, projectApi } from '../api/client'

// 简易 Markdown 渲染
function renderMarkdown(text) {
  if (!text) return ''
  return text
    // 代码块
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-gray-900 text-gray-100 rounded-lg p-3 my-2 text-xs overflow-x-auto"><code>$2</code></pre>')
    // 行内代码
    .replace(/`([^`]+)`/g, '<code class="bg-gray-200 text-gray-800 px-1.5 py-0.5 rounded text-xs">$1</code>')
    // 加粗
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    // 链接
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-purple-600 underline hover:text-purple-800" target="_blank">$1</a>')
    // 分隔线
    .replace(/^---$/gm, '<hr class="border-gray-200 my-3" />')
    // 无序列表
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    // 有序列表
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm">$1</li>')
    // 标题
    .replace(/^### (.+)$/gm, '<h3 class="font-bold text-sm mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-bold text-base mt-3 mb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="font-bold text-lg mt-3 mb-1">$1</h1>')
}

// 复制按钮
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={handleCopy} className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

// 阅读进度条
function ReadingProgressBar({ progress }) {
  return <div className="h-0.5 bg-purple-500 transition-all duration-150" style={{ width: `${progress}%` }} />
}

// 进度步骤指示器
function StepProgress({ steps, current }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500 py-1">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="w-3 h-3 text-gray-300" />}
          <span className={i <= current ? 'text-purple-600 font-medium' : 'text-gray-400'}>
            {i < current ? '✓' : i === current ? '●' : '○'} {step}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function ChatWorkspace() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { currentProject, fetchProject, createChapter, updateChapter, deleteChapter, chapters, fetchChapters } = useProjectStore()
  const { toast } = useToast()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [selectedChapter, setSelectedChapter] = useState(null)
  const [writeSteps, setWriteSteps] = useState(null) // 写作步骤进度
  const [readProgress, setReadProgress] = useState(0)
  const [chapterSearch, setChapterSearch] = useState('')
  const chapterScrollRef = useRef(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    fetchProject(id)
    fetchChapters(id)
  }, [id])

  // 欢迎消息
  useEffect(() => {
    if (messages.length === 0 && currentProject) {
      const hasChapters = chapters.length > 0
      if (!hasChapters) {
        // 新项目：详细引导
        setMessages([{
          role: 'assistant',
          content: `你好！我是 **${currentProject.name}** 的 AI 写作助手。\n\n我可以帮你完成小说创作的全流程：`,
          type: 'welcome',
          welcomeData: {
            steps: [
              { icon: '📋', title: '生成大纲', desc: 'AI 根据你的设定生成完整故事框架', action: '生成大纲' },
              { icon: '📝', title: '逐章创作', desc: 'AI 分析→规划场景→流式生成正文', action: '写下一章' },
              { icon: '✨', title: '润色优化', desc: '对已生成的章节进行文笔优化', action: '润色' },
            ],
            tip: '直接输入你的想法，或点击下方按钮开始。',
          },
        }])
      } else {
        // 已有章节：简洁欢迎
        setMessages([{
          role: 'assistant',
          content: `你好！**${currentProject.name}** 已有 ${chapters.length} 章。\n\n说「写下一章」继续创作，或告诉我你想做什么。`,
        }])
      }
    }
  }, [currentProject])

  // 切换章节时重置阅读进度
  useEffect(() => {
    setReadProgress(0)
    if (chapterScrollRef.current) chapterScrollRef.current.scrollTop = 0
  }, [selectedChapter])

  // 动态快捷指令
  const getSuggestions = useCallback(() => {
    if (streaming || loading) return []
    const hasChapters = chapters.length > 0
    const lastMsg = messages[messages.length - 1]

    // 根据最后一条消息动态调整
    if (lastMsg?.type === 'chapter') {
      return [
        { label: '✨ 润色', action: '润色' },
        { label: '🔄 重写', action: '重写' },
        { label: '📝 写下一章', action: '写下一章', primary: true },
        { label: '📖 查看', action: '查看章节列表' },
      ]
    }

    if (hasChapters) {
      return [
        { label: '📝 写下一章', action: '写下一章', primary: true },
        { label: '✨ 润色', action: '润色' },
        { label: '🔄 重写', action: '重写' },
        { label: '📋 大纲', action: '查看大纲' },
        { label: '📚 章节', action: '章节列表' },
      ]
    }
    return [
      { label: '📋 生成大纲', action: '生成大纲', primary: true },
      { label: '📝 写第一章', action: '写下一章' },
      { label: '📖 查看文档', action: '去文档' },
    ]
  }, [chapters, streaming, loading, messages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText, writeSteps])

  // 删除章节并重排编号
  const handleDeleteChapter = async (chapter) => {
    if (!confirm(`确定删除「第${chapter.chapter_number}章 ${chapter.title || ''}」？`)) return
    try {
      await deleteChapter(id, chapter.id)
      if (selectedChapter?.id === chapter.id) setSelectedChapter(null)

      // 重排剩余章节编号
      await fetchChapters(id)
      const remaining = useProjectStore.getState().chapters
      for (let i = 0; i < remaining.length; i++) {
        const expectedNum = i + 1
        if (remaining[i].chapter_number !== expectedNum) {
          await updateChapter(id, remaining[i].id, { chapter_number: expectedNum })
        }
      }
      await fetchChapters(id)
      await fetchProject(id)
    } catch (err) {
      toast.error('删除失败：' + err.message)
    }
  }

  // 重试上一条用户消息
  const handleRetry = async (userMsg) => {
    setMessages(prev => prev.filter(m => m !== userMsg))
    setLoading(true)
    try {
      await processUserMessage(userMsg.content)
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ 出错了：${err.message}` }])
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading || streaming) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg, time: new Date() }])
    setLoading(true)
    try {
      await processUserMessage(msg)
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ 出错了：${err.message}` }])
    } finally {
      setLoading(false)
    }
  }

  const processUserMessage = async (msg) => {
    const lower = msg.toLowerCase()

    if (lower.includes('写下一章') || lower.includes('写第') || lower.includes('开始写作') || lower.includes('生成正文')) {
      return handleWriteChapter()
    }
    if (lower.includes('大纲') || lower.includes('outline')) {
      return (lower.includes('生成') || lower.includes('重新') || lower.includes('更新'))
        ? handleGenerateOutline() : handleShowOutline()
    }
    if (lower.includes('润色') || lower.includes('优化') || lower.includes('polish')) return handlePolish()
    if (lower.includes('重写') || lower.includes('改写') || lower.includes('rewrite')) return handleRewrite()
    if (lower.includes('扩写') || lower.includes('展开') || lower.includes('expand')) return handleExpand()
    if (lower.includes('角色') || lower.includes('人物') || lower.includes('character')) return handleShowCharacters()
    if (lower.includes('章节') || lower.includes('目录') || lower.includes('进度')) return handleShowChapters()
    if (lower.includes('去文档') || lower.includes('打开文档') || lower.includes('编辑大纲')) {
      navigate(`/project/${id}/documents`)
      return
    }
    return handleGeneralChat(msg)
  }

  // ── 写下一章 ──
  const handleWriteChapter = async () => {
    await fetchChapters(id)
    const allChapters = useProjectStore.getState().chapters
    const maxNum = allChapters.reduce((max, ch) => Math.max(max, ch.chapter_number || 0), 0)
    const nextNum = maxNum + 1
    const steps = ['写前分析', '场景规划', '生成正文', '完成']
    setWriteSteps({ steps, current: 0 })
    setStreamText('')

    try {
      const chapter = await createChapter(id, { chapter_number: nextNum, title: `第${nextNum}章` })

      // 写前分析
      setWriteSteps(prev => ({ ...prev, current: 0 }))
      setStreamText('📋 正在进行写前分析...')
      let preAnalysis = null
      try { ({ data: preAnalysis } = await aiApi.analyze(chapter.id)) } catch {}

      // 场景规划
      setWriteSteps(prev => ({ ...prev, current: 1 }))
      setStreamText('🎯 正在规划场景...')
      let scenePlan = null
      try { ({ data: { scenes: scenePlan } } = await aiApi.planScenes(chapter.id)) } catch {}

      // 流式生成正文
      setWriteSteps(prev => ({ ...prev, current: 2 }))
      setStreamText('')
      let fullContent = ''
      await writeChapterStream(chapter.id, scenePlan,
        (chunk) => { fullContent += chunk; setStreamText(fullContent) },
        async (done) => {
          setWriteSteps(prev => ({ ...prev, current: 3 }))
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: fullContent,
            chapterNum: nextNum,
            wordCount: done.word_count,
            type: 'chapter',
          }])
          setStreamText('')
          setWriteSteps(null)
          await fetchChapters(id)
          await fetchProject(id)
        }
      )
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ 生成失败：${err.message}` }])
      setStreamText('')
      setWriteSteps(null)
    } finally {
      setStreaming(false)
    }
  }

  const handleGenerateOutline = async () => {
    setMessages(prev => [...prev, { role: 'assistant', content: '⏳ 正在生成大纲，大约需要 1 分钟...' }])
    setStreaming(true)
    try {
      await aiApi.generateOutline({
        project_id: parseInt(id),
        answers: {
          genre: currentProject.genre || '',
          protagonist_structure: currentProject.protagonist_structure || 'single',
          protagonist_personality: '',
          core_conflict: currentProject.core_conflict || '',
          target_chapters: String(currentProject.target_chapters || 20),
          synopsis: currentProject.synopsis || '',
        },
      })
      const { data } = await documentApi.get(id, 'outline')
      setMessages(prev => [...prev, { role: 'assistant', content: data.content, type: 'outline' }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ 大纲生成失败：${err.message}` }])
    } finally { setStreaming(false) }
  }

  const handleShowOutline = async () => {
    try {
      const { data } = await documentApi.get(id, 'outline')
      if (data.content && data.content.length > 50) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.content, type: 'outline' }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: '还没有大纲。要我现在生成一份吗？' }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '还没有大纲。要我现在生成一份吗？' }])
    }
  }

  const handlePolish = async () => {
    const allChapters = useProjectStore.getState().chapters
    if (!allChapters.length) return setMessages(prev => [...prev, { role: 'assistant', content: '还没有章节，请先说「写下一章」。' }])
    const lastCh = allChapters[allChapters.length - 1]
    setMessages(prev => [...prev, { role: 'assistant', content: `⏳ 正在润色第${lastCh.chapter_number}章最后 500 字...` }])
    setStreaming(true)
    try {
      const { data } = await aiApi.polish(lastCh.content.slice(-500))
      setMessages(prev => [...prev, { role: 'assistant', content: data.result, type: 'polish' }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ 润色失败：${err.message}` }])
    } finally { setStreaming(false) }
  }

  const handleRewrite = async () => {
    const allChapters = useProjectStore.getState().chapters
    if (!allChapters.length) return setMessages(prev => [...prev, { role: 'assistant', content: '还没有章节，请先说「写下一章」。' }])
    const lastCh = allChapters[allChapters.length - 1]
    setMessages(prev => [...prev, { role: 'assistant', content: `⏳ 正在重写第${lastCh.chapter_number}章最后 500 字...` }])
    setStreaming(true)
    try {
      const { data } = await aiApi.rewrite(lastCh.content.slice(-500))
      setMessages(prev => [...prev, { role: 'assistant', content: data.result, type: 'rewrite' }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ 重写失败：${err.message}` }])
    } finally { setStreaming(false) }
  }

  const handleExpand = async () => {
    const allChapters = useProjectStore.getState().chapters
    if (!allChapters.length) return setMessages(prev => [...prev, { role: 'assistant', content: '还没有章节，请先说「写下一章」。' }])
    const lastCh = allChapters[allChapters.length - 1]
    setMessages(prev => [...prev, { role: 'assistant', content: '⏳ 正在扩写...' }])
    setStreaming(true)
    try {
      const { data } = await aiApi.expand(lastCh.content.slice(-300))
      setMessages(prev => [...prev, { role: 'assistant', content: data.result, type: 'expand' }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ 扩写失败：${err.message}` }])
    } finally { setStreaming(false) }
  }

  const handleShowCharacters = async () => {
    try {
      const { data } = await documentApi.get(id, 'outline')
      const match = data.content?.match(/(?:角色|人物|主角|反派)[\s\S]{0,500}/)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: match ? `👥 角色信息：\n\n${match[0]}` : '暂无角色信息，可在文档管理中添加。',
      }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '暂无角色信息。' }])
    }
  }

  const handleShowChapters = async () => {
    await fetchChapters(id)
    const all = useProjectStore.getState().chapters
    if (!all.length) return setMessages(prev => [...prev, { role: 'assistant', content: '还没有章节。说「写下一章」开始创作。' }])
    const list = all.map(ch => `- **第${ch.chapter_number}章** ${ch.title || ''}（${ch.word_count}字）`).join('\n')
    setMessages(prev => [...prev, { role: 'assistant', content: `📚 章节列表：\n\n${list}` }])
  }

  const handleGeneralChat = async (msg) => {
    setStreaming(true)
    setStreamText('')
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: parseInt(id), message: msg }),
      })
      if (!response.ok) throw new Error('请求失败')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of decoder.decode(value).split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.done) break
              if (data.content) { fullText += data.content; setStreamText(fullText) }
            } catch {}
          }
        }
      }
      if (fullText) setMessages(prev => [...prev, { role: 'assistant', content: fullText }])
      setStreamText('')
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${err.message}` }])
      setStreamText('')
    } finally { setStreaming(false) }
  }

  const suggestions = getSuggestions()

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-100 gap-px">
      {/* ===== 左侧：聊天区 ===== */}
      <div className="w-1/2 flex flex-col bg-white">
        {/* 顶部栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Link to={`/project/${id}`} className="text-gray-400 hover:text-gray-600 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-sm font-semibold text-gray-800">{currentProject?.name || '加载中...'}</h1>
              <p className="text-xs text-gray-400">{chapters.length} 章已完成</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 rounded-full">
            <Sparkles className="w-3 h-3 text-purple-500" />
            <span className="text-xs text-purple-600 font-medium">AI 助手</span>
          </div>
        </div>

        {/* 消息区 */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group animate-message`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center flex-shrink-0 mr-2.5 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
              )}
              <div className="max-w-[80%]">
                <div className={`${
                  msg.role === 'user'
                    ? 'bg-purple-600 text-white rounded-2xl rounded-br-md px-4 py-2.5'
                    : 'bg-gray-50 text-gray-800 rounded-2xl rounded-bl-md px-4 py-2.5 border border-gray-100'
                }`}>
                  {/* 欢迎引导卡片 */}
                  {msg.type === 'welcome' && msg.welcomeData ? (
                    <div>
                      <div className="text-sm leading-7 whitespace-pre-wrap mb-3" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                      <div className="space-y-2">
                        {msg.welcomeData.steps.map((step, si) => (
                          <button key={si} onClick={() => handleSend(step.action)}
                            className="w-full flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 hover:border-purple-200 hover:bg-purple-50 hover:shadow-sm transition-all text-left group">
                            <span className="text-xl flex-shrink-0">{step.icon}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 group-hover:text-purple-600 transition-colors">{step.title}</p>
                              <p className="text-xs text-gray-400 mt-0.5">{step.desc}</p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-3 text-center">{msg.welcomeData.tip}</p>
                    </div>
                  ) : msg.type === 'chapter' ? (
                    <div>
                      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200">
                        <span className="text-xs font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded">
                          第{msg.chapterNum}章
                        </span>
                        <span className="text-xs text-gray-400">{msg.wordCount} 字</span>
                      </div>
                      <div className="text-sm leading-7 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                    </div>
                  ) : (
                    <div className="text-sm leading-7 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                  )}
                </div>
                {/* AI 消息操作栏 */}
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <CopyButton text={msg.content} />
                    {msg.type === 'chapter' && (
                      <button onClick={() => setSelectedChapter(useProjectStore.getState().chapters.find(ch => ch.chapter_number === msg.chapterNum))}
                        className="text-xs text-gray-400 hover:text-purple-600 px-1.5 py-0.5 rounded hover:bg-purple-50 transition-colors">
                        查看
                      </button>
                    )}
                    {msg.content?.startsWith('❌') && (
                      <>
                        <button onClick={() => {
                          // 找到这条错误消息之前的最后一条用户消息并重试
                          const msgIdx = messages.indexOf(msg)
                          const lastUserMsg = [...messages].slice(0, msgIdx).reverse().find(m => m.role === 'user')
                          if (lastUserMsg) handleRetry(lastUserMsg)
                        }}
                          className="text-xs text-gray-400 hover:text-purple-600 px-1.5 py-0.5 rounded hover:bg-purple-50 transition-colors">
                          重试
                        </button>
                        <button onClick={() => { setMessages(prev => prev.filter((_, i) => i !== messages.indexOf(msg))) }}
                          className="text-xs text-gray-400 hover:text-red-500 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors">
                          删除
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {/* 时间戳 */}
              {msg.time && (
                <p className={`text-[10px] text-gray-300 mt-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                  {new Date(msg.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          ))}

          {/* 步骤进度 */}
          {writeSteps && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center flex-shrink-0 mr-2.5" />
              <div className="bg-gray-50 rounded-2xl rounded-bl-md px-4 py-3 border border-gray-100">
                <StepProgress steps={writeSteps.steps} current={writeSteps.current} />
              </div>
            </div>
          )}

          {/* 流式输出 */}
          {streaming && streamText && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center flex-shrink-0 mr-2.5 mt-0.5">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="bg-gray-50 text-gray-800 rounded-2xl rounded-bl-md px-4 py-2.5 border border-gray-100 max-w-[80%]">
                <div className="text-sm leading-7 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: renderMarkdown(streamText) }} />
                <span className="inline-block w-1.5 h-4 bg-purple-400 animate-pulse ml-0.5 align-text-bottom" />
              </div>
            </div>
          )}

          {/* 加载指示器 */}
          {(loading || streaming) && !streamText && !writeSteps && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center flex-shrink-0 mr-2.5">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="bg-gray-50 rounded-2xl rounded-bl-md px-4 py-3 border border-gray-100 flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-gray-400">AI 思考中...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 快捷按钮 */}
        {suggestions.length > 0 && (
          <div className="px-5 py-2.5 flex gap-2 overflow-x-auto border-t border-gray-100">
            {suggestions.map((s) => (
              <button key={s.action} onClick={() => handleSend(s.action)} disabled={loading || streaming}
                title={s.hint || s.action}
                className={`flex-shrink-0 px-3.5 py-1.5 text-xs font-medium rounded-full transition-all disabled:opacity-40 btn-press ${
                  s.primary
                    ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-sm shadow-purple-200'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-purple-200 hover:text-purple-600 hover:bg-purple-50'
                }`}>
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* 输入区 */}
        <div className="px-5 py-4 border-t border-gray-200">
          <div className="flex gap-2.5 items-end mb-1.5">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder={streaming ? 'AI 正在生成中...' : loading ? '处理中...' : '输入消息，或点击上方按钮...'}
                rows={1}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:bg-white outline-none transition-all placeholder:text-gray-400 resize-none max-h-32"
                disabled={loading || streaming}
                style={{ height: 'auto', minHeight: '44px' }}
                onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px' }}
              />
              {input && (
                <button onClick={() => { setInput(''); inputRef.current?.focus() }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
                  ✕
                </button>
              )}
            </div>
            <button onClick={() => handleSend()} disabled={!input.trim() || loading || streaming}
              className="w-10 h-10 flex items-center justify-center bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0 btn-press">
              <Send className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-between mt-1 px-1">
            <span className="text-[10px] text-gray-400">Enter 发送 · Shift+Enter 换行</span>
            {input.length > 0 && <span className="text-[10px] text-gray-400">{input.length}</span>}
          </div>
        </div>
      </div>

      {/* ===== 右侧：章节面板 ===== */}
      <div className="w-1/2 flex flex-col bg-white">
        {selectedChapter ? (
          /* ── 章节预览 ── */
          (() => {
            const currentIdx = chapters.findIndex(ch => ch.id === selectedChapter.id)
            const prevCh = currentIdx > 0 ? chapters[currentIdx - 1] : null
            const nextCh = currentIdx < chapters.length - 1 ? chapters[currentIdx + 1] : null
            const readTime = Math.ceil((selectedChapter.word_count || 0) / 300) // 按每分钟300字

            return (
              <div className="flex flex-col h-full">
                {/* 阅读进度条 */}
                <div className="h-0.5 bg-gray-100 flex-shrink-0">
                  <ReadingProgressBar progress={readProgress} />
                </div>

                {/* 顶部栏 */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setSelectedChapter(null)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded flex-shrink-0">第{selectedChapter.chapter_number}章</span>
                        <input
                          value={selectedChapter.title || ''}
                          onChange={(e) => setSelectedChapter({ ...selectedChapter, title: e.target.value })}
                          onBlur={async () => {
                            if (selectedChapter.title !== chapters.find(ch => ch.id === selectedChapter.id)?.title) {
                              await updateChapter(id, selectedChapter.id, { title: selectedChapter.title })
                              fetchChapters(id)
                            }
                          }}
                          onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                          className="text-sm font-semibold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-purple-500 outline-none transition-colors flex-1 min-w-0 px-1 py-0.5"
                          placeholder="输入章节标题..."
                        />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">{selectedChapter.word_count} 字</span>
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs text-gray-400">约 {readTime} 分钟</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CopyButton text={selectedChapter.content || ''} />
                    <button onClick={() => handleDeleteChapter(selectedChapter)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <Link to={`/project/${id}/write/${selectedChapter.id}`}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors">
                      ✏️ 编辑
                    </Link>
                  </div>
                </div>

                {/* 正文内容 */}
                <div ref={chapterScrollRef} className="flex-1 overflow-y-auto"
                  onScroll={(e) => {
                    const { scrollTop, scrollHeight, clientHeight } = e.target
                    setReadProgress(scrollHeight <= clientHeight ? 0 : (scrollTop / (scrollHeight - clientHeight)) * 100)
                  }}>
                  {selectedChapter.content ? (
                    <div className="px-10 py-8 max-w-2xl mx-auto">
                      {/* 章节标题 */}
                      <div className="text-center mb-8">
                        <p className="text-xs text-purple-500 font-medium tracking-wider uppercase mb-2">Chapter {selectedChapter.chapter_number}</p>
                        <h1 className="text-xl font-bold text-gray-800">{selectedChapter.title || `第${selectedChapter.chapter_number}章`}</h1>
                        <div className="w-12 h-0.5 bg-purple-300 mx-auto mt-4" />
                      </div>
                      {/* 正文 */}
                      <article className="text-[15px] leading-[2] text-gray-700 whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedChapter.content) }} />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full">
                      <div className="w-20 h-20 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
                        <FileText className="w-8 h-8 text-gray-300" />
                      </div>
                      <p className="text-base font-medium text-gray-600 mb-1.5">章节还没有内容</p>
                      <p className="text-sm text-gray-400 mb-4">在左侧输入「写下一章」生成</p>
                      <button onClick={() => handleSend('写下一章')}
                        className="px-5 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-xl hover:bg-purple-700 transition-colors shadow-sm shadow-purple-200">
                        ✨ 生成此章
                      </button>
                    </div>
                  )}
                </div>

                {/* 底部章节导航 */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 flex-shrink-0">
                  {prevCh ? (
                    <button onClick={() => setSelectedChapter(prevCh)}
                      className="flex items-center gap-2 text-xs text-gray-500 hover:text-purple-600 transition-colors group">
                      <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                      <span>第{prevCh.chapter_number}章 {prevCh.title || ''}</span>
                    </button>
                  ) : <div />}
                  {nextCh ? (
                    <button onClick={() => setSelectedChapter(nextCh)}
                      className="flex items-center gap-2 text-xs text-gray-500 hover:text-purple-600 transition-colors group">
                      <span>第{nextCh.chapter_number}章 {nextCh.title || ''}</span>
                      <ArrowLeft className="w-3.5 h-3.5 rotate-180 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  ) : (
                    <button onClick={() => handleSend('写下一章')}
                      className="flex items-center gap-1.5 text-xs font-medium text-purple-600 hover:text-purple-700 transition-colors">
                      写下一章 <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )
          })()
        ) : (
          /* ── 章节列表 ── */
          <div className="flex flex-col h-full">
            {/* 标题栏 + 统计 */}
            <div className="px-5 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">章节列表</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">{chapters.length} 章</span>
                    {chapters.length > 0 && (
                      <>
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs text-gray-400">
                          {chapters.reduce((sum, ch) => sum + (ch.word_count || 0), 0).toLocaleString()} 字
                        </span>
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs text-gray-400">
                          均 {Math.round(chapters.reduce((sum, ch) => sum + (ch.word_count || 0), 0) / chapters.length)} 字/章
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <button onClick={() => handleSend('写下一章')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-40"
                  disabled={streaming || loading}>
                  <PenLine className="w-3.5 h-3.5" />
                  写新章节
                </button>
              </div>
              {/* 进度条 */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div className="bg-gradient-to-r from-purple-500 to-indigo-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, ((currentProject?.current_chapter_count || 0) / (currentProject?.target_chapters || 1)) * 100)}%` }} />
                </div>
                <span className="text-xs font-medium text-gray-500 flex-shrink-0">
                  {Math.round(((currentProject?.current_chapter_count || 0) / (currentProject?.target_chapters || 1)) * 100)}%
                </span>
              </div>
              {/* 搜索框 */}
              {chapters.length > 0 && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    value={chapterSearch}
                    onChange={(e) => setChapterSearch(e.target.value)}
                    placeholder="搜索章节..."
                    className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  />
                </div>
              )}
            </div>

            {/* 章节列表 */}
            <div className="flex-1 overflow-y-auto">
              {chapters.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-16 px-6">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center justify-center mb-5">
                    <PenLine className="w-8 h-8 text-purple-400" />
                  </div>
                  <p className="text-base font-medium text-gray-700 mb-1.5">开始你的创作之旅</p>
                  <p className="text-sm text-gray-400 text-center mb-5 leading-relaxed">
                    在左侧输入「写下一章」<br />AI 将为你分析、规划并生成完整章节
                  </p>
                  <button onClick={() => handleSend('写下一章')}
                    className="px-5 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-xl hover:bg-purple-700 transition-colors shadow-sm shadow-purple-200">
                    ✨ 写第一章
                  </button>
                </div>
              ) : (
                <div className="p-3 space-y-1">
                  {chapters
                    .filter(ch => {
                      if (!chapterSearch) return true
                      const q = chapterSearch.toLowerCase()
                      return String(ch.chapter_number).includes(q) ||
                             (ch.title || '').toLowerCase().includes(q) ||
                             (ch.content || '').toLowerCase().includes(q)
                    })
                    .map((ch, i) => (
                    <button key={ch.id} onClick={() => setSelectedChapter(ch)}
                      className="w-full text-left p-3 rounded-xl hover:bg-gray-50 hover:shadow-sm transition-all group">
                      <div className="flex items-start gap-3">
                        {/* 序号 */}
                        <div className="relative flex-shrink-0">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                            ch.id === selectedChapter?.id
                              ? 'bg-purple-500 text-white'
                              : 'bg-purple-50 text-purple-600 group-hover:bg-purple-100'
                          }`}>
                            <span className="text-sm font-bold">{ch.chapter_number}</span>
                          </div>
                          {i < chapters.length - 1 && (
                            <div className="absolute left-1/2 -translate-x-1/2 top-9 w-px h-1 bg-gray-200" />
                          )}
                        </div>
                        {/* 内容 */}
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="flex items-center justify-between">
                            <p className={`text-sm font-medium truncate transition-colors ${
                              ch.id === selectedChapter?.id ? 'text-purple-600' : 'text-gray-800 group-hover:text-purple-600'
                            }`}>
                              {ch.title || `第${ch.chapter_number}章`}
                            </p>
                            <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{ch.word_count} 字</span>
                          </div>
                          {ch.content && (
                            <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                              {ch.content.slice(0, 100)}
                            </p>
                          )}
                          {/* 状态标签 */}
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              ch.status === 'completed' ? 'bg-green-50 text-green-600' :
                              ch.status === 'writing' ? 'bg-yellow-50 text-yellow-600' :
                              'bg-gray-50 text-gray-400'
                            }`}>
                              {ch.status === 'completed' ? '已完成' : ch.status === 'writing' ? '写作中' : '待创作'}
                            </span>
                            {ch.content && (
                              <span className="text-[10px] text-gray-300">
                                ~{Math.ceil((ch.word_count || 0) / 300)} 分钟阅读
                              </span>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteChapter(ch) }}
                              className="text-[10px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all ml-auto">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                  {chapters.filter(ch => {
                    if (!chapterSearch) return true
                    const q = chapterSearch.toLowerCase()
                    return String(ch.chapter_number).includes(q) ||
                           (ch.title || '').toLowerCase().includes(q) ||
                           (ch.content || '').toLowerCase().includes(q)
                  }).length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-sm text-gray-400">未找到匹配的章节</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 底部入口 */}
            <div className="px-4 py-3 border-t border-gray-100">
              <Link to={`/project/${id}/documents`}
                className="flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-xl transition-colors">
                <BookOpen className="w-3.5 h-3.5" />
                大纲 / 文档管理
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
