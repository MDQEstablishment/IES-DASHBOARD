import { useState } from 'react'
import Icon from '../components/Icon'
import { Avatar, PageTitle, Loading, Empty } from '../components/ui'
import { useAuth } from '../rbac'
import { useLiveQuery } from '../lib/db'
import { ROLE_ORDER, ROSTER, roleTitle, roleColor } from '../lib/constants'
import { ROLE_NAV, NAV_CATALOG } from '../lib/nav'
import { fmtDateTime } from '../lib/format'
import { toast } from '../lib/toast'
import EquipmentCatalogs from '../components/EquipmentCatalogs'

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
  { key: 'audit', label: 'Audit Log' },
]

export default function Settings() {
  const { profile, role, user } = useAuth()
  const [cat, setCat] = useState('users')
  const [auditAction, setAuditAction] = useState('all')

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
      <PageTitle kicker="ADMINISTRATION" title="Settings" />

      {/* Your account */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Avatar name={profile?.full_name} color={roleColor(role)} size={40} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{profile?.full_name || '—'}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>{roleTitle(role)} · {user?.email || '—'}</div>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, color: '#A0762B', background: '#F5EEDF' }}>Your account</span>
      </div>

      {/* AI PDF extraction — monthly usage cap (PMO/admin) */}
      {showCap && (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>AI delivery-note extraction</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>PDF extractions used this calendar month. Resets on the 1st.</div>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 800, color: usedThisMonth >= PDF_CAP ? 'var(--bad)' : 'var(--text)' }}>
              {usedThisMonth} <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 600 }}>/ {PDF_CAP}</span>
            </div>
          </div>
          <div style={{ height: 7, borderRadius: 4, background: '#EDEAE0', overflow: 'hidden', marginTop: 10 }}>
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
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Users</div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>
                Org-wide directory. Role edits, password resets and archiving are managed server-side and gated by RLS — peers and seniors are protected.
              </div>
              {peopleLoading ? <Loading /> : people.length === 0 ? <Empty icon="settings">No profiles visible.</Empty> : (
                <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
                  <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10.5, fontFamily: 'var(--mono)' }}>
                    <th style={{ padding: '9px 8px', fontWeight: 600 }}>USER</th>
                    <th style={{ padding: '9px 8px', fontWeight: 600 }}>ROLE</th>
                    <th style={{ padding: '9px 8px', fontWeight: 600 }}>EMAIL</th>
                    <th style={{ padding: '9px 8px', fontWeight: 600 }}>REPORTS TO</th>
                    <th style={{ padding: '9px 8px', fontWeight: 600 }} title="Projects this user is assigned to as Project Manager (PM) or Project Engineer (Eng)">ASSIGNED TO</th>
                    <th style={{ padding: '9px 8px', fontWeight: 600 }}>STATUS</th>
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
                                {assignedByUser[u.id].map((c) => <span key={c} style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 6, color: '#A0762B', background: '#F5EEDF' }}>{c}</span>)}
                              </span>}
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          {u.archived
                            ? <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, color: '#A39D8E', background: '#F0EDE4' }}>archived</span>
                            : <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, color: '#1D6A49', background: '#E9F3EE' }}>active</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </div>
          )}

          {cat === 'roles' && (
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Roles &amp; Permissions</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>
                Access is role-driven and enforced server-side via row-level security. The areas below are illustrative — there is no per-user editor.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ROLE_ORDER.map((r) => {
                  const access = ROLE_ACCESS[r] || []
                  return (
                    <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--line)', borderRadius: 10, padding: '11px 13px', flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 9, width: 200 }}>
                        <Avatar name={ROSTER[r]?.name} color={roleColor(r)} size={28} />
                        <span>
                          <span style={{ display: 'block', fontWeight: 700, fontSize: 13 }}>{roleTitle(r)}{r === role && <span style={{ marginLeft: 6, fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 5, color: '#A0762B', background: '#F5EEDF' }}>you</span>}</span>
                          <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--text-3)' }}>{ROLE_DESC[r]}</span>
                        </span>
                      </span>
                      <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 }}>
                        {NAV_IDS.map((area) => {
                          const ok = access.includes(area)
                          return (
                            <span key={area} title={areaLabel(area)}
                              style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, fontWeight: 600,
                                background: ok ? '#F5EEDF' : 'var(--bg)', color: ok ? '#A0762B' : '#C9C3B4',
                                border: '1px solid ' + (ok ? '#EFE3C8' : 'var(--line)'), display: 'inline-flex', alignItems: 'center', gap: 4 }}>
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

          {cat === 'audit' && (
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Audit Log</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)' }}>last {audit?.length || 0} events</span>
                  <button onClick={() => exportAuditCsv(filteredAudit)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, padding: '6px 11px', borderRadius: 7, border: '1px solid var(--line)', background: '#fff', color: 'var(--text)' }}><Icon name="upload" size={13} />Export CSV</button>
                </div>
              </div>
              {/* action filter chips (dc auditFilters) */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {['all', 'insert', 'update', 'delete', 'login', 'logout', 'export'].map((a) => {
                  const active = auditAction === a
                  return (
                    <button key={a} onClick={() => setAuditAction(a)} style={{
                      padding: '4px 11px', borderRadius: 20, fontSize: 11.5, fontWeight: 600, textTransform: 'capitalize',
                      border: '1px solid ' + (active ? 'var(--accent)' : 'var(--line)'), background: active ? '#F5EEDF' : '#fff', color: active ? 'var(--accent)' : 'var(--text-3)',
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
                    <th style={{ padding: 8, fontWeight: 600 }}>TIME</th>
                    <th style={{ padding: 8, fontWeight: 600 }}>ACTOR</th>
                    <th style={{ padding: 8, fontWeight: 600 }}>ACTION</th>
                    <th style={{ padding: 8, fontWeight: 600 }}>ENTITY</th>
                    <th style={{ padding: 8, fontWeight: 600 }}>SUMMARY</th>
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
    </div>
  )
}

// CSV export of the (filtered) audit log — client-side, no server round-trip.
function exportAuditCsv(rows) {
  if (!rows || rows.length === 0) { toast('Nothing to export', 'err'); return }
  const cols = ['created_at', 'actor_name', 'actor_role', 'action', 'entity_type', 'record_id', 'summary']
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `ies-audit-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  toast('Audit log exported')
}
