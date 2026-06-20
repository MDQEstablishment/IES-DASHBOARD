import { Link } from 'react-router-dom'
import { PageHead, Stat, Card, Bar, Pill, Empty, Loading } from '../components/ui'
import { useAuth } from '../rbac'
import { useLiveQuery } from '../lib/db'
import { num, pct, money } from '../lib/format'

export default function Dashboard() {
  const { profile, role } = useAuth()
  const { rows: projects } = useLiveQuery('projects', (q) => q.select('id,code,name,status,client,region'))
  const { rows: buildings } = useLiveQuery('buildings', (q) => q.select('id,project_id,status_override'))
  const { rows: scopes } = useLiveQuery('building_item_scope', (q) => q.select('id,building_id,material_code,planned_qty'))
  const { rows: install, loading } = useLiveQuery('install_log', (q) => q.select('scope_id,qty,qa_status'))
  const { rows: escs } = useLiveQuery('escalations',
    (q) => q.select('id,title,severity,status,building:buildings(code,name),raised_to:profiles!escalations_raised_to_id_fkey(full_name)').neq('status', 'resolved').neq('status', 'closed').order('severity', { ascending: false }))
  const { rows: tasks } = useLiveQuery('tasks', (q) => q.select('id,title,status,priority'))

  const installedByScope = {}
  install.forEach((r) => { if (r.qa_status === 'approved') installedByScope[r.scope_id] = (installedByScope[r.scope_id] || 0) + r.qty })
  const bP = {}; buildings.forEach((b) => { bP[b.id] = b.project_id })

  let planned = 0, installed = 0, acP = 0, acI = 0
  const per = {}
  scopes.forEach((s) => {
    const ins = Math.min(s.planned_qty, installedByScope[s.id] || 0)
    planned += s.planned_qty; installed += ins
    if ((s.material_code || '').startsWith('AC')) { acP += s.planned_qty; acI += ins }
    const pid = bP[s.building_id]
    if (pid) { per[pid] = per[pid] || { planned: 0, installed: 0 }; per[pid].planned += s.planned_qty; per[pid].installed += ins }
  })
  const overall = planned ? (installed / planned) * 100 : 0
  const openTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled').length
  const blocked = tasks.filter((t) => t.status === 'blocked')

  return (
    <>
      <PageHead kicker="Company portfolio overview" title="Dashboard"
        sub={`${profile?.full_name} · viewing portfolio · ${projects.length} projects`} />

      <div className="grid mb-4" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
        <Stat label="Projects" value={num(projects.length)} sub={`${projects.filter((p) => p.status === 'active').length} active`} />
        <Stat label="Buildings" value={num(buildings.length)} sub={`${buildings.filter((b) => b.status_override === 'in_progress').length} in progress`} />
        <Stat label="Weighted progress" value={pct(overall)} sub={`${num(installed)} / ${num(planned)} units`} />
        <Stat label="AC units" value={num(acI)} sub={`of ${num(acP)} in scope`} accent="var(--green)" />
        <Stat label="Open escalations" value={num(escs.length)} sub={`${escs.filter((e) => e.severity === 'critical').length} critical`} accent={escs.length ? 'var(--red)' : undefined} />
        <Stat label="Open tasks" value={num(openTasks)} sub={`${blocked.length} blocked`} accent={blocked.length ? 'var(--gold)' : undefined} />
      </div>

      <div className="grid mb-4" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {projects.map((p) => {
          const d = per[p.id] || { planned: 0, installed: 0 }
          const pp = d.planned ? (d.installed / d.planned) * 100 : 0
          const bc = buildings.filter((b) => b.project_id === p.id).length
          return (
            <Link key={p.id} to={`/projects/${p.id}`} className="card" style={{ padding: 16, textDecoration: 'none' }}>
              <div className="flex center between mb-2">
                <span className="kicker">{p.region || '—'}</span>
                <Pill status={p.status} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
              <div className="muted mb-3" style={{ fontSize: 11.5 }}>{p.client}</div>
              <div className="flex center between mb-2"><span className="num" style={{ fontSize: 18, fontWeight: 600 }}>{pct(pp)}</span><span className="muted" style={{ fontSize: 11.5 }}>{bc} buildings</span></div>
              <Bar value={d.installed} max={d.planned || 1} />
            </Link>
          )
        })}
      </div>

      <Card title="Attention list" meta="open escalations & blocked work" pad={false}>
        {loading ? <Loading /> : (escs.length + blocked.length === 0) ? <Empty icon="Check">All clear — nothing needs attention.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Type</th><th>Item</th><th>Where</th><th>Routed to</th><th>Severity</th></tr></thead>
            <tbody>
              {escs.map((e) => (
                <tr key={e.id}>
                  <td><span className="pill pill-red">ESC</span></td>
                  <td className="truncate" style={{ maxWidth: 360 }}>{e.title}</td>
                  <td className="muted">{e.building?.code || '—'}</td>
                  <td>{e.raised_to?.full_name || '—'}</td>
                  <td><Pill status={e.severity} /></td>
                </tr>
              ))}
              {blocked.map((t) => (
                <tr key={t.id}>
                  <td><span className="pill pill-gold">TASK</span></td>
                  <td className="truncate" style={{ maxWidth: 360 }}>{t.title}</td>
                  <td className="muted">—</td>
                  <td>—</td>
                  <td><Pill status={t.priority} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  )
}
