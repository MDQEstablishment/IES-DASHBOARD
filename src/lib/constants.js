// Roster, role metadata, top-nav, retrofit stages, status maps. The 9 roles +
// emails mirror the Phase 2 seed; colors + labels mirror the v1.5 design (people{}).

export const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || 'IESdemo2026!'
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
  ceo: '#0F766E', pmo: '#2563EB', procm: '#7C3AED', proco: '#9333EA', progm: '#0891B2',
  projm: '#D97706', proje: '#CA8A04', plane: '#DB2777', admin: '#475569',
}
export const ROLE_FULL = {
  ceo: 'CEO', pmo: 'PMO', procm: 'Procurement Manager', proco: 'Procurement Officer',
  progm: 'Program Manager', projm: 'Project Manager', proje: 'Project Engineer',
  plane: 'Planning Engineer', admin: 'Admin',
}
export const roleColor = (r) => ROLE_COLOR[r] || '#475569'
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
  active: ['#10B981', '#ECFDF5', 'Active'], draft: ['#64748B', '#F1F5F9', 'Draft'],
  on_hold: ['#F59E0B', '#FFFBEB', 'On-Hold'], closed: ['#475569', '#F1F5F9', 'Closed'],
  signed: ['#10B981', '#ECFDF5', 'Signed'], in_progress: ['#2563EB', '#EFF6FF', 'In Progress'],
  pending: ['#64748B', '#F1F5F9', 'Pending'],
  approved: ['#10B981', '#ECFDF5', 'Approved'], pending_qa: ['#F59E0B', '#FFFBEB', 'Pending QA'],
  rejected: ['#EF4444', '#FEF2F2', 'Rejected'],
  open: ['#64748B', '#F1F5F9', 'Open'], blocked: ['#EF4444', '#FEF2F2', 'Blocked'],
  done: ['#10B981', '#ECFDF5', 'Done'], cancelled: ['#475569', '#F1F5F9', 'Cancelled'],
  acknowledged: ['#2563EB', '#EFF6FF', 'Acknowledged'], resolved: ['#10B981', '#ECFDF5', 'Resolved'],
  low: ['#64748B', '#F1F5F9', 'Low'], medium: ['#2563EB', '#EFF6FF', 'Medium'],
  high: ['#F59E0B', '#FFFBEB', 'High'], critical: ['#EF4444', '#FEF2F2', 'Critical'],
  Approved: ['#10B981', '#ECFDF5', 'Approved'], 'In Review': ['#F59E0B', '#FFFBEB', 'In Review'],
  Missing: ['#64748B', '#F1F5F9', 'Missing'], Draft: ['#64748B', '#F1F5F9', 'Draft'],
}
export const statusMeta = (s) => STATUS[s] || ['#64748B', '#F1F5F9', String(s ?? '—').replace(/_/g, ' ')]
export const labelize = (s) => (s == null ? '—' : String(s).replace(/_/g, ' '))
