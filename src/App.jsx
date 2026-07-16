import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './rbac'
import { ProjectProvider } from './project'
import { BreadcrumbProvider } from './breadcrumbs'
import Shell from './components/Shell'
import Login from './components/Login'
import { Loading, Toaster } from './components/ui'

import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import BuildingDetail from './pages/BuildingDetail'
import DailyProgress from './pages/DailyProgress'
import DesignSystem from './pages/DesignSystem'
import Tasks from './pages/Tasks'
import Escalations from './pages/Escalations'
import ManageEsms from './pages/ManageEsms'
import Reports from './pages/Reports'
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
      <BreadcrumbProvider>
        <Routes>
          <Route element={<Shell />}>
            {/* dashboard is the landing route; index grid lives at /home (logo) */}
            <Route path="/" element={<Dashboard />} />
            <Route path="/home" element={<Home />} />

            {/* projects → project → building → install-item : the nested drill-down */}
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/projects/:id/buildings/:bid/daily" element={<DailyProgress />} />
            <Route path="/projects/:id/buildings/:bid/*" element={<BuildingDetail />} />

            <Route path="/tasks" element={<Tasks />} />
            <Route path="/escalations" element={<Escalations />} />
            <Route path="/materials" element={<ManageEsms />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/design-system" element={<DesignSystem />} />

            {/* legacy flat paths → nearest nested equivalent (deep links keep working) */}
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="/esms" element={<Navigate to="/materials" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BreadcrumbProvider>
      <Toaster />
    </ProjectProvider>
  )
}
