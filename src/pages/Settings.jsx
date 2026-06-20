import { useState } from 'react'
import Icon from '../components/Icon'
import { Avatar, PageTitle, Loading, Empty } from '../components/ui'
import { useAuth } from '../rbac'
import { useLiveQuery } from '../lib/db'
import { ROLE_ORDER, ROSTER, roleTitle, roleColor } from '../lib/constants'
import { fmtDateTime } from '../lib/format'

// Illustrative nav-area access per role (read-only display; not persisted).
const NAV_AREAS = ['Daily', 'Dashboard', 'Projects', 'Buildings', 'Install', 'Tasks', 'Escalations', 'Docs', 'Materials', 'Settings']
const ROLE_ACCESS = {
  ceo:   ['Daily', 'Dashboard', 'Projects', 'Buildings', 'Install', 'Tasks', 'Escalations', 'Docs', 'Materials'],
  pmo:   NAV_AREAS,
  procm: ['Daily', 'Dashboard', 'Projects', 'Buildings', 'Tasks', 'Docs', 'Materials'],
  proco: ['Daily', 'Dashboard', 'Tasks', 'Materials'],
  progm: ['Daily', 'Dashboard', 'Projects', 'Buildings', 'Install', 'Tasks', 'Escalations', 'Docs', 'Materials'],
  projm: ['Daily', 'Dashboard', 'Projects', 'Buildings', 'Install', 'Tasks', 'Escalations', 'Docs', 'Materials'],
  proje: ['Daily', 'Dashboard', 'Buildings', 'Install', 'Tasks', 'Escalations', 'Docs'],
  plane: ['Daily', 'Dashboard', 'Projects', 'Buildings', 'Tasks', 'Docs'],
  admin: ['Settings'],
}
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
  { key: 'audit', label: 'Audit Log' },
]

export default function Settings() {
  const { profile, role, user } = useAuth()
  const [cat, setCat] = useState('users')

  const { rows: people, loading: peopleLoading } = useLiveQuery('profiles',
    (q) => q.select('*,manager:profiles!profiles_manager_id_fkey(full_name)').order('full_name'))

  const { rows: audit, loading: auditLoading } = useLiveQuery('audit_log',
    (q) => q.select('*').order('created_at', { ascending: false }).limit(50))

  return (
    <div data-screen-label="Settings">
      <PageTitle kicker="ADMINISTRATION" title="Settings" />

      {/* Your account */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Avatar name={profile?.full_name} color={roleColor(role)} size={40} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{profile?.full_name || '—'}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>{roleTitle(role)} · {user?.email || '—'}</div>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, color: '#2563EB', background: '#EFF6FF' }}>Your account</span>
      </div>

      <div className="ies-set2" style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, alignItems: 'start' }}>
        {/* Category rail */}
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {CATS.map((c) => {
            const active = cat === c.key
            return (
              <button key={c.key} onClick={() => setCat(c.key)}
                style={{ textAlign: 'left', padding: '9px 12px', borderRadius: 8, fontSize: 13, fontWeight: active ? 700 : 500, color: active ? 'var(--accent)' : 'var(--text)', background: active ? '#EFF6FF' : 'transparent' }}>
                {c.label}
              </button>
            )
          })}
        </div>

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
                        <td style={{ padding: '10px 8px', color: 'var(--text-3)' }}>{u.manager?.full_name || '—'}</td>
                        <td style={{ padding: '10px 8px' }}>
                          {u.archived
                            ? <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, color: '#94A3B8', background: '#F1F5F9' }}>archived</span>
                            : <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, color: '#059669', background: '#ECFDF5' }}>active</span>}
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
                          <span style={{ display: 'block', fontWeight: 700, fontSize: 13 }}>{roleTitle(r)}{r === role && <span style={{ marginLeft: 6, fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 5, color: '#2563EB', background: '#EFF6FF' }}>you</span>}</span>
                          <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--text-3)' }}>{ROLE_DESC[r]}</span>
                        </span>
                      </span>
                      <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 }}>
                        {NAV_AREAS.map((area) => {
                          const ok = access.includes(area)
                          return (
                            <span key={area} title={area}
                              style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, fontWeight: 600,
                                background: ok ? '#EFF6FF' : 'var(--bg)', color: ok ? '#2563EB' : '#CBD5E1',
                                border: '1px solid ' + (ok ? '#DBEAFE' : 'var(--line)'), display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              {ok && <Icon name="check" size={11} />}{area}
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

          {cat === 'audit' && (
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Audit Log</div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)' }}>last {audit?.length || 0} events</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>
                Append-only record of write actions across the programme.
              </div>
              {auditLoading ? <Loading /> : (!audit || audit.length === 0) ? (
                <Empty icon="settings">Audit log is visible to PMO and CEO only.</Empty>
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
                    {audit.map((a) => (
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
