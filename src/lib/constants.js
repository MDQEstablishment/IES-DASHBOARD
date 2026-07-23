// Roster, role metadata, top-nav, retrofit stages, status maps. The 9 roles +
// emails mirror the Phase 2 seed; colors + labels mirror the v1.5 design (people{}).

// Demo affordances (role cards on the login screen + the in-app role switcher)
// only exist in dev builds, or when a deploy explicitly opts in with
// VITE_DEMO_MODE=true. The shared demo password comes ONLY from env — no
// committed fallback (the platform now holds real programme data).
export const DEMO_MODE = import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true'
export const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || ''
export const DEMO_DOMAIN = '@ies.demo.local'

// role -> email (Phase 2 auth.users) + display name fallback
export const ROSTER = {
  ceo:   { email: 'ahmed.hussam' + DEMO_DOMAIN,    name: 'Ahmed Hussam' },
  pmo:   { email: 'omar.zaki' + DEMO_DOMAIN,        name: 'Omar Zaki' },
  procm: { email: 'adnan' + DEMO_DOMAIN,            name: 'Adnan' },
  proco: { email: 'shakkel' + DEMO_DOMAIN,          name: 'Shakkel' },
  progm: { email: 'jehad' + DEMO_DOMAIN,            name: 'Jehad' },
  projm: { email: 'majed.alqahtani' + DEMO_DOMAIN,  name: 'Majed Al-Qahtani' },
  proje: { email: 'yousef.almaliki' + DEMO_DOMAIN,  name: 'Yousef Al-Maliki' },
  plane: { email: 'ali' + DEMO_DOMAIN,              name: 'Ali' },
  admin: { email: 'admin' + DEMO_DOMAIN,            name: 'System Admin' },
}

// solid role colors — identical to the design's people{} colors (and our DB profiles)
export const ROLE_COLOR = {
  ceo: '#0F766E', pmo: '#A0762B', procm: '#6D5A8E', proco: '#9333EA', progm: '#0891B2',
  projm: '#B45309', proje: '#B45309', plane: '#DB2777', admin: '#56534B',
}
export const ROLE_FULL = {
  ceo: 'CEO', pmo: 'PMO', procm: 'Procurement Manager', proco: 'Procurement Officer',
  progm: 'Program Manager', projm: 'Project Manager', proje: 'Project Engineer',
  plane: 'Planning Engineer', admin: 'Admin',
}
export const roleColor = (r) => ROLE_COLOR[r] || '#56534B'
export const roleTitle = (r) => ROLE_FULL[r] || r

// switch-role menu order (design uses Object.keys(people) order)
export const ROLE_ORDER = ['ceo', 'pmo', 'procm', 'proco', 'progm', 'projm', 'proje', 'plane', 'admin']

// login demo-role cards (design has 8 — admin excluded). [key, short, desc]
export const ROLE_CARDS = [
  ['ceo', 'CEO', 'Portfolio-wide read access, no settings'],
  ['pmo', 'PMO', 'Full control across the programme'],
  ['procm', 'Procurement Mgr', 'Materials & procurement, team tasks'],
  ['proco', 'Procurement Officer', 'Own procurement tasks only'],
  ['progm', 'Program Mgr', 'All projects, scheduling & delivery'],
  ['projm', 'Project Mgr', 'Own project end-to-end'],
  ['proje', 'Project Eng', 'Own project, field execution'],
  ['plane', 'Planning Eng', 'Schedule, progress & delay analysis'],
]

// permission groups (mirror the RLS write scopes)
export const MANAGERS = ['projm', 'progm', 'pmo', 'ceo']
export const PROCUREMENT = ['procm', 'proco']
export const PMO_ADMIN = ['pmo', 'admin']
export const CAN_INSTALL = ['proje', 'projm', 'progm', 'pmo', 'ceo']
export const CAN_RAISE_TASK = ['proje', 'projm', 'progm', 'pmo', 'ceo', 'procm', 'proco']
export const CAN_MOVE_MATERIAL = ['procm', 'proco', 'projm', 'progm', 'pmo', 'ceo']
export const CAN_QA = ['projm', 'progm', 'pmo']

// top-nav (owner's 11 routes, dc icon names; Project/Building detail are drill-ins)
export const NAV = [
  { to: '/', label: 'Daily Progress', icon: 'daily' },
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/projects', label: 'Projects', icon: 'projects' },
  { to: '/buildings', label: 'Buildings', icon: 'buildings' },
  { to: '/install-log', label: 'Install Log', icon: 'reports' },
  { to: '/tasks', label: 'Tasks', icon: 'tasks' },
  { to: '/escalations', label: 'Escalations', icon: 'escalation' },
  { to: '/documents', label: 'Documents', icon: 'doc' },
  { to: '/esms', label: 'Materials', icon: 'materials' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

// 12-stage retrofit cycle
export const STAGES = [
  'Site Survey', 'Client Approval', 'Material Submittal', 'Method Statement',
  'Mock-up', 'Material Delivery', 'Installation', 'MIR',
  'WIR', 'Client Sign-off', 'COC', 'Final Payment',
]

export const DOC_KIND = {
  material_submittal: 'MS', method_statement: 'MOS', mock_up: 'MOCK',
  mir: 'MIR', wir: 'WIR', coc: 'COC', other: 'DOC',
}
export const DOC_KIND_FULL = {
  material_submittal: 'Material Submittal', method_statement: 'Method Statement', mock_up: 'Mock-up',
  mir: 'Material Inspection', wir: 'Work Inspection', coc: 'Completion Cert.', other: 'Other',
}

// status -> {color, bg, label} chip metadata (design statusMeta style)
export const STATUS = {
  active: ['#217A54', '#E9F3EE', 'Active'], draft: ['#8A8577', '#F0EDE4', 'Draft'],
  on_hold: ['#B45309', '#FAF3E3', 'On-Hold'], closed: ['#56534B', '#F0EDE4', 'Closed'],
  signed: ['#217A54', '#E9F3EE', 'Signed'], in_progress: ['#A0762B', '#F5EEDF', 'In Progress'],
  pending: ['#8A8577', '#F0EDE4', 'Pending'],
  approved: ['#217A54', '#E9F3EE', 'Approved'], pending_qa: ['#B45309', '#FAF3E3', 'Pending QA'],
  rejected: ['#B3362B', '#F9ECEA', 'Rejected'],
  open: ['#8A8577', '#F0EDE4', 'Open'], blocked: ['#B3362B', '#F9ECEA', 'Blocked'],
  done: ['#217A54', '#E9F3EE', 'Done'], cancelled: ['#56534B', '#F0EDE4', 'Cancelled'],
  acknowledged: ['#A0762B', '#F5EEDF', 'Acknowledged'], resolved: ['#217A54', '#E9F3EE', 'Resolved'],
  delivered: ['#217A54', '#E9F3EE', 'Delivered'], scheduled: ['#B45309', '#FAF3E3', 'Scheduled'],
  awaiting: ['#B45309', '#FAF3E3', 'Awaiting'], in_progress_b: ['#A0762B', '#F5EEDF', 'In Progress'],
  low: ['#8A8577', '#F0EDE4', 'Low'], medium: ['#A0762B', '#F5EEDF', 'Medium'],
  high: ['#B45309', '#FAF3E3', 'High'], critical: ['#B3362B', '#F9ECEA', 'Critical'],
  Approved: ['#217A54', '#E9F3EE', 'Approved'], 'In Review': ['#B45309', '#FAF3E3', 'In Review'],
  Missing: ['#8A8577', '#F0EDE4', 'Missing'], Draft: ['#8A8577', '#F0EDE4', 'Draft'],
}
export const statusMeta = (s) => STATUS[s] || ['#8A8577', '#F0EDE4', String(s ?? '—').replace(/_/g, ' ')]
export const labelize = (s) => (s == null ? '—' : String(s).replace(/_/g, ' '))

// 9B — retrofit lifecycle phase (survey -> saving_sheet -> monitoring -> closeout)
export const PROJECT_PHASE_ORDER = ['survey', 'saving_sheet', 'monitoring', 'closeout']
export const PROJECT_PHASE_META = {
  survey: { label: 'Survey', color: '#A0762B', bg: '#F5EEDF' },
  saving_sheet: { label: 'Saving Sheet', color: '#B45309', bg: '#FAF3E3' },
  monitoring: { label: 'Monitoring', color: '#217A54', bg: '#E9F3EE' },
  closeout: { label: 'Close-out', color: '#3B6C8F', bg: '#EAF1F6' },
}
// Survey capture roles (client gate; RLS w_bld/w_proj is the real enforcement)
export const CAN_SURVEY = ['proje', 'projm', 'progm', 'pmo', 'admin']
export const SURVEY_CATEGORIES = [['lighting', 'Lighting'], ['ac', 'AC'], ['sensor', 'Sensor'], ['other', 'Other']]

// 9C — building scope lifecycle (candidate -> in_scope | surplus).
// "Surveyed" is always DERIVED from survey entries, never stored here.
export const SCOPE_STATUS_META = {
  candidate: { label: 'Candidate', color: '#8A8577', bg: '#F0EDE4' },
  in_scope: { label: 'In scope', color: '#1D6A49', bg: '#E9F3EE' },
  surplus: { label: 'Surplus', color: '#B45309', bg: '#FAF3E3' },
}
