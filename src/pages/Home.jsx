import { useNavigate } from 'react-router-dom'
import { useAuth } from '../rbac'
import { navForRole } from '../lib/nav'

// Index / demo-navigation grid (dc r_index, lines 159-167). Reached via the
// header logo (goHome). Cards are RBAC-filtered to the routes the role may see.
const DESC = {
  dashboard: 'Executive snapshot — KPIs, S-curve, attention list, critical materials.',
  projects: 'Retrofit project cards, status filters, drill into project detail.',
  materials: 'Per-ESM stock, thresholds, low-stock alerts, issue-to-site.',
  tasks: 'Personal queue — Mine / Delegated / Team, with bottleneck detection.',
  escalation: 'Severity cards, strict hierarchy chain, acknowledge / resolve / forward.',
  reports: 'Materials consumption, Tarsheed, employee performance, ESM-vs-plan.',
  settings: 'Users, roles & permissions matrix, audit log with CSV export.',
}

export default function Home() {
  const nav = useNavigate()
  const { role } = useAuth()
  const items = navForRole(role)

  return (
    <div data-screen-label="Index">
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '2px', color: 'var(--text-3)' }}>DEMO NAVIGATION</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 0' }}>All Pages</h1>
      </div>
      <div className="ies-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        {items.map((n, i) => (
          <button key={n.id} onClick={() => nav(n.to)} className="ies-card-hover"
            style={{ textAlign: 'left', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)' }}>{String(i + 1).padStart(2, '0')}</div>
            <div style={{ fontWeight: 700, fontSize: 15, margin: '6px 0 4px' }}>{n.label}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.35 }}>{DESC[n.id] || ''}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
