import { useState } from 'react'
import Icon from '../components/Icon'
import { Avatar, PageTitle, Loading, Empty, Btn, Modal, Field, inputStyle } from '../components/ui'
import { useAuth } from '../rbac'
import { useLiveQuery, downloadBlob, bgUpdate } from '../lib/db'
import { ROLE_ORDER, ROSTER, roleTitle, roleColor, FEATURES, canManageRole } from '../lib/constants'
import { ROLE_NAV, NAV_CATALOG } from '../lib/nav'
import { fmtDateTime, num, localToday } from '../lib/format'
import { toast } from '../lib/toast'
import EquipmentCatalogs from '../components/EquipmentCatalogs'
import SavingSheetTemplate from '../components/SavingSheetTemplate'
import AiUsageMeter from '../components/AiUsageMeter'
import ReportTemplate from '../components/ReportTemplate'

// Permission matrix reflects the REAL RBAC nav map (lib/nav roleNav), read-only.
const NAV_IDS = ['dashboard', 'projects', 'materials', 'tasks', 'escalation', 'reports', 'settings']
const areaLabel = (id) => NAV_CATALOG[id]?.label || id
const ROLE_ACCESS = Object.fromEntries(ROLE_ORDER.map((r) => [r, ROLE_NAV[r] || []]))
const ROLE_DESC = {
  ceo: 'Portfolio-wide read access · no settings or write actions',
  pmo: 'Full control across the whole programme · admin & audit',
  procm: 'Materials & procurement, team tasks',
  proco: 'Own procurement tasks & material movements only',
  progm: 'All projects · scheduling, delivery & field execution',
  projm: 'Own project end-to-end · install, QA, escalations',
  proje: 'Own project · field execution & install logging',
  plane: 'Schedule, progress & delay analysis',
  admin: 'User administration & system settings',
}

const CATS = [
  { key: 'users', label: 'Users' },
  { key: 'roles', label: 'Roles & Permissions' },
  { key: 'catalogs', label: 'Approved Equipment' },
  // 9E — parked with the Saving Sheet feature; the catalogs tab above stays
  // because the survey's old-unit picker reads the same imported registry
  ...(FEATURES.savingSheet ? [{ key: 'template', label: 'Saving Sheet Template' }] : []),
  { key: 'report', label: 'Report Template' },
  { key: 'audit', label: 'Audit Log' },
]

export default function Settings() {
  const { profile, role, user } = useAuth()
  const [cat, setCat] = useState('users')
  const [auditAction, setAuditAction] = useState('all')
  const [editing, setEditing] = useState(null)
  const canAdminUsers = ['pmo', 'admin'].includes(role)

  // Plain select — the self-referential manager embed returns empty under RLS, so
  // resolve the manager's name client-side from the same roster.
  const { rows: people, loading: peopleLoading } = useLiveQuery('profiles',
    (q) => q.select('*').order('full_name'))
  const nameById = Object.fromEntries(people.map((p) => [p.id, p.full_name]))

  // "Currently assigned to" — project codes each user is PM/engineer for (1.7)
  const { rows: assignProjects } = useLiveQuery('projects', (q) => q.select('code,pm_id,engineer_id,status').neq('status', 'deleted').is('deleted_at', null))
  const assignedByUser = {}
  assignProjects.forEach((p) => {
    if (p.pm_id) (assignedByUser[p.pm_id] = assignedByUser[p.pm_id] || []).push(`${p.code} (PM)`)
    if (p.engineer_id) (assignedByUser[p.engineer_id] = assignedByUser[p.engineer_id] || []).push(`${p.code} (Eng)`)
  })

  const { rows: audit, loading: auditLoading } = useLiveQuery('audit_log',
    (q) => q.select('*').order('created_at', { ascending: false }).limit(50))
  const filteredAudit = audit.filter((a) => auditAction === 'all' || a.action === auditAction)

  // PDF extraction monthly cap counter (PMO/admin). RLS already restricts reads.
  const showCap = ['admin', 'pmo'].includes(role)
  const monthIso = new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1).toISOString()
  const { rows: extractRows } = useLiveQuery('pdf_extraction_log',
    (q) => q.select('id,success').gte('created_at', monthIso), [monthIso])
  const PDF_CAP = 1000, usedThisMonth = extractRows.length, capPct = Math.min(100, Math.round((usedThisMonth / PDF_CAP) * 100))

  return (
    <div data-screen-label="Settings">
      <PageTitle kicker="Administration" title="Settings" />

      {/* Your account */}
      <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Avatar name={profile?.full_name} color={roleColor(role)} size={40} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{profile?.full_name || '—'}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>{roleTitle(role)} · {user?.email || '—'}</div>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-s)', color: 'var(--accent)', background: 'var(--accent-tint)' }}>Your account</span>
      </div>

      {/* AI PDF extraction — monthly usage cap (PMO/admin) */}
      {showCap && (
        <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 14, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>AI delivery-note extraction</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>PDF extractions used this calendar month. Resets on the 1st.</div>
            </div>
            <div lang="en" dir="ltr" style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 800, color: usedThisMonth >= PDF_CAP ? 'var(--bad)' : 'var(--text)' }}>
              {num(usedThisMonth)} <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 600 }}>/ {num(PDF_CAP)}</span>
            </div>
          </div>
          <div style={{ height: 7, borderRadius: 4, background: 'var(--track)', overflow: 'hidden', marginTop: 10 }}>
            <div style={{ height: '100%', width: capPct + '%', background: usedThisMonth >= PDF_CAP ? 'var(--bad)' : 'var(--accent)' }} />
          </div>
          {usedThisMonth >= PDF_CAP && <div style={{ fontSize: 11.5, color: 'var(--bad)', marginTop: 6 }}>Monthly limit reached — extraction is paused until next month. Deliveries can still be entered manually.</div>}
        </div>
      )}

      {/* Horizontal category tabs (dc setCats) */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--line)', marginBottom: 16, flexWrap: 'wrap' }}>
        {CATS.map((c) => {
          const active = cat === c.key
          return (
            <button key={c.key} onClick={() => setCat(c.key)}
              style={{ padding: '10px 16px', fontSize: 13, fontWeight: active ? 700 : 500, color: active ? 'var(--accent)' : 'var(--text-3)', borderBottom: '2px solid ' + (active ? 'var(--accent)' : 'transparent'), marginBottom: -1, background: 'none' }}>
              {c.label}
            </button>
          )
        })}
      </div>

      <div>
        {/* Panel */}
        <div>
          {cat === 'users' && (
            <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Users</div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>
                Org-wide directory. {canAdminUsers
                  ? 'You can change the role and reporting line of anyone ranked below you, and archive them. Every rule below is enforced by the database, not just hidden here.'
                  : 'Read-only — role and reporting-line changes are made by the PMO or an administrator.'}
              </div>
              {peopleLoading ? <Loading /> : people.length === 0 ? <Empty icon="settings">No profiles visible.</Empty> : (
                <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
                  <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10.5, fontFamily: 'var(--mono)' }}>
                    <th style={{ padding: '9px 8px', fontWeight: 600 }}>User</th>
                    <th style={{ padding: '9px 8px', fontWeight: 600 }}>Role</th>
                    <th style={{ padding: '9px 8px', fontWeight: 600 }}>Email</th>
                    <th style={{ padding: '9px 8px', fontWeight: 600 }}>Reports to</th>
                    <th style={{ padding: '9px 8px', fontWeight: 600 }} title="Projects this user is assigned to as Project Manager (PM) or Project Engineer (Eng)">Assigned to</th>
                    <th style={{ padding: '9px 8px', fontWeight: 600 }}>Status</th>
                    {canAdminUsers && <th style={{ padding: '9px 8px', fontWeight: 600 }} />}
                  </tr></thead>
                  <tbody>
                    {people.map((u) => (
                      <tr key={u.id} style={{ borderTop: '1px solid var(--line)' }}>
                        <td style={{ padding: '10px 8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <Avatar name={u.full_name} color={roleColor(u.role)} size={28} />
                            <div style={{ fontWeight: 600 }}>{u.full_name}</div>
                          </div>
                        </td>
                        <td style={{ padding: '10px 8px', color: 'var(--text-3)' }}>{roleTitle(u.role)}</td>
                        <td style={{ padding: '10px 8px', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>{u.email}</td>
                        <td style={{ padding: '10px 8px', color: 'var(--text-3)' }}>{nameById[u.manager_id] || '—'}</td>
                        <td style={{ padding: '10px 8px' }}>
                          {(assignedByUser[u.id] || []).length === 0
                            ? <span style={{ color: 'var(--text-3)' }}>—</span>
                            : <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {assignedByUser[u.id].map((c) => <span key={c} style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--radius-s)', color: 'var(--accent)', background: 'var(--accent-tint)' }}>{c}</span>)}
                              </span>}
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          {u.archived
                            ? <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-s)', color: 'var(--text-faint)', background: 'var(--line-soft)' }}>archived</span>
                            : <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-s)', color: 'var(--ok-deep)', background: 'var(--ok-bg)' }}>active</span>}
                        </td>
                        {canAdminUsers && (
                          <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                            {/* Mirrors profiles_guard(): you cannot edit yourself or anyone at or above your rank. */}
                            {u.id !== profile?.id && canManageRole(role, u.role) && (
                              <button onClick={() => setEditing(u)} style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-s)', border: '1px solid var(--line)', background: 'var(--surface-1)', color: 'var(--accent)', cursor: 'pointer' }}>Edit</button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </div>
          )}

          {cat === 'roles' && (
            <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Roles &amp; Permissions</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>
                Access is role-driven and enforced server-side via row-level security. The areas below are illustrative — there is no per-user editor.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ROLE_ORDER.map((r) => {
                  const access = ROLE_ACCESS[r] || []
                  return (
                    <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--line)', borderRadius: 'var(--radius-m)', padding: '11px 13px', flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 9, width: 200 }}>
                        <Avatar name={ROSTER[r]?.name} color={roleColor(r)} size={28} />
                        <span>
                          <span style={{ display: 'block', fontWeight: 700, fontSize: 13 }}>{roleTitle(r)}{r === role && <span style={{ marginLeft: 6, fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-s)', color: 'var(--accent)', background: 'var(--accent-tint)' }}>you</span>}</span>
                          <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--text-3)' }}>{ROLE_DESC[r]}</span>
                        </span>
                      </span>
                      <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 }}>
                        {NAV_IDS.map((area) => {
                          const ok = access.includes(area)
                          return (
                            <span key={area} title={areaLabel(area)}
                              style={{ fontSize: 11, padding: '3px 9px', borderRadius: 'var(--radius-s)', fontWeight: 600,
                                background: ok ? 'var(--accent-tint)' : 'var(--bg)', color: ok ? 'var(--accent)' : 'var(--text-faint)',
                                border: '1px solid ' + (ok ? 'var(--warn-bg)' : 'var(--line)'), display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              {ok && <Icon name="check" size={11} />}{areaLabel(area)}
                            </span>
                          )
                        })}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {cat === 'catalogs' && <EquipmentCatalogs role={role} />}

          {FEATURES.savingSheet && cat === 'template' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SavingSheetTemplate role={role} />
              <AiUsageMeter role={role} />
            </div>
          )}

          {cat === 'report' && <ReportTemplate role={role} />}

          {cat === 'audit' && (
            <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Audit Log</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)' }}>last {audit?.length || 0} events</span>
                  <button onClick={() => exportAuditCsv(filteredAudit)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, padding: '6px 11px', borderRadius: 'var(--radius-s)', border: '1px solid var(--line)', background: 'var(--surface-1)', color: 'var(--text)' }}><Icon name="upload" size={13} />Export CSV</button>
                </div>
              </div>
              {/* action filter chips (dc auditFilters) */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {['all', 'insert', 'update', 'delete', 'login', 'logout', 'export'].map((a) => {
                  const active = auditAction === a
                  return (
                    <button key={a} onClick={() => setAuditAction(a)} style={{
                      padding: '4px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, textTransform: 'capitalize',
                      border: '1px solid ' + (active ? 'var(--accent)' : 'var(--line)'), background: active ? 'var(--accent-tint)' : 'var(--surface-1)', color: active ? 'var(--accent)' : 'var(--text-3)',
                    }}>{a}</button>
                  )
                })}
              </div>
              {auditLoading ? <Loading /> : (!audit || audit.length === 0) ? (
                <Empty icon="settings">Audit log is visible to PMO and CEO only.</Empty>
              ) : filteredAudit.length === 0 ? (
                <Empty icon="settings">No events match this filter.</Empty>
              ) : (
                <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 680 }}>
                  <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
                    <th style={{ padding: 8, fontWeight: 600 }}>Time</th>
                    <th style={{ padding: 8, fontWeight: 600 }}>Actor</th>
                    <th style={{ padding: 8, fontWeight: 600 }}>Action</th>
                    <th style={{ padding: 8, fontWeight: 600 }}>Entity</th>
                    <th style={{ padding: 8, fontWeight: 600 }}>Summary</th>
                  </tr></thead>
                  <tbody>
                    {filteredAudit.map((a) => (
                      <tr key={a.id} style={{ borderTop: '1px solid var(--line)' }}>
                        <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDateTime(a.created_at)}</td>
                        <td style={{ padding: '9px 8px' }}>
                          {('actor_name' in a || 'actor_role' in a) ? (
                            <>
                              <div style={{ fontWeight: 600, fontSize: 11.5 }}>{a.actor_name || '—'}</div>
                              <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--text-3)' }}>
                                {[a.actor_role && roleTitle(a.actor_role), a.ip].filter(Boolean).join(' · ') || '—'}
                              </div>
                            </>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--accent)' }}>{a.action || '—'}</td>
                        <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>
                          {[a.entity_type, a.record_id && String(a.record_id).slice(0, 8)].filter(Boolean).join(':') || '—'}
                        </td>
                        <td style={{ padding: '9px 8px', color: 'var(--text-3)' }}>{a.summary || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <UserEditor u={editing} myRole={role} people={people} nameById={nameById}
          onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

// 9G(4) — the user administration editor. Every constraint here has a matching
// exception in profiles_guard(); the UI only decides what is worth offering, and
// the database refuses anything that slips through.
function UserEditor({ u, myRole, people, nameById, onClose }) {
  const [role, setRole] = useState(u.role)
  const [managerId, setManagerId] = useState(u.manager_id || '')
  const [busy, setBusy] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)

  // Only roles below mine. admin can grant anything.
  const grantable = ROLE_ORDER.filter((r) => canManageRole(myRole, r))

  // A manager cannot be this person, anyone reporting (directly or indirectly)
  // to them, or an archived account — the same three cases the trigger rejects.
  const descendants = (() => {
    const kids = new Map()
    people.forEach((p) => {
      const k = p.manager_id || ''
      if (!kids.has(k)) kids.set(k, [])
      kids.get(k).push(p.id)
    })
    const out = new Set()
    const walk = (id) => (kids.get(id) || []).forEach((c) => { if (!out.has(c)) { out.add(c); walk(c) } })
    walk(u.id)
    return out
  })()
  const managerOptions = people.filter((p) => p.id !== u.id && !p.archived && !descendants.has(p.id))

  const dirty = role !== u.role || (managerId || null) !== (u.manager_id || null)

  const save = async () => {
    setBusy(true)
    const { error } = await bgUpdate('profiles', u.id,
      { role, manager_id: managerId || null }, { okMsg: `${u.full_name} updated` })
    setBusy(false)
    if (!error) onClose()
  }

  const archive = async () => {
    setBusy(true)
    const { error } = await bgUpdate('profiles', u.id, { archived: true },
      { okMsg: `${u.full_name} archived — their open work was handed over` })
    setBusy(false)
    if (!error) onClose()
  }

  return (
    <Modal open title={`Edit ${u.full_name}`} onClose={onClose}
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save changes'}</Btn>
      </>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Avatar name={u.full_name} color={roleColor(u.role)} size={34} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{u.full_name}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>{u.email}</div>
        </div>
      </div>

      <Field label="Role">
        <select style={inputStyle} value={role} onChange={(e) => setRole(e.target.value)}>
          {!grantable.includes(u.role) && <option value={u.role}>{roleTitle(u.role)} (current)</option>}
          {grantable.map((r) => <option key={r} value={r}>{roleTitle(r)}</option>)}
        </select>
      </Field>

      <Field label="Reports to">
        <select style={inputStyle} value={managerId} onChange={(e) => setManagerId(e.target.value)}>
          <option value="">Nobody — top of the chain</option>
          {managerOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name} · {roleTitle(p.role)}</option>
          ))}
        </select>
      </Field>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: -6, marginBottom: 14 }}>
        {descendants.size > 0
          ? `${descendants.size} ${descendants.size === 1 ? 'person reports' : 'people report'} to ${u.full_name}, so they cannot be listed above — that would create a loop.`
          : 'Nobody reports to this person yet.'}
        {u.manager_id ? ` Currently: ${nameById[u.manager_id] || '—'}.` : ''}
      </div>

      {!u.archived && (
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          {!confirmArchive ? (
            <button onClick={() => setConfirmArchive(true)} style={{ fontSize: 12, fontWeight: 700, color: 'var(--bad)', cursor: 'pointer' }}>
              Archive this person…
            </button>
          ) : (
            <div style={{ background: 'var(--bad-bg)', border: '1px solid var(--bad-bg)', borderRadius: 'var(--radius-s)', padding: 12 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--bad-deep)', marginBottom: 6 }}>Archive {u.full_name}?</div>
              <div style={{ fontSize: 12, color: 'var(--bad-deep)', lineHeight: 1.5, marginBottom: 10 }}>
                They lose access immediately, and the database hands their work over in the same
                transaction: anyone reporting to them moves up to {nameById[u.manager_id] || 'nobody'},
                their open tasks are reassigned there, and any escalation still waiting on them is
                re-routed there so it can still be answered. Nothing is deleted. This cannot be
                undone from this screen.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn onClick={() => setConfirmArchive(false)}>Keep active</Btn>
                <Btn variant="primary" onClick={archive} disabled={busy}>{busy ? 'Archiving…' : 'Archive and hand over'}</Btn>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

// CSV export of the (filtered) audit log — client-side, no server round-trip.
function exportAuditCsv(rows) {
  if (!rows || rows.length === 0) { toast('Nothing to export', 'err'); return }
  const cols = ['created_at', 'actor_name', 'actor_role', 'action', 'entity_type', 'record_id', 'summary']
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  downloadBlob(blob, `ies-audit-${localToday()}.csv`)
  toast('Audit log exported')
}
