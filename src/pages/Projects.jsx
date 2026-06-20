import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHead, Stat, Card, Bar, Pill, Loading, Empty } from '../components/ui'
import Icon from '../components/Icon'
import { useLiveQuery } from '../lib/db'
import { num, pct, fmtDate } from '../lib/format'

export default function Projects() {
  const nav = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const { rows: projects, loading } = useLiveQuery('projects', (q) => q.select('*').order('code'))
  const { rows: buildings } = useLiveQuery('buildings', (q) => q.select('id,project_id'))
  const { rows: scopes } = useLiveQuery('building_item_scope', (q) => q.select('id,building_id,planned_qty'))
  const { rows: install } = useLiveQuery('install_log', (q) => q.select('scope_id,qty,qa_status'))

  const insByScope = {}; install.forEach((r) => { if (r.qa_status === 'approved') insByScope[r.scope_id] = (insByScope[r.scope_id] || 0) + r.qty })
  const bP = {}; buildings.forEach((b) => { bP[b.id] = b.project_id })
  const per = {}
  scopes.forEach((s) => {
    const pid = bP[s.building_id]; if (!pid) return
    const ins = Math.min(s.planned_qty, insByScope[s.id] || 0)
    per[pid] = per[pid] || { planned: 0, installed: 0 }; per[pid].planned += s.planned_qty; per[pid].installed += ins
  })

  const filtered = projects.filter((p) => {
    if (status !== 'all' && p.status !== status) return false
    if (search && !(`${p.name} ${p.client} ${p.region}`.toLowerCase().includes(search.toLowerCase()))) return false
    return true
  })

  return (
    <>
      <PageHead kicker="Company-wide · all divisions" title="Projects"
        sub={`${projects.length} projects · ${projects.filter((p) => p.status === 'active').length} active · ${buildings.length} buildings`} />

      <div className="grid mb-4" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <Stat label="Total projects" value={num(projects.length)} />
        <Stat label="Active" value={num(projects.filter((p) => p.status === 'active').length)} accent="var(--green)" />
        <Stat label="Buildings" value={num(buildings.length)} />
        <Stat label="Draft / on-hold" value={num(projects.filter((p) => p.status === 'draft' || p.status === 'on_hold').length)} accent="var(--gold)" />
      </div>

      <Card pad={false}
        title={<input className="input" style={{ width: 260 }} placeholder="Search project, client, region…" value={search} onChange={(e) => setSearch(e.target.value)} />}
        actions={
          <select className="select" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All status</option><option value="active">Active</option>
            <option value="draft">Draft</option><option value="on_hold">On hold</option><option value="closed">Closed</option>
          </select>}>
        {loading ? <Loading /> : filtered.length === 0 ? <Empty>No projects match.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Project</th><th>Client</th><th>Region</th><th>Buildings</th><th style={{ width: 200 }}>Progress</th><th>Ends</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map((p) => {
                const d = per[p.id] || { planned: 0, installed: 0 }
                const pp = d.planned ? (d.installed / d.planned) * 100 : 0
                const bc = buildings.filter((b) => b.project_id === p.id).length
                return (
                  <tr key={p.id} className="clickable" onClick={() => nav(`/projects/${p.id}`)}>
                    <td><div style={{ fontWeight: 600 }}>{p.name}</div><div className="muted" style={{ fontSize: 11 }}>{p.code}</div></td>
                    <td className="muted">{p.client}</td>
                    <td className="muted">{p.region}</td>
                    <td className="num">{bc}</td>
                    <td><div className="flex center gap-2"><span className="num" style={{ width: 38 }}>{pct(pp)}</span><div className="grow"><Bar value={d.installed} max={d.planned || 1} /></div></div></td>
                    <td className="num muted">{p.start_date ? fmtDate(p.start_date) : '—'}</td>
                    <td><Pill status={p.status} /></td>
                    <td><Icon name="ChevronRight" size={15} color="var(--text-4)" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  )
}
