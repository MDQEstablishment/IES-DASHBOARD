import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useBreadcrumb } from '../breadcrumbs'
import Icon from '../components/Icon'
import { Avatar, Chip, Loading, Empty, Btn, Modal, Field, inputStyle } from '../components/ui'
import { useAuth, can } from '../rbac'
import { useLiveQuery, bgUpdate, bgInsert } from '../lib/db'
import { CAN_QA, CAN_INSTALL, labelize } from '../lib/constants'
import { num, fmtShort } from '../lib/format'

// Building Detail (dc r_building, 415-638). Level-3 drill-in: nested sub-tab menu
// (Assets / Rooms / Materials / Documents / Photos / Activity) + the deep-linkable
// install-log item route (…/install-log/:itemId) with QA approve/reject.
const TABS = [
  { key: '', label: 'Assets', icon: 'tasks' },
  { key: 'rooms', label: 'Rooms', icon: 'buildings' },
  { key: 'materials', label: 'Materials', icon: 'materials' },
  { key: 'documents', label: 'Documents', icon: 'doc' },
  { key: 'photos', label: 'Photos', icon: 'camera' },
  { key: 'activity', label: 'Activity', icon: 'curve' },
]

export default function BuildingDetail() {
  const { id, bid } = useParams()
  const nav = useNavigate()
  const loc = useLocation()
  const { setLabel } = useBreadcrumb()
  const { user, role } = useAuth()
  const isQA = can(role, CAN_QA)
  const canInstall = can(role, CAN_INSTALL)
  const [expanded, setExpanded] = useState({})
  const [addOpen, setAddOpen] = useState(false)

  const base = `/projects/${id}/buildings/${bid}`
  const tail = loc.pathname.slice(loc.pathname.indexOf(base) + base.length).replace(/^\//, '')
  const seg = tail.split('/')
  const isInstallItem = seg[0] === 'install-log'
  const activeTab = isInstallItem ? '' : (seg[0] || '')
  const itemId = isInstallItem ? seg[1] : null

  const { rows: bRows, loading } = useLiveQuery('buildings', (q) => q.select('*,project:projects(code,name)').eq('id', bid), [bid])
  const b = bRows[0]
  const { rows: scopes } = useLiveQuery('building_item_scope', (q) =>
    q.select('*,project_esm:project_esms(esm:esms(code,name))').eq('building_id', bid).order('sub_type'), [bid])
  const { rows: install } = useLiveQuery('install_log', (q) =>
    q.select('*,by:profiles!install_log_installed_by_id_fkey(full_name)').eq('building_id', bid).order('entry_date', { ascending: false }), [bid])
  const { rows: rooms } = useLiveQuery('rooms', (q) => q.select('*').eq('building_id', bid).order('name'), [bid])
  const { rows: docs } = useLiveQuery('documents', (q) => q.select('*').eq('building_id', bid), [bid])
  const { rows: photos } = useLiveQuery('photos', (q) => q.select('*').eq('building_id', bid), [bid])
  const { rows: audit } = useLiveQuery('audit_log', (q) => q.select('*').order('created_at', { ascending: false }).limit(60))

  useEffect(() => { if (b) setLabel('building:' + bid, b.code || b.name) }, [b, bid, setLabel])
  useEffect(() => { if (itemId) setLabel('item:' + itemId, itemId.slice(0, 8)) }, [itemId, setLabel])

  if (loading && !b) return <Loading />
  if (!b) return <Empty icon="buildings">Building not found.</Empty>

  const esmOfScope = (s) => s.project_esm?.esm?.code || '—'
  const installedFor = (scopeId) => install.filter((r) => r.scope_id === scopeId && r.qa_status === 'approved').reduce((a, r) => a + (r.qty || 0), 0)
  const totalPlanned = scopes.reduce((a, s) => a + (s.planned_qty || 0), 0)
  const totalInstalled = scopes.reduce((a, s) => a + Math.min(s.planned_qty || 0, installedFor(s.id)), 0)
  const prog = totalPlanned ? Math.round((totalInstalled / totalPlanned) * 100) : 0

  const setStatus = (r, status) =>
    bgUpdate('install_log', r.id, { qa_status: status, approved_by_id: user.id, approved_at: new Date().toISOString() },
      { okMsg: `Marked ${status === 'approved' ? 'Approved' : 'Rejected'}` })

  return (
    <div data-screen-label="Building Detail">
      {/* header */}
      <Link to={`/projects/${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-3)', fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>
        <Icon name="chevronl" size={14} />{b.project?.code || 'Project'}
      </Link>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '1px', color: 'var(--text-3)' }}>{b.code}</span>
            <Chip status={b.status_override || 'pending'} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '6px 0 4px' }}>{b.name}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12.5, color: 'var(--text-3)' }}>
            {b.name_ar && <span>{b.name_ar}</span>}
            <span>📍 {b.region || '—'}</span>
            <span>👷 {b.engineer_name || '—'}</span>
            <span>🏗 {b.contractor || '—'}</span>
            {b.gps && <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>📌 {b.gps}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 700, color: 'var(--accent)' }}>{prog}%</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.5px', color: 'var(--text-3)' }}>{num(totalInstalled)} / {num(totalPlanned)} UNITS</div>
          </div>
          <Link to={`${base}/daily`} className="ies-card-hover" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 13px', borderRadius: 9, border: '1px solid var(--line)', background: '#fff', fontWeight: 600, fontSize: 13 }}>
            <Icon name="daily" size={15} />Daily Progress
          </Link>
        </div>
      </div>

      {/* nested sub-tab menu (dc bTabs) */}
      <div className="ies-table-wrap" style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        {TABS.map((t) => {
          const on = activeTab === t.key && !itemId
          return (
            <button key={t.key || 'assets'} onClick={() => nav(t.key ? `${base}/${t.key}` : base)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 13px', fontSize: 13, fontWeight: on ? 700 : 500, color: on ? 'var(--accent)' : 'var(--text-3)', borderBottom: on ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -1, background: 'none' }}>
              <Icon name={t.icon} size={15} />{t.label}
            </button>
          )
        })}
      </div>

      {/* ITEM DRILL (level-4): single install entry + QA approve */}
      {itemId && (() => {
        const r = install.find((x) => x.id === itemId)
        if (!r) return <Empty icon="reports">Install item not found in this building.</Empty>
        const sc = scopes.find((s) => s.id === r.scope_id)
        return (
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 20, maxWidth: 640 }}>
            <Link to={base} style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 13 }}>← Back to Assets</Link>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '12px 0' }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{sc?.sub_type || 'Install entry'}</div>
              <Chip status={r.qa_status} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, fontSize: 13 }}>
              <Meta k="Quantity" v={`${r.qty} units`} />
              <Meta k="Date" v={fmtShort(r.entry_date)} />
              <Meta k="ESM" v={esmOfScope(sc || {})} />
              <Meta k="Source" v={labelize(r.source)} />
              <Meta k="Logged by" v={r.by?.full_name || '—'} />
              <Meta k="Photos" v={Array.isArray(r.photos) ? r.photos.length : 0} />
            </div>
            {r.note && <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--text-3)' }}>Note: {r.note}</div>}
            {isQA && r.qa_status === 'pending_qa' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <Btn variant="primary" icon="check" onClick={() => setStatus(r, 'approved')}>Approve</Btn>
                <Btn variant="danger" icon="x" onClick={() => setStatus(r, 'rejected')}>Reject</Btn>
              </div>
            )}
          </div>
        )
      })()}

      {/* ASSETS — daily install log grouped by sub-type scope */}
      {activeTab === '' && !itemId && (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Assets · Daily Install Log</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link to={`${base}/daily`} style={{ display: 'inline-flex', alignItems: 'center', fontSize: 12.5, fontWeight: 600, color: 'var(--text-3)' }}>Batch (Daily)</Link>
              {canInstall && <button onClick={() => setAddOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--accent)' }}><Icon name="plus" size={14} />Add today's install</button>}
            </div>
          </div>
          {scopes.length === 0 ? <Empty icon="tasks">No install scope defined for this building.</Empty> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {scopes.map((s) => {
                const inst = installedFor(s.id)
                const planned = s.planned_qty || 0
                const remaining = Math.max(0, planned - inst)
                const p = planned ? Math.round((inst / planned) * 100) : 0
                const entries = install.filter((r) => r.scope_id === s.id)
                const open = expanded[s.id]
                return (
                  <div key={s.id} style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
                    <button onClick={() => setExpanded((e) => ({ ...e, [s.id]: !e[s.id] }))} className="ies-row-hover"
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', textAlign: 'left' }}>
                      <span style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: 'var(--text-3)' }}><Icon name="chevronr" size={14} /></span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--accent)', width: 42 }}>{esmOfScope(s)}</span>
                      <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{s.sub_type}</span>
                      <span style={{ width: 120, height: 6, borderRadius: 4, background: '#EFF2F6', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: p + '%', background: p >= 100 ? '#10B981' : 'var(--accent)' }} /></span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 700, width: 90, textAlign: 'right' }}>{inst}/{planned} <span style={{ color: 'var(--warn)' }}>· {remaining} left</span></span>
                    </button>
                    {open && (
                      <div style={{ borderTop: '1px solid var(--line)', padding: '4px 0' }}>
                        {entries.length === 0 ? <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-3)' }}>No installs logged yet.</div> : entries.map((r) => (
                          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderTop: '1px solid #F1F5F9' }}>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)', width: 70 }}>{fmtShort(r.entry_date)}</span>
                            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ok)', width: 48 }}>+{r.qty}</span>
                            <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}><Avatar name={r.by?.full_name} size={20} /><span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{r.by?.full_name || '—'}</span></span>
                            <Chip status={r.qa_status} />
                            <Link to={`${base}/install-log/${r.id}`} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent)' }}>Open ›</Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ROOMS */}
      {activeTab === 'rooms' && (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Rooms</div>
          {rooms.length === 0 ? <Empty icon="buildings">No rooms defined.</Empty> : (
            <div className="ies-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              {rooms.map((r) => (
                <div key={r.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{r.floor || '—'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MATERIALS — per-building lines (planned vs used) */}
      {activeTab === 'materials' && (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Materials Used vs Planned</div>
          {scopes.length === 0 ? <Empty icon="materials">No material scope.</Empty> : (
            <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 520 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
                <th style={{ padding: 8, fontWeight: 600 }}>SUB-TYPE</th><th style={{ padding: 8, fontWeight: 600 }}>MATERIAL</th>
                <th style={{ padding: 8, fontWeight: 600, textAlign: 'right' }}>PLANNED</th><th style={{ padding: 8, fontWeight: 600, textAlign: 'right' }}>USED</th>
              </tr></thead>
              <tbody>
                {scopes.map((s) => (
                  <tr key={s.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '9px 8px', fontWeight: 600 }}>{s.sub_type}</td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{s.material_code}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{num(s.planned_qty)}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ok)' }}>{num(installedFor(s.id))}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      )}

      {/* DOCUMENTS */}
      {activeTab === 'documents' && (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Documents</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Uploads accepted as compressed archive (.zip)</div>
          </div>
          {docs.length === 0 ? <Empty icon="doc">No documents uploaded.</Empty> : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {docs.map((d) => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', borderTop: '1px solid var(--line)' }}>
                  <Icon name="doc" size={18} style={{ color: 'var(--text-3)' }} />
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 13 }}>{d.title || labelize(d.kind)}</div><div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>rev {d.revision}</div></div>
                  <Chip status={d.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PHOTOS */}
      {activeTab === 'photos' && (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Site Photos</div>
            <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700 }}><Icon name="camera" size={14} />Capture</button>
          </div>
          {photos.length === 0 ? <Empty icon="camera">No site photos yet.</Empty> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 10 }}>
              {photos.map((p) => <div key={p.id} style={{ aspectRatio: '1', borderRadius: 10, background: '#EFF2F6', border: '1px solid var(--line)' }} />)}
            </div>
          )}
        </div>
      )}

      {/* ACTIVITY */}
      {activeTab === 'activity' && (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Activity Log</div>
          {(() => {
            const ids = new Set([bid, ...install.map((r) => r.id), ...docs.map((d) => d.id)])
            const rows = audit.filter((a) => ids.has(a.record_id) || (a.summary || '').includes(b.name))
            return rows.length === 0 ? <Empty icon="bell">No recent activity for this building.</Empty> : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {rows.map((a) => (
                  <div key={a.id} style={{ display: 'flex', gap: 10, padding: '9px 0', borderTop: '1px solid var(--line)' }}>
                    <span style={{ flex: 'none', width: 8, height: 8, borderRadius: '50%', background: '#2563EB', marginTop: 5 }} />
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5 }}><span style={{ fontWeight: 600 }}>{a.actor_name || 'System'}</span> <span style={{ color: 'var(--text-3)' }}>{a.summary || a.action}</span></div><div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{fmtShort(a.created_at)}</div></div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      )}
      {addOpen && <InstallModal bid={bid} scopes={scopes} user={user} onClose={() => setAddOpen(false)} />}
    </div>
  )
}

function InstallModal({ bid, scopes, user, onClose }) {
  const [scopeId, setScopeId] = useState(scopes[0]?.id || '')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!scopeId || !qty || Number(qty) < 1) return
    setBusy(true)
    const { error } = await bgInsert('install_log', {
      entry_date: new Date().toISOString().slice(0, 10), building_id: bid, scope_id: scopeId,
      qty: Number(qty), source: 'manual', installed_by_id: user.id, note: note || null, photos: [],
    }, { okMsg: 'Install logged ✓' })
    setBusy(false)
    if (!error) onClose()
  }
  return (
    <Modal open title="Add today's install" onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save} disabled={busy || !scopeId || !qty}>{busy ? 'Saving…' : 'Log install'}</Btn></>}>
      <Field label="Sub-type">
        <select style={inputStyle} value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
          <option value="">Select sub-type…</option>
          {scopes.map((s) => <option key={s.id} value={s.id}>{s.project_esm?.esm?.code} · {s.sub_type} ({s.planned_qty} planned)</option>)}
        </select>
      </Field>
      <Field label="Quantity installed"><input style={inputStyle} type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 12" /></Field>
      <Field label="Room / location note"><input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Floor 2 east" /></Field>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Appends a row to the install log (pending QA), decrements stock and bumps every percentage.</div>
    </Modal>
  )
}

function Meta({ k, v }) {
  return <div><div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.5px', color: 'var(--text-3)' }}>{k.toUpperCase()}</div><div style={{ fontWeight: 600, marginTop: 2 }}>{v}</div></div>
}
