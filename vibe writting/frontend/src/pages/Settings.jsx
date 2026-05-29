import { useState, useEffect } from 'react'
import { Plus, Trash2, Check, X, Globe, Server, Cpu, Pencil } from 'lucide-react'
import { modelApi } from '../api/client'

// 预设供应商模板
const PRESETS = [
  {
    id: 'openai', name: 'OpenAI', provider_type: 'openai',
    base_url: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-preview'],
  },
  {
    id: 'anthropic', name: 'Anthropic', provider_type: 'anthropic',
    base_url: '',
    models: ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-8'],
  },
  {
    id: 'deepseek', name: 'DeepSeek', provider_type: 'openai',
    base_url: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'zhipu', name: '智谱 (GLM)', provider_type: 'openai',
    base_url: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-plus', 'glm-4-flash', 'glm-4-long'],
  },
  {
    id: 'moonshot', name: 'Moonshot (Kimi)', provider_type: 'openai',
    base_url: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'],
  },
  {
    id: 'ollama', name: 'Ollama (本地)', provider_type: 'openai',
    base_url: 'http://localhost:11434/v1',
    models: ['qwen2.5:14b', 'llama3.1:8b', 'deepseek-r1:14b'],
  },
]

export default function Settings() {
  const [providers, setProviders] = useState([])
  const [activeModel, setActiveModel] = useState({ provider_id: '', model: '', configured: false })
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ id: '', name: '', base_url: '', api_key: '', provider_type: 'openai', models: '' })
  const [testing, setTesting] = useState(null)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const [providersRes, activeRes] = await Promise.all([
        modelApi.listProviders(),
        modelApi.getActiveModel(),
      ])
      setProviders(providersRes.data)
      setActiveModel(activeRes.data)
    } catch (err) {
      console.error('Failed to load model config:', err)
    }
  }

  const handleAddPreset = (preset) => {
    setForm({
      id: preset.id,
      name: preset.name,
      base_url: preset.base_url,
      api_key: '',
      provider_type: preset.provider_type,
      models: preset.models.join(', '),
    })
    setShowAdd(true)
  }

  const handleAddCustom = () => {
    setForm({ id: '', name: '', base_url: '', api_key: '', provider_type: 'openai', models: '' })
    setEditingId(null)
    setShowAdd(true)
  }

  const handleEdit = (provider) => {
    setForm({
      id: provider.id,
      name: provider.name,
      base_url: provider.base_url,
      api_key: '',
      provider_type: provider.provider_type,
      models: provider.models.join(', '),
    })
    setEditingId(provider.id)
    setShowAdd(true)
  }

  const handleSave = async () => {
    const models = form.models.split(',').map(m => m.trim()).filter(Boolean)
    const data = {
      id: form.id || `custom-${Date.now()}`,
      name: form.name,
      base_url: form.base_url,
      api_key: form.api_key,
      provider_type: form.provider_type,
      models,
    }

    try {
      if (editingId) {
        await modelApi.updateProvider(editingId, { ...data, id: undefined })
      } else {
        await modelApi.createProvider(data)
      }
      setShowAdd(false)
      loadData()
    } catch (err) {
      alert(err.response?.data?.detail || '保存失败')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('确定删除此供应商？')) return
    await modelApi.deleteProvider(id)
    loadData()
  }

  const handleSetActive = async (providerId, model) => {
    await modelApi.setActiveModel({ provider_id: providerId, model })
    loadData()
  }

  const handleTest = async (providerId) => {
    setTesting(providerId)
    setTestResult(null)
    try {
      const { data } = await modelApi.testConnection(providerId)
      setTestResult({ id: providerId, ...data })
    } catch (err) {
      setTestResult({ id: providerId, success: false, message: '测试失败' })
    }
    setTesting(null)
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">模型设置</h1>

      {/* 当前激活的模型 */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl border border-purple-200 p-5 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Cpu className="w-5 h-5 text-purple-600" />
          <span className="font-bold text-gray-800">当前模型</span>
        </div>
        {activeModel.configured ? (
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
              {activeModel.provider_name} / {activeModel.model}
            </span>
            <span className="flex items-center gap-1 text-sm text-green-600">
              <Check className="w-4 h-4" /> 已就绪
            </span>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">尚未配置模型，请添加供应商并选择模型</p>
        )}
      </div>

      {/* 快速添加预设 */}
      <div className="mb-6">
        <h2 className="font-bold text-gray-800 mb-3">快速添加</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handleAddPreset(preset)}
              className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 text-left text-sm"
            >
              <Globe className="w-4 h-4 text-gray-400" />
              <span>{preset.name}</span>
            </button>
          ))}
          <button
            onClick={handleAddCustom}
            className="flex items-center gap-2 p-3 border border-dashed border-gray-300 rounded-lg hover:border-purple-300 hover:bg-purple-50 text-sm text-gray-500"
          >
            <Plus className="w-4 h-4" />
            <span>自定义供应商</span>
          </button>
        </div>
      </div>

      {/* 已添加的供应商 */}
      <div className="mb-6">
        <h2 className="font-bold text-gray-800 mb-3">已配置的供应商</h2>
        {providers.length === 0 ? (
          <p className="text-gray-400 text-sm py-4">暂无供应商，请添加</p>
        ) : (
          <div className="space-y-3">
            {providers.map((p) => (
              <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-800">{p.name}</span>
                    <span className="text-xs text-gray-400">({p.provider_type})</span>
                    {activeModel.provider_id === p.id && (
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">当前</span>
                    )}
                    {p.has_key ? (
                      <span className="flex items-center gap-0.5 text-xs text-green-600"><Check className="w-3 h-3" /> Key</span>
                    ) : (
                      <span className="flex items-center gap-0.5 text-xs text-red-500"><X className="w-3 h-3" /> 无 Key</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTest(p.id)}
                      disabled={testing === p.id}
                      className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded"
                    >
                      {testing === p.id ? '测试中...' : '测试'}
                    </button>
                    <button onClick={() => handleEdit(p)} className="text-xs px-2 py-1 text-gray-500 hover:bg-gray-100 rounded">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {p.base_url && <p className="text-xs text-gray-400 mb-2">{p.base_url}</p>}
                {testResult?.id === p.id && (
                  <div className={`text-xs mt-2 p-2 rounded ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {testResult.message}
                  </div>
                )}
                <div className="flex flex-wrap gap-1 mt-2">
                  {p.models.map((model) => (
                    <button
                      key={model}
                      onClick={() => handleSetActive(p.id, model)}
                      className={`px-2 py-1 text-xs rounded border ${
                        activeModel.provider_id === p.id && activeModel.model === model
                          ? 'bg-purple-100 border-purple-300 text-purple-700'
                          : 'border-gray-200 text-gray-600 hover:border-purple-200 hover:bg-purple-50'
                      }`}
                    >
                      {model}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 添加/编辑表单 */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">{editingId ? '编辑供应商' : '添加供应商'}</h2>
            </div>
            <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
              <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">供应商 ID</label>
                <input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                  placeholder="openai / anthropic / my-proxy" disabled={!!editingId} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">显示名称</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                  placeholder="OpenAI / 自定义服务" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API 类型</label>
                <select value={form.provider_type} onChange={(e) => setForm({ ...form, provider_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500">
                  <option value="openai">OpenAI 兼容 (OpenAI/DeepSeek/Ollama等)</option>
                  <option value="anthropic">Anthropic 原生</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
                <input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                  placeholder="https://api.openai.com/v1（Anthropic 可留空）" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Key {editingId && <span className="text-gray-400 font-normal">（留空表示不修改）</span>}
                </label>
                <input type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                  placeholder={editingId ? "留空则保持原 Key" : "sk-..."} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">可用模型（逗号分隔）</label>
                <input value={form.models} onChange={(e) => setForm({ ...form, models: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                  placeholder="gpt-4o, gpt-4o-mini" />
              </div>
            </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={handleSave}
                className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 text-sm font-medium transition-all btn-press">
                保存
              </button>
              <button onClick={() => setShowAdd(false)}
                className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 text-sm transition-colors">
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
