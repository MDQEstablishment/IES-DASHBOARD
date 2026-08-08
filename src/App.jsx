import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './rbac'
import { ProjectProvider } from './project'
import { BreadcrumbProvider } from './breadcrumbs'
import Shell from './components/Shell'
import Login from './components/Login'
import { Loading, Toaster } from './components/ui'

// 9K(4) — every routed page is split out. They were static imports, so one
// bundle carried the whole platform: opening the dashboard downloaded the
// 709-building map, the spreadsheet reader, the PDF generators and the Arabic
// shaper, none of which that screen uses. Each page now arrives when its route
// is first visited, and the heavy libraries land with the page that needs them.
//
// Shell, Login and ui stay static: the shell is on screen for every route, and
// Login is what an unauthenticated visitor sees first — deferring either would
// only add a round trip to the critical path.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Projects = lazy(() => import('./pages/Projects'))
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'))
const BuildingDetail = lazy(() => import('./pages/BuildingDetail'))
const DailyProgress = lazy(() => import('./pages/DailyProgress'))
const DesignSystem = lazy(() => import('./pages/DesignSystem'))
const Tasks = lazy(() => import('./pages/Tasks'))
const Escalations = lazy(() => import('./pages/Escalations'))
const ManageEsms = lazy(() => import('./pages/ManageEsms'))
const Reports = lazy(() => import('./pages/Reports'))
const Settings = lazy(() => import('./pages/Settings'))

function FullScreen({ children }) {
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>{children}</div>
}

// An archived account keeps a valid session until its token expires, and
// profiles_read is `using (true)`, so the profile still loads. 0145 makes
// auth_role() null for an archived profile, so every query returns nothing —
// without this screen the person would see a working shell full of empty
// pages and no reason why. The database is the fence; this is the explanation.
function Deactivated() {
  const { profile, signOut } = useAuth()
  return (
    <FullScreen>
      <div style={{ maxWidth: 420, textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>This account is deactivated</div>
        <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 18 }}>
          {profile?.full_name ? `${profile.full_name}, your ` : 'Your '}
          access has been withdrawn. Nothing you recorded has been deleted.
          If this is wrong, ask your PMO to restore your account.
        </div>
        <button onClick={signOut} className="ies-hover"
          style={{ padding: '9px 16px', borderRadius: 'var(--radius-s)', border: '1px solid var(--line)',
            background: 'var(--surface-1)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          Sign out
        </button>
      </div>
    </FullScreen>
  )
}

export default function App() {
  const { authLoading, session, profileLoading, profile } = useAuth()

  if (authLoading) return <FullScreen><Loading label="Starting…" /></FullScreen>
  if (!session) return <><Login /><Toaster /></>
  if (profileLoading) return <FullScreen><Loading label="Loading your profile…" /></FullScreen>
  if (profile?.archived) return <><Deactivated /><Toaster /></>

  return (
    <ProjectProvider>
      <BreadcrumbProvider>
        {/* One boundary around the routes: the page chunk is fetched on the
            first visit to its route and cached by the browser thereafter, so
            this fallback is a brief spinner once, not on every navigation. */}
        <Suspense fallback={<FullScreen><Loading /></FullScreen>}>
        <Routes>
          <Route element={<Shell />}>
            {/* dashboard is the landing route; root + legacy /home redirect to it */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/home" element={<Navigate to="/dashboard" replace />} />

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
            <Route path="/esms" element={<Navigate to="/materials" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
        </Suspense>
      </BreadcrumbProvider>
      <Toaster />
    </ProjectProvider>
  )
}
