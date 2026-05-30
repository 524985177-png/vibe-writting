import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Send, Sparkles, BookOpen, PenLine, FileText, Copy, Check, ChevronRight, Search, Trash2, X } from 'lucide-react'
import { useProjectStore } from '../stores/projectStore'
import { useToast } from '../components/Toast'
import { documentApi, storyApi, conversationApi, qualityApi } from '../api/client'

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

// 场景卡片组件：从 AI 回复中解析场景并展示
function SceneCards({ content }) {
  const sceneRegex = /\*\*场景(\d+)：(.+?)\*\*([\s\S]*?)(?=\*\*场景\d+|##|$)/g
  const scenes = []
  let match
  while ((match = sceneRegex.exec(content)) !== null) {
    const sceneContent = match[3].trim()
    const fields = {}
    const fieldRegex = /[-•]\s*\*?\*?(.+?)\*?\*?[：:]\s*(.+)/g
    let fieldMatch
    while ((fieldMatch = fieldRegex.exec(sceneContent)) !== null) {
      fields[fieldMatch[1].trim()] = fieldMatch[2].trim()
    }
    scenes.push({
      num: match[1],
      name: match[2].trim(),
      fields,
    })
  }

  if (scenes.length === 0) return null

  const typeColors = {
    '铺垫': 'bg-blue-50 text-blue-600 border-blue-200',
    '冲突': 'bg-red-50 text-red-600 border-red-200',
    '高潮': 'bg-amber-50 text-amber-600 border-amber-200',
    '转折': 'bg-purple-50 text-purple-600 border-purple-200',
    '收尾': 'bg-green-50 text-green-600 border-green-200',
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-medium text-gray-500 flex items-center gap-1">
        <span className="w-4 h-4 rounded bg-purple-100 flex items-center justify-center text-[10px]">📋</span>
        场景规划（{scenes.length} 个场景）
      </p>
      {scenes.map((scene) => (
        <div key={scene.num} className="bg-white rounded-lg border border-gray-100 p-3 text-xs">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-5 h-5 rounded bg-purple-500 text-white flex items-center justify-center text-[10px] font-bold">{scene.num}</span>
            <span className="font-medium text-gray-800">{scene.name}</span>
            {scene.fields['类型'] && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] border ${typeColors[scene.fields['类型']] || 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                {scene.fields['类型']}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600">
            {scene.fields['地点'] && <div><span className="text-gray-400">地点：</span>{scene.fields['地点']}</div>}
            {scene.fields['人物'] && <div><span className="text-gray-400">人物：</span>{scene.fields['人物']}</div>}
            {scene.fields['核心事件'] && <div className="col-span-2"><span className="text-gray-400">事件：</span>{scene.fields['核心事件']}</div>}
            {scene.fields['情绪走向'] && <div className="col-span-2"><span className="text-gray-400">情绪：</span>{scene.fields['情绪走向']}</div>}
            {scene.fields['暗线'] && <div className="col-span-2 text-gray-400 italic"><span>暗线：</span>{scene.fields['暗线']}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function ChatWorkspace() {
  const { id } = useParams()
  const { currentProject, fetchProject, updateChapter, deleteChapter, chapters, fetchChapters } = useProjectStore()
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
  const [conversationId, setConversationId] = useState(null)
  const [showMemory, setShowMemory] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const chapterScrollRef = useRef(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // 加载项目和对话历史
  useEffect(() => {
    fetchProject(id)
    fetchChapters(id)
    loadOrCreateConversation()
  }, [id])

  const loadOrCreateConversation = async () => {
    try {
      // 获取最近的对话
      const { data: convs } = await conversationApi.list(id)
      if (convs.length > 0) {
        // 加载最近对话的消息
        const convId = convs[0].id
        setConversationId(convId)
        const { data: msgs } = await conversationApi.getMessages(id, convId)
        if (msgs.length > 0) {
          setMessages(msgs.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            type: m.message_type || 'text',
            time: new Date(m.created_at),
            metadata: m.metadata_json || (m.metadata ? JSON.parse(m.metadata) : null),
          })))
        }
      } else {
        // 创建新对话
        const { data: conv } = await conversationApi.create(id)
        setConversationId(conv.id)
      }
    } catch (err) {
      console.error('Failed to load conversation:', err)
    }
  }

  // 欢迎消息
  useEffect(() => {
    if (messages.length === 0 && currentProject) {
      const hasChapters = chapters.length > 0
      if (!hasChapters) {
        // 新项目：详细引导
        setMessages([{
          role: 'assistant',
          content: `你好！我是 **${currentProject.name}** 的 AI 写作助手。\n\n你可以通过对话完成创作的全流程：`,
          type: 'welcome',
          welcomeData: {
            steps: [
              { icon: '📋', title: '生成大纲', desc: 'AI 根据你的设定生成完整故事框架', action: '生成大纲' },
              { icon: '👤', title: '创建角色', desc: '描述角色，AI 自动建立角色档案', action: '创建角色 ' },
              { icon: '🔮', title: '埋伏笔', desc: '告诉 AI 要埋什么伏笔', action: '创建伏笔 ' },
              { icon: '📝', title: '写下一章', desc: 'AI 分析→规划场景→流式生成正文', action: '写下一章' },
            ],
            tip: '直接描述你想做的事，例如「创建角色 李明，25岁，性格内向但内心热血」',
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

    // 检查最近消息是否有写前分析（含"写前分析"和"POV"关键词）
    const hasAnalysis = lastMsg?.role === 'assistant' &&
      lastMsg.content?.includes('写前分析') && lastMsg.content.includes('POV')

    if (hasAnalysis) {
      return [
        { label: '✓ 确认写作', action: '确认写作，开始写正文', primary: true },
        { label: '✏️ 修改分析', action: '我想修改一下...' },
      ]
    }

    // 根据最后一条消息动态调整
    if (lastMsg?.type === 'chapter') {
      return [
        { label: '✨ 润色', action: '润色' },
        { label: '🔄 重写', action: '重写' },
        { label: '📝 写下一章', action: '写下一章', primary: true },
        { label: '👤 创建角色', action: '创建角色 张三，性格...' },
        { label: '🔮 埋伏笔', action: '创建伏笔 ...' },
      ]
    }

    if (hasChapters) {
      return [
        { label: '📝 写下一章', action: '写下一章', primary: true },
        { label: '✨ 润色', action: '润色' },
        { label: '👤 创建角色', action: '创建角色 张三，性格...' },
        { label: '🔮 埋伏笔', action: '创建伏笔 ...' },
        { label: '📅 记录事件', action: '记录事件 在第X章...' },
        { label: '📋 大纲', action: '查看大纲' },
      ]
    }
    return [
      { label: '📋 生成大纲', action: '生成大纲', primary: true },
      { label: '👤 创建角色', action: '创建角色 张三，性格...' },
      { label: '🔮 埋伏笔', action: '创建伏笔 ...' },
      { label: '📝 写第一章', action: '写下一章' },
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

  // Rewind：回退到指定消息，删除之后的所有消息，并撤销对应的操作
  const handleRewind = async (msg) => {
    if (!conversationId || !msg.id) return
    if (!confirm('回退到此处？之后的所有对话和操作都将被撤销。')) return
    try {
      // 找到要删除的消息
      const msgIdx = messages.findIndex(m => m.id === msg.id)
      const messagesToDelete = messages.slice(msgIdx + 1)

      // 撤销这些消息中创建的实体
      const undoResults = []
      for (const m of messagesToDelete) {
        const entities = m.metadata?.created_entities || []
        for (const entity of entities) {
          try {
            if (entity.type === 'character') {
              await storyApi.deleteCharacter(id, entity.id)
              undoResults.push(`撤销角色`)
            } else if (entity.type === 'foreshadowing') {
              await storyApi.deleteForeshadowing(id, entity.id)
              undoResults.push(`撤销伏笔`)
            } else if (entity.type === 'timeline') {
              await storyApi.deleteTimelineEvent(id, entity.id)
              undoResults.push(`撤销事件`)
            } else if (entity.type === 'chapter') {
              await deleteChapter(id, entity.id)
              undoResults.push(`撤销章节`)
            }
          } catch {}
        }
      }

      // 删除数据库中的消息
      await conversationApi.rewind(id, conversationId, msg.id)

      // 前端也删除
      setMessages(prev => prev.slice(0, msgIdx + 1))

      if (undoResults.length) {
        toast.success(`已回退并撤销 ${undoResults.length} 项操作`)
      }
    } catch (err) {
      toast.error('回退失败：' + err.message)
    }
  }

  const handleSend = async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading || streaming) return
    setInput('')

    // 保存用户消息到数据库
    let userMsgId = null
    if (conversationId) {
      try {
        const { data } = await conversationApi.addMessage(id, conversationId, { role: 'user', content: msg })
        userMsgId = data.id
      } catch {}
    }
    const userMsg = { id: userMsgId, role: 'user', content: msg, time: new Date() }
    setMessages(prev => [...prev, userMsg])

    setLoading(true)
    try {
      await processUserMessage(msg)
    } catch (err) {
      const errMsg = { role: 'assistant', content: `❌ 出错了：${err.message}` }
      setMessages(prev => [...prev, errMsg])
      if (conversationId) {
        try {
          const { data } = await conversationApi.addMessage(id, conversationId, { role: 'assistant', content: errMsg.content })
          setMessages(prev => prev.map(m => m === errMsg ? { ...m, id: data.id } : m))
        } catch {}
      }
    } finally {
      setLoading(false)
    }
  }

  const processUserMessage = async (msg) => {
    // 所有消息直接交给 AI 处理
    return handleGeneralChat(msg)
  }

  // ── 写下一章 ──
  // 解析后端返回的操作结果（格式：[ACTION:TYPE:id:param1:param2]）
  const parseActionResult = (text) => {
    const createdEntities = []
    const actionRegex = /\[ACTION:(\w+):(.+?)\]/g
    let match
    while ((match = actionRegex.exec(text)) !== null) {
      const actionType = match[1]
      const parts = match[2].split(':')
      const entityId = parseInt(parts[0])
      if (entityId && !isNaN(entityId)) {
        const typeMap = {
          'CHAPTER_CREATED': 'chapter',
          'CHARACTER_CREATED': 'character',
          'FORESHADOWING_CREATED': 'foreshadowing',
          'TIMELINE_CREATED': 'timeline',
        }
        if (typeMap[actionType]) {
          createdEntities.push({ type: typeMap[actionType], id: entityId })
        }
      }
    }
    return createdEntities
  }

  const handleGeneralChat = async (msg) => {
    setStreaming(true)
    setStreamText('')
    try {
      // 发送对话历史给 AI，让它有上下文记忆
      const history = messages.slice(-30).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content?.slice(0, 5000) || '',
      }))
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: parseInt(id), message: msg, history }),
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
      setStreamText('')

      // 解析后端返回的操作结果
      const createdEntities = parseActionResult(fullText)
      // 清除 [ACTION:...] 标签，只保留给用户看的内容
      const displayText = fullText.replace(/\[ACTION:\w+:.+?\]/g, '').trim()

      if (displayText) {
        let aiMsgId = null
        const metadata = createdEntities.length ? { created_entities: createdEntities } : null
        if (conversationId) {
          try {
            const { data } = await conversationApi.addMessage(id, conversationId, {
              role: 'assistant', content: displayText, metadata_json: metadata,
            })
            aiMsgId = data.id
          } catch {}
        }
        setMessages(prev => [...prev, { id: aiMsgId, role: 'assistant', content: displayText }])
      }

      // 检测是否有章节相关操作（ACTION 标签 或 保存成功消息）
      const hasChapterAction = createdEntities.some(e => e.type === 'chapter')
      const hasSaveMessage = displayText.includes('已保存') || displayText.includes('已创建')

      if (hasChapterAction || hasSaveMessage) {
        // 等待后端保存章节内容
        await new Promise(r => setTimeout(r, 2000))
        await fetchChapters(id)

        // 找到最新完成的章节，运行质量检查
        const updatedChapters = useProjectStore.getState().chapters
        const completedChapters = updatedChapters.filter(c => c.status === 'completed' && c.content)
        if (completedChapters.length > 0) {
          const latestCh = completedChapters[completedChapters.length - 1]
          try {
            const { data } = await qualityApi.summary(id, latestCh.id)
            if (data.summary) {
              setMessages(prev => [...prev, { role: 'assistant', content: data.summary }])
              if (conversationId) {
                conversationApi.addMessage(id, conversationId, { role: 'assistant', content: data.summary }).catch(() => {})
              }
            }
          } catch {}
        }
      } else {
        fetchChapters(id)
      }
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
          <div className="flex items-center gap-2">
            <button onClick={() => setShowMemory(!showMemory)}
              className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors">
              🧠 记忆
            </button>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 rounded-full">
              <Sparkles className="w-3 h-3 text-purple-500" />
              <span className="text-xs text-purple-600 font-medium">AI 助手</span>
            </div>
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
                    <div>
                      <div className="text-sm leading-7 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                      {/* 自动渲染场景卡片 */}
                      {msg.role === 'assistant' && msg.content?.includes('场景规划') && (
                        <SceneCards content={msg.content} />
                      )}
                    </div>
                  )}
                </div>
                {/* AI 消息操作栏 */}
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <CopyButton text={msg.content} />
                    {/* 写前分析 → 确认写作按钮 */}
                    {msg.content?.includes('写前分析') && !msg.content.includes('✅ 已保存') && (
                      <button onClick={() => handleSend('确认写作，开始写正文')}
                        className="text-xs text-white bg-green-600 hover:bg-green-700 px-3 py-1 rounded-lg font-medium transition-colors shadow-sm shadow-green-200">
                        ✓ 确认写作
                      </button>
                    )}
                    {msg.id && (
                      <button onClick={() => handleRewind(msg)}
                        className="text-xs text-gray-400 hover:text-amber-600 px-1.5 py-0.5 rounded hover:bg-amber-50 transition-colors"
                        title="回退到此处">
                        ↩ 回退
                      </button>
                    )}
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
                    <div key={ch.id} onClick={() => setSelectedChapter(ch)}
                      className="w-full text-left p-3 rounded-xl hover:bg-gray-50 hover:shadow-sm transition-all group cursor-pointer">
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
                    </div>
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
            <div className="px-3 py-3 border-t border-gray-100">
              <div className="grid grid-cols-2 gap-2">
                <Link to={`/project/${id}/documents`}
                  className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-xl transition-colors border border-gray-100">
                  <BookOpen className="w-3.5 h-3.5" />
                  大纲/文档
                </Link>
                <button onClick={() => setShowExport(true)}
                  className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors border border-gray-100">
                  📥 导出 TXT
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== 导出弹窗 ===== */}
      {showExport && (
        <ExportModal projectId={id} chapters={chapters} onClose={() => setShowExport(false)} />
      )}

      {/* ===== 记忆面板 ===== */}
      {showMemory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">🧠 AI 记忆系统</h2>
              <button onClick={() => setShowMemory(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <MemoryPanel projectId={id} project={currentProject} chapters={chapters} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 导出弹窗组件
function ExportModal({ projectId, chapters, onClose }) {
  const [selected, setSelected] = useState(new Set(chapters.filter(c => c.status === 'completed' && c.content).map(c => c.id)))

  const completed = chapters.filter(c => c.status === 'completed' && c.content)
  const toggleAll = () => {
    if (selected.size === completed.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(completed.map(c => c.id)))
    }
  }

  const handleExport = () => {
    if (selected.size === 0) return
    if (selected.size === completed.length) {
      window.open(`/api/projects/${projectId}/export/txt`, '_blank')
    } else {
      for (const chId of selected) {
        window.open(`/api/projects/${projectId}/export/txt/${chId}`, '_blank')
      }
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">📥 导出为 TXT</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-4 max-h-[50vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-600">选择要导出的章节</span>
            <button onClick={toggleAll} className="text-xs text-purple-600 hover:text-purple-700">
              {selected.size === completed.length ? '取消全选' : '全选'}
            </button>
          </div>
          <div className="space-y-1">
            {completed.map(ch => (
              <label key={ch.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={selected.has(ch.id)}
                  onChange={() => {
                    const next = new Set(selected)
                    next.has(ch.id) ? next.delete(ch.id) : next.add(ch.id)
                    setSelected(next)
                  }}
                  className="w-4 h-4 text-purple-600 rounded" />
                <span className="text-xs text-gray-400 w-6">#{ch.chapter_number}</span>
                <span className="text-sm text-gray-800 flex-1">{ch.title || `第${ch.chapter_number}章`}</span>
                <span className="text-xs text-gray-400">{ch.word_count} 字</span>
              </label>
            ))}
          </div>
          {completed.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">暂无已完成的章节</p>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={handleExport} disabled={selected.size === 0}
            className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-40 text-sm font-medium btn-press">
            导出 {selected.size} 个章节
          </button>
          <button onClick={onClose} className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 text-sm">
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

// 三层记忆面板组件
function MemoryPanel({ projectId, project, chapters }) {
  const [activeLayer, setActiveLayer] = useState('L3')
  const [docs, setDocs] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDocs()
  }, [projectId])

  const loadDocs = async () => {
    setLoading(true)
    try {
      const types = ['outline', 'worldview', 'rules', 'conflict', 'settings', 'dialogue']
      const results = {}
      for (const t of types) {
        try {
          const { data } = await documentApi.get(projectId, t)
          results[t] = data.content || ''
        } catch { results[t] = '' }
      }
      setDocs(results)
    } catch {}
    setLoading(false)
  }

  const docLabels = {
    outline: { label: '大纲', icon: '📋', desc: '故事框架与章节规划' },
    worldview: { label: '世界观', icon: '🌍', desc: '世界设定与规则' },
    rules: { label: '法则', icon: '📏', desc: '不可违背的故事法则' },
    conflict: { label: '冲突设计', icon: '⚔️', desc: '冲突链与张力设计' },
    settings: { label: '设定记录', icon: '📝', desc: '具体设定与细节' },
    dialogue: { label: '角色台词库', icon: '💬', desc: '角色经典台词' },
  }

  const layers = [
    { id: 'L3', label: 'L3 宪法记忆', desc: '世界观/法则/角色 — 最高优先级，不可违背', color: 'red' },
    { id: 'L2', label: 'L2 项目记忆', desc: '大纲/伏笔/时间线/章节 — 项目运行状态', color: 'blue' },
    { id: 'L1', label: 'L1 会话记忆', desc: '当前对话上下文 — AI 的短期记忆', color: 'green' },
  ]

  return (
    <div>
      {/* 层级选择 */}
      <div className="flex gap-2 mb-6">
        {layers.map(l => (
          <button key={l.id} onClick={() => setActiveLayer(l.id)}
            className={`flex-1 p-3 rounded-xl border-2 transition-all text-left ${
              activeLayer === l.id
                ? `border-${l.color}-400 bg-${l.color}-50`
                : 'border-gray-200 hover:border-gray-300'
            }`}>
            <p className="text-sm font-bold text-gray-800">{l.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{l.desc}</p>
          </button>
        ))}
      </div>

      {/* L3 宪法记忆 */}
      {activeLayer === 'L3' && (
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-xs text-red-600 font-medium mb-2">🔴 L3 宪法记忆 — AI 创作时必须遵守的设定</p>
            <p className="text-xs text-gray-500">修改后立即生效，AI 下次创作会自动加载</p>
          </div>
          {/* 必填文档 */}
          <p className="text-xs font-medium text-red-500">必填（AI 创作的核心参考）</p>
          {Object.entries(docLabels).filter(([k]) => ['outline', 'worldview', 'conflict'].includes(k)).map(([key, meta]) => (
            <div key={key} className="border border-red-100 rounded-xl p-4 bg-red-50/30">
              <div className="flex items-center gap-2 mb-2">
                <span>{meta.icon}</span>
                <span className="text-sm font-medium text-gray-800">{meta.label}</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-500 rounded font-medium">必填</span>
                <span className="text-xs text-gray-400">({docs[key]?.length || 0} 字)</span>
              </div>
              <p className="text-xs text-gray-400 mb-2">{meta.desc}</p>
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 max-h-32 overflow-y-auto whitespace-pre-wrap">
                {docs[key] || '暂无内容'}
              </div>
            </div>
          ))}
          {/* 可选文档 */}
          <p className="text-xs font-medium text-gray-500 mt-4">可选（按需添加）</p>
          {Object.entries(docLabels).filter(([k]) => ['rules', 'settings', 'dialogue'].includes(k)).map(([key, meta]) => (
            <div key={key} className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span>{meta.icon}</span>
                <span className="text-sm font-medium text-gray-800">{meta.label}</span>
                <span className="text-xs text-gray-400">({docs[key]?.length || 0} 字)</span>
              </div>
              <p className="text-xs text-gray-400 mb-2">{meta.desc}</p>
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 max-h-32 overflow-y-auto whitespace-pre-wrap">
                {docs[key] || '暂无内容'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* L2 项目记忆 */}
      {activeLayer === 'L2' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-xs text-blue-600 font-medium mb-2">🔵 L2 项目记忆 — 大纲/伏笔/时间线/章节</p>
            <p className="text-xs text-gray-500">AI 写作时会读取这些内容作为上下文</p>
          </div>
          <div className="border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-800 mb-2">📋 大纲</p>
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 max-h-40 overflow-y-auto whitespace-pre-wrap">
              {docs.outline || '暂无大纲'}
            </div>
          </div>
          {project && (
            <div className="grid grid-cols-3 gap-3">
              <div className="border border-gray-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-purple-600">{project.current_chapter_count || 0}</p>
                <p className="text-xs text-gray-400">已完成章节</p>
              </div>
              <div className="border border-gray-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">{chapters?.length || 0}</p>
                <p className="text-xs text-gray-400">章节总数</p>
              </div>
              <div className="border border-gray-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{project.target_chapters || 0}</p>
                <p className="text-xs text-gray-400">目标章节</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* L1 会话记忆 */}
      {activeLayer === 'L1' && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-xs text-green-600 font-medium mb-2">🟢 L1 会话记忆 — 当前对话上下文</p>
            <p className="text-xs text-gray-500">AI 读取最近 30 条对话作为短期记忆</p>
          </div>
          <div className="border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-800 mb-2">对话历史</p>
            <p className="text-xs text-gray-400">最近的对话消息已保存到数据库，AI 每次请求时自动加载最近 30 条作为上下文。</p>
            <p className="text-xs text-gray-400 mt-2">切换页面或刷新后对话不会丢失。</p>
          </div>
        </div>
      )}
    </div>
  )
}
