import { useParams, Link } from 'react-router-dom'
import { PageHead, Stat, Card, Bar, Pill, Loading, Empty, Avatar } from '../components/ui'
import Icon from '../components/Icon'
import { useLiveQuery } from '../lib/db'
import { num, pct, fmtDate } from '../lib/format'
import { DOC_KIND, pillClass } from '../lib/constants'

export default function ProjectDetail() {
  const { id } = useParams()
  const { rows: projects, loading } = useLiveQuery('projects', (q) => q.select('*,pm:profiles!projects_pm_id_fkey(full_name)').eq('id', id), [id])
  const project = projects[0]
  const { rows: buildings } = useLiveQuery('buildings', (q) => q.select('*').eq('project_id', id).order('code'), [id])
  const { rows: scopes } = useLiveQuery('building_item_scope', (q) => q.select('id,building_id,material_code,planned_qty'))
  const { rows: install } = useLiveQuery('install_log', (q) => q.select('scope_id,qty,qa_status'))
  const { rows: docs } = useLiveQuery('esm_doc_status', (q) => q.select('*,esm:esms(code,name)').eq('project_id', id).order('esm_id'), [id])

  if (loading && !project) return <Loading />
  if (!project) return <Empty>Project not found.</Empty>

  const bIds = new Set(buildings.map((b) => b.id))
  const insByScope = {}; install.forEach((r) => { if (r.qa_status === 'approved') insByScope[r.scope_id] = (insByScope[r.scope_id] || 0) + r.qty })
  const perB = {}; let planned = 0, installed = 0, acP = 0, acI = 0
  scopes.filter((s) => bIds.has(s.building_id)).forEach((s) => {
    const ins = Math.min(s.planned_qty, insByScope[s.id] || 0)
    planned += s.planned_qty; installed += ins
    if ((s.material_code || '').startsWith('AC')) { acP += s.planned_qty; acI += ins }
    perB[s.building_id] = perB[s.building_id] || { planned: 0, installed: 0 }
    perB[s.building_id].planned += s.planned_qty; perB[s.building_id].installed += ins
  })
  const overall = planned ? (installed / planned) * 100 : 0

  // group esm_doc_status by esm
  const byEsm = {}
  docs.forEach((d) => { const k = d.esm?.code || d.esm_id; (byEsm[k] = byEsm[k] || { name: d.esm?.name, rows: [] }).rows.push(d) })

  return (
    <>
      <PageHead kicker="Project detail · drill-down"
        title={project.name}
        sub={`${project.client} · ${project.region} · PM ${project.pm?.full_name || '—'} · starts ${fmtDate(project.start_date)}`}
        actions={<Link to="/projects" className="btn"><Icon name="ChevronLeft" size={14} /> All projects</Link>} />

      <div className="grid mb-4" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <Stat label="Weighted progress" value={pct(overall)} sub={`${num(installed)} / ${num(planned)} units`} />
        <Stat label="Buildings" value={num(buildings.length)} sub={`${buildings.filter((b) => b.status_override === 'in_progress').length} in progress`} />
        <Stat label="AC units" value={num(acI)} sub={`of ${num(acP)} in scope`} accent="var(--green)" />
        <Stat label="Duration" value={`${project.total_weeks || '—'} wk`} sub={project.status} />
      </div>

      <Card title="Buildings" meta={`${buildings.length}`} pad={false} style={{ marginBottom: 16 }}>
        {buildings.length === 0 ? <Empty icon="Building2">No buildings yet.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Building</th><th>Contractor</th><th>Engineer</th><th style={{ width: 200 }}>Progress</th><th>Delivery</th><th>Status</th></tr></thead>
            <tbody>
              {buildings.map((b) => {
                const d = perB[b.id] || { planned: 0, installed: 0 }
                const pp = d.planned ? (d.installed / d.planned) * 100 : 0
                return (
                  <tr key={b.id}>
                    <td><div style={{ fontWeight: 600 }}>{b.name}</div><div className="muted" style={{ fontSize: 11 }}>{b.code} · {b.region}</div></td>
                    <td className="muted">{b.contractor || '—'}</td>
                    <td><div className="flex center gap-2"><Avatar name={b.engineer_name} size={20} />{b.engineer_name || '—'}</div></td>
                    <td><div className="flex center gap-2"><span className="num" style={{ width: 38 }}>{pct(pp)}</span><div className="grow"><Bar value={d.installed} max={d.planned || 1} /></div></div></td>
                    <td className="num muted">{b.delivery_date ? fmtDate(b.delivery_date) : '—'}</td>
                    <td><Pill status={b.status_override || 'pending'} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="ESM document status" meta="submittal readiness">
        {Object.keys(byEsm).length === 0 ? <Empty icon="FileText">No ESM document tracking yet.</Empty> : (
          <div className="col gap-3">
            {Object.entries(byEsm).map(([code, g]) => (
              <div key={code} className="flex center gap-3 wrap">
                <div style={{ width: 200 }}><span className="pill pill-gray">{code}</span> <span className="muted" style={{ fontSize: 12 }}>{g.name}</span></div>
                <div className="flex center gap-2 wrap">
                  {g.rows.map((r) => (
                    <span key={r.id} className={`pill ${pillClass(r.status)}`}>{DOC_KIND[r.kind] || r.kind}: {r.status}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  )
}
