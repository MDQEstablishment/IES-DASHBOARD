import { PageHead, Card, Pill, Loading, Empty, Avatar } from '../components/ui'
import { useAuth, can } from '../rbac'
import { useLiveQuery } from '../lib/db'
import { ROLE_ORDER, ROSTER, roleTitle, roleGradient, PMO_ADMIN } from '../lib/constants'

export default function Settings() {
  const { profile, role, user } = useAuth()
  const { rows: people, loading } = useLiveQuery('profiles',
    (q) => q.select('*,manager:profiles!profiles_manager_id_fkey(full_name)').order('full_name'))

  return (
    <>
      <PageHead kicker="Administration" title="Settings"
        sub={`Signed in as ${profile?.full_name} · ${roleTitle(role)}`} />

      <div className="grid mb-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Card title="Your account">
          <div className="flex center gap-3 mb-3">
            <Avatar name={profile?.full_name} gradient={roleGradient(role)} size={44} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{profile?.full_name}</div>
              <div className="muted" style={{ fontSize: 12 }}>{roleTitle(role)} · {role}</div>
            </div>
          </div>
          <div className="col gap-2" style={{ fontSize: 12.5 }}>
            <div className="flex between"><span className="muted">Email</span><span className="num">{user?.email}</span></div>
            <div className="flex between"><span className="muted">Role code</span><span className="num">{role}</span></div>
            <div className="flex between"><span className="muted">User ID</span><span className="num muted" style={{ fontSize: 10 }}>{user?.id?.slice(0, 8)}…</span></div>
          </div>
        </Card>

        <Card title="Role legend" meta="9 roles">
          <div className="col gap-2">
            {ROLE_ORDER.map((r) => (
              <div key={r} className="flex center gap-2" style={{ fontSize: 12 }}>
                <Avatar name={ROSTER[r].name} gradient={roleGradient(r)} size={22} />
                <span style={{ width: 56 }} className="num muted">{r}</span>
                <span>{roleTitle(r)}</span>
                {r === role && <span className="pill pill-blue" style={{ marginLeft: 'auto' }}>you</span>}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Team roster" meta="org-wide directory" pad={false}>
        {loading ? <Loading /> : people.length === 0 ? <Empty icon="Users">No profiles.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Name</th><th>Role</th><th>Title</th><th>Reports to</th><th>Status</th></tr></thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td><div className="flex center gap-2"><Avatar name={p.full_name} gradient={roleGradient(p.role)} size={22} />{p.full_name}</div></td>
                  <td className="num muted">{p.role}</td>
                  <td>{roleTitle(p.role)}</td>
                  <td className="muted">{p.manager?.full_name || '—'}</td>
                  <td>{p.archived ? <span className="pill pill-gray">archived</span> : <span className="pill pill-green">active</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="card" style={{ marginTop: 16, padding: 16 }}>
        <div className="card-meta mb-2">About this preview</div>
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          IES Programme Control Platform · React + Supabase · MOI-Asir demo programme.
          All data is illustrative. Row-level security is enforced server-side per role —
          what you can see and change here depends on who you're signed in as.
          Switch roles from the sidebar to compare access.
        </div>
      </div>
    </>
  )
}
