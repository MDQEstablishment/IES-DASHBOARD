// 9R(7) — mounts the REAL Team Performance widget with a seeded dataset.
//
// Why a harness and not the live page: the plan forbids seeding a thousand rows
// into the live database, and it is right to — tasks have no hard delete, so
// every seeded row would be permanent. This renders the shipped component with
// a synthetic dataset instead, inside a container that reproduces the real
// shell geometry (240px sidebar, 24px content padding, 1320px max width) so a
// card-level fit measurement here means the same thing it would mean in the app.
//
// It is NOT a substitute for a signed-in screenshot of the whole page. It
// proves what it renders and nothing more.

import { createRoot } from 'react-dom/client'
import { TeamPerformance } from '../../src/pages/Tasks.jsx'
import '../../src/index.css'

const ROLES = ['proje', 'projm', 'proco', 'plane', 'progm']
const STATUSES = ['open', 'in_progress', 'blocked', 'done', 'cancelled']

// Deterministic pseudo-random so a re-run measures the same dataset.
let seed = 12345
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}

function seedData(taskCount, peopleCount) {
  const subtree = Array.from({ length: peopleCount }, (_, i) => ({
    id: `p-${i}`,
    full_name: `Subordinate Number ${i + 1}`,
    role: ROLES[i % ROLES.length],
    manager_id: 'me',
  }))
  const now = Date.now()
  const rows = Array.from({ length: taskCount }, (_, i) => {
    const status = STATUSES[Math.floor(rnd() * STATUSES.length)]
    const createdAt = new Date(now - Math.floor(rnd() * 120) * 86400000)
    const doneAt = status === 'done'
      ? new Date(createdAt.getTime() + Math.floor(rnd() * 30) * 86400000) : null
    // ~4% trashed, so the trashed-30d counter and the exclusion path both run.
    const trashed = rnd() < 0.04
    return {
      id: `t-${i}`,
      title: `Seeded task ${i + 1} for render measurement`,
      status,
      assigned_to_id: subtree[Math.floor(rnd() * peopleCount)].id,
      created_by_id: 'me',
      created_at: createdAt.toISOString(),
      done_at: doneAt ? doneAt.toISOString() : null,
      due_date: new Date(now + (Math.floor(rnd() * 60) - 30) * 86400000).toISOString().slice(0, 10),
      deleted_at: trashed ? new Date(now - Math.floor(rnd() * 45) * 86400000).toISOString() : null,
      priority: 'medium',
    }
  })
  return { rows, subtree }
}

function Shell({ children }) {
  // Reproduces src/components/Shell.jsx's geometry so the card gets exactly the
  // width it gets in the app at this viewport.
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ width: 240, flex: 'none' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <main className="ies-content" style={{ padding: '24px 24px 40px', maxWidth: 1320, margin: '0 auto' }}>
          {children}
        </main>
      </div>
    </div>
  )
}

const params = new URLSearchParams(location.search)
const TASKS = Number(params.get('tasks') || 1000)
const PEOPLE = Number(params.get('people') || 8)

const { rows, subtree } = seedData(TASKS, PEOPLE)
const root = createRoot(document.getElementById('root'))

const t0 = performance.now()
root.render(
  <Shell>
    <TeamPerformance rows={rows} subtree={subtree} fetchTotal={TASKS} />
  </Shell>,
)

// Two frames plus a forced layout read: the first commits, the second lets
// layout and paint settle, and reading offsetHeight guarantees the browser has
// actually done the layout rather than deferring it past our timer.
requestAnimationFrame(() => requestAnimationFrame(() => {
  const card = document.querySelector('[data-perf-card]')
    || document.getElementById('root').querySelector('main > div')
  void document.body.offsetHeight
  const t1 = performance.now()

  const wrap = document.querySelector('.ies-table-wrap')
  window.__perf = {
    tasks: TASKS,
    people: PEOPLE,
    ms: +(t1 - t0).toFixed(1),
    // Card-level fit: does the CARD overflow its own column?
    cardClientWidth: card ? card.clientWidth : null,
    cardScrollWidth: card ? card.scrollWidth : null,
    cardOverflows: card ? card.scrollWidth > card.clientWidth : null,
    // The table is allowed to scroll INSIDE the wrapper — that is the design.
    wrapClientWidth: wrap ? wrap.clientWidth : null,
    wrapScrollWidth: wrap ? wrap.scrollWidth : null,
    tableScrollsInsideWrap: wrap ? wrap.scrollWidth > wrap.clientWidth : null,
    // The page itself must never scroll sideways.
    bodyScrollWidth: document.documentElement.scrollWidth,
    bodyClientWidth: document.documentElement.clientWidth,
    pageScrollsHorizontally: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    columns: document.querySelectorAll('.ies-table-wrap thead th').length,
    employeeRows: document.querySelectorAll('.ies-table-wrap tbody tr').length,
  }
  document.title = 'perf-ready'
}))
