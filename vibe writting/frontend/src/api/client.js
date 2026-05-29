import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 120000, // 2 分钟，AI 生成需要较长时间
})

// 项目 API
export const projectApi = {
  list: () => api.get('/projects'),
  get: (id) => api.get(`/projects/${id}`),
  create: (data) => api.post('/projects', data),
  update: (id, data) => api.put(`/projects/${id}`, data),
  delete: (id) => api.delete(`/projects/${id}`),
}

// 章节 API
export const chapterApi = {
  list: (projectId) => api.get(`/projects/${projectId}/chapters`),
  get: (projectId, id) => api.get(`/projects/${projectId}/chapters/${id}`),
  create: (projectId, data) => api.post(`/projects/${projectId}/chapters`, data),
  update: (projectId, id, data) => api.put(`/projects/${projectId}/chapters/${id}`, data),
  delete: (projectId, id) => api.delete(`/projects/${projectId}/chapters/${id}`),
}

// 模型配置 API
export const modelApi = {
  listProviders: () => api.get('/ai/providers'),
  createProvider: (data) => api.post('/ai/providers', data),
  updateProvider: (id, data) => api.put(`/ai/providers/${id}`, data),
  deleteProvider: (id) => api.delete(`/ai/providers/${id}`),
  setActiveModel: (data) => api.post('/ai/active-model', data),
  getActiveModel: () => api.get('/ai/active-model'),
  testConnection: (providerId) => api.post('/ai/test-connection', null, { params: { provider_id: providerId } }),
}

// AI API
export const aiApi = {
  generateOutline: (data) => api.post('/ai/generate-outline', data),
  analyze: (chapterId) => api.post(`/ai/analyze/${chapterId}`),
  planScenes: (chapterId) => api.post(`/ai/plan-scenes/${chapterId}`),
  polish: (text, instruction) => api.post('/ai/polish', null, { params: { text, instruction } }),
  rewrite: (text, instruction) => api.post('/ai/rewrite', null, { params: { text, instruction } }),
  expand: (text, instruction) => api.post('/ai/expand', null, { params: { text, instruction } }),
}

// 文档 API
export const documentApi = {
  list: (projectId) => api.get(`/projects/${projectId}/documents`),
  get: (projectId, docType) => api.get(`/projects/${projectId}/documents/${docType}`),
  update: (projectId, docType, data) => api.put(`/projects/${projectId}/documents/${docType}`, data),
}

// 流式写入
export async function writeChapterStream(chapterId, scenePlan, onChunk, onDone) {
  const params = scenePlan ? { scene_plan: JSON.stringify(scenePlan) } : {}
  const response = await fetch(`/api/ai/write-stream/${chapterId}?${new URLSearchParams(params)}`, {
    method: 'POST',
  })

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const text = decoder.decode(value)
    const lines = text.split('\n')

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          if (data.done) {
            onDone?.(data)
          } else if (data.content) {
            onChunk?.(data.content)
          }
        } catch {}
      }
    }
  }
}

export default api
