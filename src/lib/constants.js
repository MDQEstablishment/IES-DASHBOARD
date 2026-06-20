// Role roster, nav, retrofit stages, status maps. The 9 roles + emails mirror the
// Phase 2 seed exactly (auth.users <-> profiles). Names are display fallbacks; the
// live name/color comes from the profiles row once signed in.

export const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || 'IESdemo2026!'
export const DEMO_DOMAIN = '@ies.demo.local'

// role code -> { email, name, title, gradient }
export const ROSTER = {
  ceo:   { email: 'ahmed.hussam' + DEMO_DOMAIN,    name: 'Ahmed Hussam',     title: 'Chief Executive',       gradient: 'linear-gradient(135deg,#FCD34D,#F59E0B)' },
  pmo:   { email: 'omar.zaki' + DEMO_DOMAIN,        name: 'Omar Zaki',        title: 'PMO Director',          gradient: 'linear-gradient(135deg,#93C5FD,#3B82F6)' },
  progm: { email: 'jehad' + DEMO_DOMAIN,            name: 'Jehad',            title: 'Programme Manager',     gradient: 'linear-gradient(135deg,#67E8F9,#0891B2)' },
  projm: { email: 'majed.alqahtani' + DEMO_DOMAIN,  name: 'Majed Al-Qahtani', title: 'Project Manager',       gradient: 'linear-gradient(135deg,#86EFAC,#10B981)' },
  proje: { email: 'yousef.almaliki' + DEMO_DOMAIN,  name: 'Yousef Al-Maliki', title: 'Project Engineer',      gradient: 'linear-gradient(135deg,#FDE68A,#F59E0B)' },
  procm: { email: 'adnan' + DEMO_DOMAIN,            name: 'Adnan',            title: 'Procurement Manager',   gradient: 'linear-gradient(135deg,#FCA5A5,#EF4444)' },
  proco: { email: 'shakkel' + DEMO_DOMAIN,          name: 'Shakkel',          title: 'Procurement Officer',   gradient: 'linear-gradient(135deg,#FDA4AF,#F43F5E)' },
  plane: { email: 'ali' + DEMO_DOMAIN,              name: 'Ali',              title: 'Planning Engineer',     gradient: 'linear-gradient(135deg,#C7D2FE,#6366F1)' },
  admin: { email: 'admin' + DEMO_DOMAIN,            name: 'System Admin',     title: 'Administrator',         gradient: 'linear-gradient(135deg,#E2E8F0,#94A3B8)' },
}
// Login tile order (seniority).
export const ROLE_ORDER = ['ceo','pmo','progm','projm','proje','procm','proco','plane','admin']

export const roleTitle = (r) => ROSTER[r]?.title || r
export const roleGradient = (r) => ROSTER[r]?.gradient || 'linear-gradient(135deg,#E2E8F0,#94A3B8)'

// permission groups (mirror the RLS write scopes)
export const MANAGERS = ['projm','progm','pmo','ceo']
export const PROCUREMENT = ['procm','proco']
export const PMO_ADMIN = ['pmo','admin']
export const CAN_INSTALL = ['proje','projm','progm','pmo','ceo']
export const CAN_RAISE_TASK = ['proje','projm','progm','pmo','ceo','procm','proco']
export const CAN_MOVE_MATERIAL = ['procm','proco','projm','progm','pmo','ceo']
export const CAN_QA = ['projm','progm','pmo']

// nav (top-level routes). Project Detail is a nested route off Projects.
export const NAV = [
  { to: '/',           label: 'Daily Progress', icon: 'ClipboardList', cap: 'Field' },
  { to: '/dashboard',  label: 'Dashboard',      icon: 'LayoutDashboard', cap: 'Programme' },
  { to: '/projects',   label: 'Projects',       icon: 'Layers' },
  { to: '/buildings',  label: 'Buildings',      icon: 'Building2' },
  { to: '/install-log',label: 'Install Log',    icon: 'ListChecks' },
  { to: '/tasks',      label: 'Tasks',          icon: 'CheckSquare', cap: 'My queues' },
  { to: '/escalations',label: 'Escalations',    icon: 'Flag' },
  { to: '/documents',  label: 'Documents',      icon: 'FileText', cap: 'Admin' },
  { to: '/esms',       label: 'Manage ESMs',    icon: 'Boxes' },
  { to: '/settings',   label: 'Settings',       icon: 'Settings' },
]

// 12-stage retrofit cycle (from the design spec)
export const STAGES = [
  'Site Survey', 'Client Approval', 'Material Submittal', 'Method Statement',
  'Mock-up', 'Material Delivery', 'Installation', 'MIR',
  'WIR', 'Client Sign-off', 'COC', 'Final Payment',
]

// document kinds (enum) -> short label
export const DOC_KIND = {
  material_submittal: 'MS', method_statement: 'MOS', mock_up: 'MOCK',
  mir: 'MIR', wir: 'WIR', coc: 'COC', other: 'DOC',
}
export const DOC_KIND_FULL = {
  material_submittal: 'Material Submittal', method_statement: 'Method Statement', mock_up: 'Mock-up',
  mir: 'Material Inspection', wir: 'Work Inspection', coc: 'Completion Cert.', other: 'Other',
}

// status -> pill class
export const PILL = {
  // generic
  active: 'pill-green', draft: 'pill-gold', on_hold: 'pill-gold', closed: 'pill-gray',
  // building
  signed: 'pill-green', in_progress: 'pill-blue', pending: 'pill-gray',
  // install qa
  approved: 'pill-green', pending_qa: 'pill-gold', rejected: 'pill-red',
  // task
  open: 'pill-gray', blocked: 'pill-red', done: 'pill-green', cancelled: 'pill-gray',
  // escalation
  acknowledged: 'pill-blue', resolved: 'pill-green',
  // severity
  low: 'pill-gray', medium: 'pill-blue', high: 'pill-gold', critical: 'pill-red',
  // doc text status
  'Approved': 'pill-green', 'In Review': 'pill-gold', 'Rejected': 'pill-red',
  'Draft': 'pill-gray', 'Missing': 'pill-gray', 'Not yet': 'pill-gray',
}
export const pillClass = (s) => PILL[s] || 'pill-gray'
export const labelize = (s) => (s == null ? '—' : String(s).replace(/_/g, ' '))
