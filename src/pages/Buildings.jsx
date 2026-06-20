import { useState } from 'react'
import { PageHead, Card, Bar, Pill, Loading, Empty, Avatar, Modal } from '../components/ui'
import Icon from '../components/Icon'
import { useLiveQuery } from '../lib/db'
import { useProject } from '../project'
import { num, pct, fmtDate } from '../lib/format'
import { STAGES, DOC_KIND, pillClass } from '../lib/constants'

export default function Buildings() {
  const { projectId, current } = useProject()
  const [sel, setSel] = useState(null)
  const { rows: buildings, loading } = useLiveQuery('buildings',
    (q) => { let b = q.select('*,project:projects(code,name)').order('code'); if (projectId !== 'ALL') b = b.eq('project_id', projectId); return b },
    [projectId])
  const { rows: scopes } = useLiveQuery('building_item_scope', (q) => q.select('id,building_id,planned_qty'))
  const { rows: install } = useLiveQuery('install_log', (q) => q.select('scope_id,qty,qa_status'))

  const insByScope = {}; install.forEach((r) => { if (r.qa_status === 'approved') insByScope[r.scope_id] = (insByScope[r.scope_id] || 0) + r.qty })
  const perB = {}
  scopes.forEach((s) => { const ins = Math.min(s.planned_qty, insByScope[s.id] || 0); perB[s.building_id] = perB[s.building_id] || { p: 0, i: 0 }; perB[s.building_id].p += s.planned_qty; perB[s.building_id].i += ins })

  return (
    <>
      <PageHead kicker="Programme · buildings" title="Buildings"
        sub={`${current ? current.name : 'All projects'} · ${buildings.length} buildings`} />

      <Card pad={false}>
        {loading ? <Loading /> : buildings.length === 0 ? <Empty icon="Building2">No buildings for this project.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Building</th><th>Project</th><th>Contractor</th><th>Engineer</th><th style={{ width: 200 }}>Progress</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {buildings.map((b) => {
                const d = perB[b.id] || { p: 0, i: 0 }; const pp = d.p ? (d.i / d.p) * 100 : 0
                return (
                  <tr key={b.id} className="clickable" onClick={() => setSel(b)}>
                    <td><div style={{ fontWeight: 600 }}>{b.name}</div><div className="muted" style={{ fontSize: 11 }}>{b.code} · {b.region}</div></td>
                    <td className="muted">{b.project?.code}</td>
                    <td className="muted">{b.contractor || '—'}</td>
                    <td><div className="flex center gap-2"><Avatar name={b.engineer_name} size={20} />{b.engineer_name || '—'}</div></td>
                    <td><div className="flex center gap-2"><span className="num" style={{ width: 38 }}>{pct(pp)}</span><div className="grow"><Bar value={d.i} max={d.p || 1} /></div></div></td>
                    <td><Pill status={b.status_override || 'pending'} /></td>
                    <td><Icon name="ChevronRight" size={15} color="var(--text-4)" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={!!sel} title={sel ? `${sel.code} · ${sel.name}` : ''} onClose={() => setSel(null)} width={780}>
        {sel && <BuildingDetail b={sel} progress={perB[sel.id] || { p: 0, i: 0 }} />}
      </Modal>
    </>
  )
}

function BuildingDetail({ b, progress }) {
  const pp = progress.p ? (progress.i / progress.p) * 100 : 0
  const cur = b.status_override === 'signed' ? 12 : b.status_override === 'pending' ? 1 : Math.min(12, Math.max(1, Math.round((pp / 100) * 12)))
  const { rows: scopes } = useLiveQuery('building_item_scope', (q) => q.select('id,sub_type,material_code,planned_qty,project_esm:project_esms(esm:esms(code))').eq('building_id', b.id).order('sub_type'), [b.id])
  const { rows: install } = useLiveQuery('install_log', (q) => q.select('scope_id,qty,qa_status').eq('building_id', b.id), [b.id])
  const { rows: rooms } = useLiveQuery('rooms', (q) => q.select('*').eq('building_id', b.id).order('name'), [b.id])
  const { rows: docs } = useLiveQuery('documents', (q) => q.select('*').eq('building_id', b.id).order('kind'), [b.id])

  const insByScope = {}; install.forEach((r) => { if (r.qa_status === 'approved') insByScope[r.scope_id] = (insByScope[r.scope_id] || 0) + r.qty })

  return (
    <div className="col gap-4">
      <div className="flex center between">
        <div className="flex center gap-2"><Pill status={b.status_override || 'pending'} /><span className="muted" style={{ fontSize: 12 }}>{b.region} · {b.contractor}</span></div>
        <span className="num" style={{ fontWeight: 600 }}>{pct(pp)} complete</span>
      </div>

      <div>
        <div className="card-meta mb-2">12-stage tracker · current: {STAGES[cur - 1]}</div>
        <div className="stages">
          {STAGES.map((s, i) => (
            <div key={i} className={`stage ${i + 1 === cur ? 'cur' : ''}`}>
              <div className="n">{String(i + 1).padStart(2, '0')}</div>
              <div className="flex center" style={{ justifyContent: 'center', margin: '3px 0' }}>
                <span className={`dot dot-${i + 1 < cur ? 'green' : i + 1 === cur ? 'blue' : 'gray'}`} />
              </div>
              <div className="nm">{s}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="card-meta mb-2">Scope & install</div>
        <table className="tbl" style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
          <thead><tr><th>ESM</th><th>Item</th><th className="right">Planned</th><th className="right">Installed</th><th style={{ width: 120 }}>Progress</th></tr></thead>
          <tbody>
            {scopes.map((s) => { const ins = Math.min(s.planned_qty, insByScope[s.id] || 0); return (
              <tr key={s.id}><td>{s.project_esm?.esm?.code}</td><td>{s.sub_type}</td><td className="right num">{s.planned_qty}</td><td className="right num">{ins}</td>
                <td><Bar value={ins} max={s.planned_qty || 1} /></td></tr>
            )})}
            {scopes.length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center' }}>No scope defined.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex gap-4 wrap">
        <div className="grow" style={{ minWidth: 240 }}>
          <div className="card-meta mb-2">Rooms ({rooms.length})</div>
          <div className="col gap-1">
            {rooms.map((r) => <div key={r.id} className="flex center between" style={{ fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid var(--border-soft)' }}><span>{r.name}</span><span className="muted">{r.floor}</span></div>)}
            {rooms.length === 0 && <span className="muted" style={{ fontSize: 12 }}>No rooms.</span>}
          </div>
        </div>
        <div className="grow" style={{ minWidth: 240 }}>
          <div className="card-meta mb-2">Documents ({docs.length})</div>
          <div className="col gap-1">
            {docs.map((d) => <div key={d.id} className="flex center between" style={{ fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid var(--border-soft)' }}>
              <span><span className="pill pill-gray">{DOC_KIND[d.kind]}</span> Rev {d.revision}</span><span className={`pill ${pillClass(d.status)}`}>{d.status}</span></div>)}
            {docs.length === 0 && <span className="muted" style={{ fontSize: 12 }}>No documents.</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
