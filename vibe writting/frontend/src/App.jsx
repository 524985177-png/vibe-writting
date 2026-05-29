import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ProjectList from './pages/ProjectList'
import ProjectDashboard from './pages/ProjectDashboard'
import ChatWorkspace from './pages/ChatWorkspace'
import WritingWorkspace from './pages/WritingWorkspace'
import DocumentManager from './pages/DocumentManager'
import Settings from './pages/Settings'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<ProjectList />} />
        <Route path="project/:id" element={<ProjectDashboard />} />
        <Route path="project/:id/chat" element={<ChatWorkspace />} />
        <Route path="project/:id/write" element={<WritingWorkspace />} />
        <Route path="project/:id/write/:chapterId" element={<WritingWorkspace />} />
        <Route path="project/:id/documents" element={<DocumentManager />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
