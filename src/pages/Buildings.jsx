import { useState } from 'react'
import Icon from '../components/Icon'
import { Avatar, Chip, ProgressBar, PageTitle, Loading, Empty, Modal } from '../components/ui'
import { useLiveQuery } from '../lib/db'
import { useProject } from '../project'
import { pct } from '../lib/format'
import { STAGES, DOC_KIND_FULL } from '../lib/constants'

export default function Buildings() {
  const { projectId, current } = useProject()
  const [sel, setSel] = useState(null)

  const { rows: buildings, loading } = useLiveQuery('buildings',
    (q) => { let b = q.select('*,project:projects(code,name)').order('code'); if (projectId !== 'ALL') b = b.eq('project_id', projectId); return b },
    [projectId])
  const { rows: scopes } = useLiveQuery('building_item_scope', (q) => q.select('id,building_id,planned_qty'))
  const { rows: install } = useLiveQuery('install_log', (q) => q.select('scope_id,qty,qa_status'))

  // approved-installed qty per scope (capped per scope) -> per-building planned/installed
  const insByScope = {}
  install.forEach((r) => { if (r.qa_status === 'approved') insByScope[r.scope_id] = (insByScope[r.scope_id] || 0) + r.qty })
  const perB = {}
  scopes.forEach((s) => {
    const ins = Math.min(s.planned_qty || 0, insByScope[s.id] || 0)
    perB[s.building_id] = perB[s.building_id] || { planned: 0, installed: 0 }
    perB[s.building_id].planned += s.planned_qty || 0
    perB[s.building_id].installed += ins
  })

  return (
    <div data-screen-label="Buildings">
      <PageTitle kicker="PROGRAMME · BUILDINGS"
        title="Buildings"
        right={<span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{current ? current.name : 'All projects'} · {buildings.length} buildings</span>} />

      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
        {loading ? <Loading /> : buildings.length === 0 ? <Empty icon="buildings">No buildings for this project.</Empty> : (
          <div className="ies-table-wrap">
            <table className="ies-tbl" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Building</th>
                  <th>Project</th>
                  <th>Contractor</th>
                  <th>Engineer</th>
                  <th style={{ width: 210 }}>Progress</th>
                  <th>Status</th>
                  <th style={{ width: 28 }}></th>
                </tr>
              </thead>
              <tbody>
                {buildings.map((b) => {
                  const d = perB[b.id] || { planned: 0, installed: 0 }
                  const pp = d.planned ? (d.installed / d.planned) * 100 : 0
                  return (
                    <tr key={b.id} className="ies-trow" style={{ cursor: 'pointer' }} onClick={() => setSel(b)}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{b.name}</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>{b.code} · {b.region}</div>
                      </td>
                      <td style={{ color: 'var(--text-3)' }}>{b.project?.code || '—'}</td>
                      <td style={{ color: 'var(--text-3)' }}>{b.contractor || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar name={b.engineer_name} size={24} />
                          <span>{b.engineer_name || '—'}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <div style={{ flex: 1 }}><ProgressBar value={d.installed} max={d.planned || 1} /></div>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, width: 38, textAlign: 'right' }}>{pct(pp)}</span>
                        </div>
                      </td>
                      <td><Chip status={b.status_override || 'pending'} /></td>
                      <td><span style={{ color: '#C9C3B4' }}><Icon name="chevronr" size={16} /></span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!sel} width={820}
        title={sel ? `${sel.code} · ${sel.name}` : ''}
        onClose={() => setSel(null)}>
        {sel && <BuildingDetail b={sel} progress={perB[sel.id] || { planned: 0, installed: 0 }} />}
      </Modal>
    </div>
  )
}

function BuildingDetail({ b, progress }) {
  const pp = progress.planned ? (progress.installed / progress.planned) * 100 : 0
  // current stage index from progress: signed -> 12, pending -> 1, else round(pct/100*12)
  const cur = b.status_override === 'signed' ? 12
    : b.status_override === 'pending' ? 1
      : Math.min(12, Math.max(1, Math.round((pp / 100) * 12)))

  const { rows: scopes } = useLiveQuery('building_item_scope',
    (q) => q.select('id,sub_type,material_code,planned_qty,project_esm:project_esms(esm:esms(code,name))').eq('building_id', b.id).order('sub_type'), [b.id])
  const { rows: install } = useLiveQuery('install_log', (q) => q.select('scope_id,qty,qa_status').eq('building_id', b.id), [b.id])
  const { rows: rooms } = useLiveQuery('rooms', (q) => q.select('*').eq('building_id', b.id).order('name'), [b.id])
  const { rows: docs } = useLiveQuery('documents', (q) => q.select('*').eq('building_id', b.id).order('kind'), [b.id])

  const insByScope = {}
  install.forEach((r) => { if (r.qa_status === 'approved') insByScope[r.scope_id] = (insByScope[r.scope_id] || 0) + r.qty })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header card — code/name/meta + weighted progress (mockup lines 420-426) */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>{b.code}</div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: '5px 0 3px' }}>{b.name}</h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 14px', fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
              <span>📍 {b.region || '—'}</span>
              <span>Eng: {b.engineer_name || '—'}</span>
              <span>Contractor: {b.contractor || '—'}</span>
              <Chip status={b.status_override || 'pending'} />
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 30, fontWeight: 700, lineHeight: 1 }}>{pct(pp)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>weighted progress</div>
          </div>
        </div>
        <div style={{ height: 7, borderRadius: 5, background: '#EDEAE0', marginTop: 12, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: Math.min(100, pp) + '%', background: 'linear-gradient(90deg,#A0762B,#C29A4B)' }} />
        </div>
      </div>

      {/* 12-stage retrofit tracker */}
      <div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.5px', color: 'var(--text-3)', marginBottom: 10 }}>
          12-STAGE RETROFIT TRACKER · {STAGES[cur - 1]}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(118px,1fr))', gap: 8 }}>
          {STAGES.map((s, i) => {
            const n = i + 1
            const done = n < cur
            const isCur = n === cur
            const bg = done ? '#E9F3EE' : isCur ? '#F5EEDF' : '#fff'
            const border = done ? '#BFDFCF' : isCur ? '#A0762B' : 'var(--line)'
            const numBg = done ? '#217A54' : isCur ? '#A0762B' : '#EDEAE0'
            const numCol = done || isCur ? '#fff' : 'var(--text-3)'
            const nameCol = done ? '#175A3E' : isCur ? '#8A6524' : 'var(--text-3)'
            return (
              <div key={i} style={{ background: bg, border: '1px solid ' + border, borderRadius: 10, padding: '9px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 22, height: 22, flex: 'none', borderRadius: '50%', background: numBg, color: numCol, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 700 }}>
                  {done ? <Icon name="check" size={12} /> : String(n).padStart(2, '0')}
                </span>
                <span style={{ fontSize: 11.5, fontWeight: isCur ? 700 : 600, color: nameCol, lineHeight: 1.15 }}>{s}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Scope & install table */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Scope · Installed vs Planned</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>Approved installs counted against each sub-type's planned quantity.</div>
        {scopes.length === 0 ? <Empty icon="box">No scope defined for this building.</Empty> : (
          <div className="ies-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 480 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10.5, fontFamily: 'var(--mono)' }}>
                  <th style={{ padding: '9px 8px', fontWeight: 600 }}>ESM</th>
                  <th style={{ padding: '9px 8px', fontWeight: 600 }}>SUB-TYPE</th>
                  <th style={{ padding: '9px 8px', fontWeight: 600, textAlign: 'right', width: 80 }}>PLANNED</th>
                  <th style={{ padding: '9px 8px', fontWeight: 600, textAlign: 'right', width: 80 }}>INSTALLED</th>
                  <th style={{ padding: '9px 8px', fontWeight: 600, width: 150 }}>PROGRESS</th>
                </tr>
              </thead>
              <tbody>
                {scopes.map((s) => {
                  const ins = Math.min(s.planned_qty || 0, insByScope[s.id] || 0)
                  const sp = s.planned_qty ? (ins / s.planned_qty) * 100 : 0
                  return (
                    <tr key={s.id} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '10px 8px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)' }}>{s.project_esm?.esm?.code || '—'}</td>
                      <td style={{ padding: '10px 8px', fontWeight: 600 }}>{s.sub_type || s.material_code}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{s.planned_qty || 0}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--ok)', fontWeight: 700 }}>{ins}</td>
                      <td style={{ padding: '10px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1 }}><ProgressBar value={ins} max={s.planned_qty || 1} height={6} /></div>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, width: 34, textAlign: 'right' }}>{pct(sp)}</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rooms + Documents */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Rooms &amp; locations</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>Defined rooms feed Daily Progress locations.</div>
          {rooms.length === 0 ? <Empty icon="pin">No rooms defined.</Empty> : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {rooms.map((r) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 4px', borderTop: '1px solid var(--line)' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>{r.floor || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Documents</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>Submittals, inspections &amp; certificates.</div>
          {docs.length === 0 ? <Empty icon="doc">No documents uploaded.</Empty> : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {docs.map((d) => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', borderTop: '1px solid var(--line)' }}>
                  <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{d.title || DOC_KIND_FULL[d.kind] || d.kind}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>rev {d.revision ?? '—'}</span>
                  <Chip status={d.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
