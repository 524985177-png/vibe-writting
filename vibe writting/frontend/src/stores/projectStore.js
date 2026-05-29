import { create } from 'zustand'
import { projectApi, chapterApi } from '../api/client'

export const useProjectStore = create((set, get) => ({
  projects: [],
  currentProject: null,
  chapters: [],
  currentChapter: null,
  loading: false,

  fetchProjects: async () => {
    set({ loading: true })
    try {
      const { data } = await projectApi.list()
      set({ projects: data.projects, loading: false })
    } catch (err) {
      console.error('Failed to fetch projects:', err)
      set({ loading: false })
    }
  },

  fetchProject: async (id) => {
    set({ loading: true })
    try {
      const { data } = await projectApi.get(id)
      set({ currentProject: data, loading: false })
    } catch (err) {
      console.error('Failed to fetch project:', err)
      set({ loading: false })
    }
  },

  createProject: async (projectData) => {
    try {
      const { data } = await projectApi.create(projectData)
      set((state) => ({ projects: [data, ...state.projects] }))
      return data
    } catch (err) {
      console.error('Failed to create project:', err)
      throw err
    }
  },

  deleteProject: async (id) => {
    try {
      await projectApi.delete(id)
      set((state) => ({ projects: state.projects.filter((p) => p.id !== id) }))
    } catch (err) {
      console.error('Failed to delete project:', err)
      throw err
    }
  },

  fetchChapters: async (projectId) => {
    try {
      const { data } = await chapterApi.list(projectId)
      set({ chapters: data.chapters })
    } catch (err) {
      console.error('Failed to fetch chapters:', err)
    }
  },

  createChapter: async (projectId, chapterData) => {
    try {
      const { data } = await chapterApi.create(projectId, chapterData)
      set((state) => ({ chapters: [...state.chapters, data] }))
      return data
    } catch (err) {
      console.error('Failed to create chapter:', err)
      throw err
    }
  },

  updateChapter: async (projectId, chapterId, chapterData) => {
    try {
      const { data } = await chapterApi.update(projectId, chapterId, chapterData)
      set((state) => ({
        chapters: state.chapters.map((ch) => (ch.id === chapterId ? data : ch)),
        currentChapter: state.currentChapter?.id === chapterId ? data : state.currentChapter,
      }))
      return data
    } catch (err) {
      console.error('Failed to update chapter:', err)
      throw err
    }
  },

  deleteChapter: async (projectId, chapterId) => {
    try {
      await chapterApi.delete(projectId, chapterId)
      set((state) => ({
        chapters: state.chapters.filter((ch) => ch.id !== chapterId),
        currentChapter: state.currentChapter?.id === chapterId ? null : state.currentChapter,
      }))
    } catch (err) {
      console.error('Failed to delete chapter:', err)
      throw err
    }
  },

  setCurrentChapter: (chapter) => set({ currentChapter: chapter }),
}))
