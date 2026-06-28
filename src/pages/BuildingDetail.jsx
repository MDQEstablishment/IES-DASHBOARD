import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useBreadcrumb } from '../breadcrumbs'
import Icon from '../components/Icon'
import { Avatar, Chip, Loading, Empty, Btn, Modal, Field, inputStyle } from '../components/ui'
import DateInput from '../components/DateInput'
import BuildingMaterialsPlan from '../components/BuildingMaterialsPlan'
import DailyProgress from '../components/DailyProgress'
import BuildingChat from '../components/BuildingChat'
import InspectionFormModal from '../components/InspectionFormModal'
import { useAuth, can } from '../rbac'
import { useLiveQuery, bgUpdate, bgInsert, bgDelete, uploadToBucket } from '../lib/db'
import { CAN_QA, CAN_INSTALL, labelize } from '../lib/constants'
import { num, fmtShort, fmtDate } from '../lib/format'
import { compressImage } from '../lib/image'
import BuildingsMap from '../components/BuildingsMap'
import ProjectDocuments from '../components/ProjectDocuments'
import BuildingPhotos from '../components/BuildingPhotos'

// Building Detail (dc r_building 415-638 + the owner's Sprint-1 screenshots):
// two-column layout with a right rail (Location map + Comments) and the tabs
// Daily Progress / Rooms / Materials / Documents / Photos / Activity.
const TABS = [
  { key: '', label: 'Daily Progress', icon: 'daily' },
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
  const [infoOpen, setInfoOpen] = useState(false)

  const base = `/projects/${id}/buildings/${bid}`
  const tail = loc.pathname.slice(loc.pathname.indexOf(base) + base.length).replace(/^\//, '')
  const seg = tail.split('/')
  const isInstallItem = seg[0] === 'install-log'
  const activeTab = isInstallItem ? '' : (seg[0] || '')
  const itemId = isInstallItem ? seg[1] : null

  const { rows: bRows, loading } = useLiveQuery('buildings', (q) => q.select('*,project:projects(id,code,name,region,client,project_reference_no,beneficiary_entity,contractor_name,doc_rev)').eq('id', bid), [bid])
  const b = bRows[0]
  const [wirOpen, setWirOpen] = useState(false)
  const { rows: scopes } = useLiveQuery('building_item_scope', (q) =>
    q.select('*,project_esm:project_esms(id,esm:esms(code,name))').eq('building_id', bid).order('sub_type'), [bid])
  const { rows: install } = useLiveQuery('install_log', (q) =>
    q.select('*,by:profiles!install_log_installed_by_id_fkey(full_name)').eq('building_id', bid).order('entry_date', { ascending: false }), [bid])
  const { rows: rooms } = useLiveQuery('rooms', (q) => q.select('*').eq('building_id', bid).order('name'), [bid])
  const { rows: audit } = useLiveQuery('audit_log', (q) => q.select('*').order('created_at', { ascending: false }).limit(80))

  useEffect(() => { if (b) setLabel('building:' + bid, b.code || b.name) }, [b, bid, setLabel])
  useEffect(() => { if (itemId) setLabel('item:' + itemId, itemId.slice(0, 8)) }, [itemId, setLabel])

  if (loading && !b) return <Loading />
  if (!b) return <Empty icon="buildings">Building not found.</Empty>

  const esmOfScope = (s) => s.project_esm?.esm?.code || '—'
  const installedFor = (scopeId) => install.filter((r) => r.scope_id === scopeId && r.qa_status === 'approved').reduce((a, r) => a + (r.qty || 0), 0)
  const totalPlanned = scopes.reduce((a, s) => a + (s.planned_qty || 0), 0)
  const totalInstalled = scopes.reduce((a, s) => a + Math.min(s.planned_qty || 0, installedFor(s.id)), 0)
  const prog = totalPlanned ? Math.round((totalInstalled / totalPlanned) * 100) : 0
  const esmCodes = [...new Set(scopes.map(esmOfScope).filter((c) => c !== '—'))]
  const scopeById = Object.fromEntries(scopes.map((s) => [s.id, s]))

  const setStatus = (r, status) =>
    bgUpdate('install_log', r.id, { qa_status: status, approved_by_id: user.id, approved_at: new Date().toISOString() },
      { okMsg: `Marked ${status === 'approved' ? 'Approved' : 'Rejected'}` })

  // building-scoped activity (acts as the Comments thread — see report: comments not yet persisted)
  const ids = new Set([bid, ...install.map((r) => r.id)])
  const buildingActivity = audit.filter((a) => ids.has(a.record_id) || (a.summary || '').includes(b.name))

  return (
    <div data-screen-label="Building Detail">
      <Link to={`/projects/${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-3)', fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>
        <Icon name="chevronl" size={14} />{b.project?.code || 'Project'}
      </Link>

      <div className="ies-bdrail" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
        {/* MAIN COLUMN */}
        <div>
          {/* header */}
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 18, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '1px', color: 'var(--text-3)' }}>{b.code}</div>
                <h1 style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 8px' }}>{b.name}</h1>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12.5, color: 'var(--text-3)' }}>
                  <span>📍 {b.region || '—'}</span>
                  {b.gps && <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{b.gps}</span>}
                  <span>Eng: {b.engineer_name || '—'}</span>
                  <span>Contractor: {b.contractor_name || b.contractor || '—'}</span>
                </div>
                {['admin', 'pmo', 'projm', 'proje'].includes(role) && (
                  <button onClick={() => setWirOpen(true)} title="Open the Work/Mockup Inspection Form (WIR)" style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: 'var(--accent)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 11px', background: '#fff', cursor: 'pointer' }}>Generate WIR PDF</button>
                )}
              </div>
              <div style={{ textAlign: 'right', minWidth: 110 }} title="Weighted progress = installed ÷ planned across building scopes">
                <div style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 800 }}>{prog}%</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>weighted progress</div>
              </div>
            </div>
            <div style={{ height: 8, borderRadius: 5, background: '#EFF2F6', overflow: 'hidden', marginTop: 12 }}>
              <div style={{ height: '100%', width: prog + '%', background: prog >= 100 ? '#10B981' : 'var(--accent)' }} />
            </div>
          </div>

          {/* Building Info — collapsed section (Sprint 8C #2/#3/#5). Lives ABOVE the
              tabs; does not touch Daily Progress / Rooms / Materials / Documents. */}
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, marginBottom: 14, overflow: 'hidden' }}>
            <button onClick={() => setInfoOpen((o) => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'none', cursor: 'pointer' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Building Info</span>
              <span style={{ display: 'inline-flex', transform: infoOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><Icon name="chevron" size={16} /></span>
            </button>
            {infoOpen && (
              <div style={{ borderTop: '1px solid var(--line)', padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
                <Meta k="Building type" v={b.building_type || '—'} />
                <Meta k="Operating hours / yr" v={b.operating_hours ?? '—'} />
                <Meta k="Electricity meter no" v={b.elec_meter_no || '—'} />
                <Meta k="Subscription no" v={b.elec_subscription_no || '—'} />
                <Meta k="Account no" v={b.elec_account_no || '—'} />
                <Meta k="Responsible person" v={b.responsible_person_name || '—'} />
                <Meta k="Responsible phone" v={b.responsible_person_phone || '—'} />
                {b.name_ar && <Meta k="Arabic name (source)" v={b.name_ar} />}
              </div>
            )}
          </div>

          {/* nested sub-tab menu */}
          <div className="ies-table-wrap" style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
            {TABS.map((t) => {
              const on = activeTab === t.key && !itemId
              return (
                <button key={t.key || 'daily'} onClick={() => nav(t.key ? `${base}/${t.key}` : base)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 13px', fontSize: 13, fontWeight: on ? 700 : 500, color: on ? 'var(--accent)' : 'var(--text-3)', borderBottom: on ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -1, background: 'none' }}>
                  <Icon name={t.icon} size={15} />{t.label}
                </button>
              )
            })}
          </div>

          {/* ITEM DRILL (level-4) */}
          {itemId && (() => {
            const r = install.find((x) => x.id === itemId)
            if (!r) return <Empty icon="reports">Install item not found in this building.</Empty>
            const sc = scopeById[r.scope_id]
            return (
              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
                <Link to={base} style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 13 }}>← Back to Daily Progress</Link>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '12px 0' }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{sc?.sub_type || 'Install entry'}</div><Chip status={r.qa_status} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, fontSize: 13 }}>
                  <Meta k="Quantity" v={`${r.qty} units`} /><Meta k="Date" v={fmtShort(r.entry_date)} />
                  <Meta k="ESM" v={esmOfScope(sc || {})} /><Meta k="Source" v={labelize(r.source)} />
                  <Meta k="Logged by" v={r.by?.full_name || '—'} /><Meta k="Photos" v={Array.isArray(r.photos) ? r.photos.length : 0} />
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

          {/* DAILY PROGRESS — Sprint 8I logger (manpower + per-material lines → warehouse consumption) */}
          {activeTab === '' && !itemId && (
            <DailyProgress buildingId={bid} projectId={id} buildingCode={b.code} canWrite={canInstall} user={user} />
          )}

          {/* ROOMS */}
          {activeTab === 'rooms' && <RoomsTab buildingId={bid} rooms={rooms} scopes={scopes} canEdit={canInstall} user={user} />}

          {/* MATERIALS */}
          {activeTab === 'materials' && (<>
            <BuildingMaterialsPlan buildingId={bid} projectId={id} />
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Sub-type detail (per scope)</div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>Planned is editable; Used is derived from the install log (append-only) and feeds the Materials Consumption report.</div>
              {scopes.length === 0 ? <Empty icon="materials">No material scope on this building.</Empty> : (
                <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 600 }}>
                  <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
                    <th style={{ padding: 8, fontWeight: 600 }}>SUB-TYPE</th><th style={{ padding: 8, fontWeight: 600 }}>ESM</th>
                    <th style={{ padding: 8, fontWeight: 600, textAlign: 'right' }}>USED</th><th style={{ padding: 8, fontWeight: 600, textAlign: 'right' }}>PLANNED</th><th style={{ padding: 8, fontWeight: 600 }}>PROGRESS</th>
                  </tr></thead>
                  <tbody>
                    {scopes.map((s) => {
                      const used = installedFor(s.id), planned = s.planned_qty || 0
                      const p = planned ? Math.round((used / planned) * 100) : 0
                      return (
                        <tr key={s.id} style={{ borderTop: '1px solid var(--line)' }}>
                          <td style={{ padding: '9px 8px', fontWeight: 600 }}>{s.sub_type}</td>
                          <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--accent)' }}>{esmOfScope(s)}</td>
                          <td style={{ padding: '9px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ok)' }}>{num(used)}</td>
                          <td style={{ padding: '9px 8px', textAlign: 'right' }}>
                            {canInstall
                              ? <input lang="en" defaultValue={planned} type="text" inputMode="numeric" min="0" onBlur={(e) => Number(e.target.value) !== planned && bgUpdate('building_item_scope', s.id, { planned_qty: Math.max(0, parseInt(e.target.value, 10) || 0) }, { okMsg: 'Planned updated' })} style={{ width: 70, padding: '5px 7px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'var(--mono)', textAlign: 'right' }} />
                              : <span style={{ fontFamily: 'var(--mono)' }}>{num(planned)}</span>}
                          </td>
                          <td style={{ padding: '9px 8px', width: 160 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ flex: 1, height: 6, borderRadius: 4, background: '#EFF2F6', overflow: 'hidden' }}><div style={{ height: '100%', width: Math.min(100, p) + '%', background: 'var(--accent)' }} /></div><span style={{ fontFamily: 'var(--mono)', fontSize: 11, width: 34, textAlign: 'right' }}>{p}%</span></div></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table></div>
              )}
            </div>
          </>)}

          {/* DOCUMENTS */}
          {activeTab === 'documents' && b.project && <ProjectDocuments projectId={b.project_id} buildingId={bid} title="Building Documents" />}

          {/* PHOTOS */}
          {activeTab === 'photos' && <BuildingPhotos buildingId={bid} />}

          {/* ACTIVITY */}
          {activeTab === 'activity' && (
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Activity Log <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)', marginLeft: 6 }}>THIS BUILDING</span></div>
              {buildingActivity.length === 0 ? <Empty icon="bell">No recent activity for this building.</Empty> : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {buildingActivity.map((a) => (
                    <div key={a.id} style={{ display: 'flex', gap: 10, padding: '9px 0', borderTop: '1px solid var(--line)' }}>
                      <span style={{ flex: 'none', width: 8, height: 8, borderRadius: '50%', background: '#2563EB', marginTop: 5 }} />
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5 }}><span style={{ fontWeight: 600 }}>{a.actor_name || 'System'}</span> <span style={{ color: 'var(--text-3)' }}>{a.summary || a.action}</span></div><div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{fmtShort(a.created_at)}</div></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT RAIL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Location</div>
            <BuildingsMap buildings={[b]} />
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)', marginTop: 8 }}>{b.gps || (b.location_lat ? `${b.location_lat}, ${b.location_lng}` : '—')}</div>
          </div>
          <BuildingChat buildingId={bid} user={user} />
        </div>
      </div>

      {wirOpen && b && (
        <InspectionFormModal kind="wir" project={b.project ? { ...b.project, region: b.region || b.project.region } : { id: b.project_id, code: b.project?.code, name: b.project?.name }}
          esm={null} building={{ id: b.id, code: b.code, name: b.name }}
          onClose={() => setWirOpen(false)} />
      )}
    </div>
  )
}

function Meta({ k, v }) {
  return <div><div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.5px', color: 'var(--text-3)' }}>{k.toUpperCase()}</div><div style={{ fontWeight: 600, marginTop: 2 }}>{v}</div></div>
}

// ── Rooms tab — room cards with floor + item types ──────────────────────────
function RoomsTab({ buildingId, rooms, scopes, canEdit, user }) {
  const { rows: roomItems } = useLiveQuery('room_items', (q) => q.select('*,scope:building_item_scope(sub_type)'), [])
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState(''); const [floor, setFloor] = useState('')

  const addRoom = async () => {
    if (!name.trim()) return
    const { error } = await bgInsert('rooms', { building_id: buildingId, name: name.trim(), floor: floor || null }, { okMsg: 'Room added' })
    if (!error) { setName(''); setFloor(''); setAdding(false) }
  }
  const itemsOf = (rid) => roomItems.filter((ri) => ri.room_id === rid)

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Rooms &amp; locations</div>
        {canEdit && <Btn icon="plus" style={{ padding: '7px 11px', fontSize: 12 }} onClick={() => setAdding((v) => !v)}>Add room</Btn>}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>Define each room and the item types installed there. Daily Progress picks its location from this list.</div>
      {adding && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input lang="en" style={{ ...inputStyle, flex: 1 }} placeholder="Room name (e.g. Classroom 101)" value={name} onChange={(e) => setName(e.target.value)} />
          <input lang="en" style={{ ...inputStyle, width: 90 }} placeholder="Floor" value={floor} onChange={(e) => setFloor(e.target.value)} />
          <Btn variant="primary" onClick={addRoom}>Save</Btn>
        </div>
      )}
      {rooms.length === 0 ? <Empty icon="buildings">No rooms defined yet.</Empty> : (
        <div className="ies-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {rooms.map((r) => (
            <div key={r.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'var(--bg)', color: 'var(--text-3)' }}>{r.floor || 'L0'}</span>
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.5px', color: 'var(--text-3)', margin: '8px 0 6px' }}>ITEM TYPES</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {itemsOf(r.id).length === 0 ? <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>None yet</span>
                  : itemsOf(r.id).map((ri) => <span key={ri.id} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: '#EFF6FF', color: '#2563EB' }}>{ri.scope?.sub_type || 'Item'}</span>)}
              </div>
              {canEdit && (
                <select value="" onChange={(e) => { if (e.target.value) { bgInsert('room_items', { room_id: r.id, scope_id: e.target.value }, { okMsg: 'Item type added' }) } }}
                  style={{ ...inputStyle, marginTop: 10, fontSize: 12, padding: '7px 9px', color: 'var(--text-3)' }}>
                  <option value="">+ Add item type</option>
                  {scopes.map((s) => <option key={s.id} value={s.id}>{s.sub_type}</option>)}
                </select>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

