// RBAC-driven navigation + nested breadcrumb derivation.
//
// The navigation is built from `roleNav` below, NOT a flat hard-coded list, so
// what a person can reach follows from their role in one place. Building detail,
// its install-log item view and Daily Progress are DRILL-INS reached by nesting;
// they are never navigation entries.
//
// 9K(5): this header used to say "the TOP-nav", and pointed at line numbers in
// a .dc.html prototype that is not in this repository. Sprint 9J replaced the
// top bar with the left sidebar, so the description named a component that no
// longer exists — and the line references were unverifiable either way. The
// contract itself is unchanged; only the description of it was wrong.

// role -> ordered list of nav ids
export const ROLE_NAV = {
  // ceo is PMO-equivalent (owner ruling 2026-08-08, migration 0147), so it
  // carries pmo's nav including Settings. Authority equivalent, seniority not:
  // role_rank keeps ceo above pmo so a pmo still cannot edit a ceo.
  ceo:   ['dashboard', 'projects', 'materials', 'tasks', 'escalation', 'reports', 'settings'],
  pmo:   ['dashboard', 'projects', 'materials', 'tasks', 'escalation', 'reports', 'settings'],
  procm: ['dashboard', 'projects', 'materials', 'tasks', 'escalation'],
  proco: ['dashboard', 'projects', 'materials', 'tasks', 'escalation'],
  progm: ['dashboard', 'projects', 'materials', 'tasks', 'escalation', 'reports'],
  projm: ['dashboard', 'projects', 'materials', 'tasks', 'escalation', 'reports'],
  proje: ['dashboard', 'projects', 'materials', 'tasks', 'escalation', 'reports'],
  plane: ['dashboard', 'projects', 'materials', 'tasks', 'escalation', 'reports'],
  admin: ['settings'],
}

// nav id -> route + label + icon. `end` marks exact-match routes (dashboard).
export const NAV_CATALOG = {
  dashboard:  { id: 'dashboard',  label: 'Dashboard',    icon: 'dashboard',  to: '/dashboard', end: true },
  projects:   { id: 'projects',   label: 'Projects',     icon: 'projects',   to: '/projects' },
  materials:  { id: 'materials',  label: 'Materials',    icon: 'materials',  to: '/materials' },
  tasks:      { id: 'tasks',      label: 'My Tasks',     icon: 'tasks',      to: '/tasks' },
  escalation: { id: 'escalation', label: 'Escalations',  icon: 'escalation', to: '/escalations' },
  reports:    { id: 'reports',    label: 'Reports',      icon: 'reports',    to: '/reports' },
  settings:   { id: 'settings',   label: 'Settings',     icon: 'settings',   to: '/settings' },
}

// the nav items a given role may see (badges injected by the Shell from live counts)
export function navForRole(role) {
  const ids = ROLE_NAV[role] || ROLE_NAV.pmo
  return ids.map((id) => NAV_CATALOG[id]).filter(Boolean)
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

// Build the nested breadcrumb trail from the URL + a label map (display names
// for ids, registered by detail pages via the BreadcrumbProvider). Non-terminal
// crumbs carry a `to` so the breadcrumb itself is deep-linkable navigation.
export function crumbsFor(pathname, labels = {}) {
  const parts = pathname.replace(/^#/, '').split('/').filter(Boolean)
  const crumbs = [{ label: 'IES' }, { label: 'Retrofit' }]

  if (parts.length === 0) { crumbs.push({ label: 'Dashboard' }); return finalize(crumbs) }

  const root = parts[0]
  if (root === 'projects') {
    crumbs.push({ label: 'Projects', to: '/projects' })
    const pid = parts[1]
    if (pid) {
      crumbs.push({ label: labels['project:' + pid] || pid, to: `/projects/${pid}` })
      if (parts[2] === 'buildings' && parts[3]) {
        const bid = parts[3]
        crumbs.push({ label: labels['building:' + bid] || bid, to: `/projects/${pid}/buildings/${bid}` })
        if (parts[4] === 'install-log') {
          crumbs.push({ label: 'Install Log', to: `/projects/${pid}/buildings/${bid}` })
          if (parts[5]) crumbs.push({ label: labels['item:' + parts[5]] || parts[5] })
        } else if (parts[4] === 'daily') {
          crumbs.push({ label: 'Daily Progress' })
        }
      }
    }
  } else {
    const map = { tasks: 'My Tasks', escalations: 'My Escalations', materials: 'Materials', reports: 'Reports', settings: 'Settings', dashboard: 'Dashboard' }
    crumbs.push({ label: map[root] || cap(root), to: '/' + root })
  }
  return finalize(crumbs)
}

function finalize(crumbs) {
  return crumbs.map((c, i) => ({ ...c, active: i === crumbs.length - 1 }))
}
