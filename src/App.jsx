import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './rbac'
import { ProjectProvider } from './project'
import Shell from './components/Shell'
import Login from './components/Login'
import { Loading, Toaster } from './components/ui'

import DailyProgress from './pages/DailyProgress'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Buildings from './pages/Buildings'
import InstallLog from './pages/InstallLog'
import Tasks from './pages/Tasks'
import Escalations from './pages/Escalations'
import Documents from './pages/Documents'
import ManageEsms from './pages/ManageEsms'
import Settings from './pages/Settings'

function FullScreen({ children }) {
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>{children}</div>
}

export default function App() {
  const { authLoading, session, profileLoading } = useAuth()

  if (authLoading) return <FullScreen><Loading label="Starting…" /></FullScreen>
  if (!session) return <><Login /><Toaster /></>
  if (profileLoading) return <FullScreen><Loading label="Loading your profile…" /></FullScreen>

  return (
    <ProjectProvider>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<DailyProgress />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/buildings" element={<Buildings />} />
          <Route path="/install-log" element={<InstallLog />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/escalations" element={<Escalations />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/esms" element={<ManageEsms />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster />
    </ProjectProvider>
  )
}
