import { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import Icon from './Icon'
import { Avatar } from './ui'
import { ROLE_ORDER, ROSTER, DEMO_MODE, roleColor, roleTitle } from '../lib/constants'
import { navForRole, crumbsFor } from '../lib/nav'
import { useAuth } from '../rbac'
import { useBreadcrumb } from '../breadcrumbs'
import { useLiveQuery, bgUpdate } from '../lib/db'
import { fmtClock, ago } from '../lib/format'
import GlobalSearch from './GlobalSearch'
import BuildWatcher from './BuildWatcher'
import MurshidLauncher from './murshid/MurshidLauncher'

// 8W/9G(3) — the top-bar bell. Seven kinds of notification now arrive here:
// the chat @mention from 0088, plus the six task/escalation lifecycle events
// from 0104. Each row states what actually happened and deep-links to the page
// AND the tab that holds it, then marks itself read.
//
// The tab is derived from the type rather than searched for, because the
// recipient is decided by the type: you are notified about a task assignment as
// the assignee (Mine), and about it being blocked or done as the person who
// raised it (Delegated).
const NOTIF_COPY = {
  mention: { text: (n) => `mentioned you${n.building?.code ? ` · ${n.building.code}` : ''}` },
  task_assigned: { text: () => 'assigned you a task', to: '/tasks', tab: 'mine' },
  task_blocked: { text: () => 'blocked a task you raised', to: '/tasks', tab: 'delegated' },
  task_done: { text: () => 'completed a task you raised', to: '/tasks', tab: 'delegated' },
  escalation_raised: { text: () => 'escalated something to you', to: '/escalations', tab: 'tome' },
  escalation_acknowledged: { text: () => 'acknowledged your escalation', to: '/escalations', tab: 'mine' },
  escalation_resolved: { text: () => 'resolved your escalation', to: '/escalations', tab: 'mine' },
}

function NotifBell() {
  const { profile } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const { rows: notifs, refetch } = useLiveQuery('notifications', (q) =>
    q.select('*, actor:profiles!notifications_actor_id_fkey(full_name), building:buildings!notifications_building_id_fkey(code)')
      .eq('recipient_id', profile?.id || '00000000-0000-0000-0000-000000000000')
      .order('created_at', { ascending: false }).limit(20), [profile?.id])
  useEffect(() => { const t = setInterval(() => refetch?.(), 60000); return () => clearInterval(t) }, [refetch])
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const unread = notifs.filter((n) => !n.read_at).length

  const openOne = async (n) => {
    setOpen(false)
    if (!n.read_at) { await bgUpdate('notifications', n.id, { read_at: new Date().toISOString() }); refetch?.() }
    const c = NOTIF_COPY[n.type]
    if (c?.to) {
      nav(c.to, { state: { focusTab: c.tab, focusTask: n.task_id || null, focusEscalation: n.escalation_id || null } })
    } else if (n.project_id && n.building_id) {
      nav(`/projects/${n.project_id}/buildings/${n.building_id}`)
    }
  }
  const markAll = async () => {
    await Promise.all(notifs.filter((n) => !n.read_at).map((n) => bgUpdate('notifications', n.id, { read_at: new Date().toISOString() })))
    refetch?.()
  }

  return (
    <div ref={ref}>
      <button className="ies-hover" onClick={() => setOpen((o) => !o)} title="Notifications"
        style={{ position: 'relative', width: 36, height: 36, borderRadius: 'var(--radius-s)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)' }}>
        <Icon name="bell" size={18} />
        {unread > 0 && <span style={{ position: 'absolute', top: 4, right: 4, minWidth: 15, height: 15, padding: '0 3px', borderRadius: 999, background: 'var(--accent)', color: 'var(--surface-1)', fontSize: 9.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unread > 9 ? '9+' : unread}</span>}
      </button>
      {/* 9J — the notifications + activity right panel. Same rows, same
          mark-read handler, same deep links as the old dropdown; only the
          container changed from a popover to a slide-over. */}
      {open && <div onMouseDown={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(28,28,28,.28)', zIndex: 190 }} />}
      {open && (
        <aside style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 360, maxWidth: '100vw', background: 'var(--surface-1)', boxShadow: 'var(--shadow-2)', zIndex: 200, display: 'flex', flexDirection: 'column', animation: 'iesSlideR .18s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>Notifications</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {unread > 0 && <button onClick={markAll} style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>Mark all read</button>}
              <button className="ies-hover" onClick={() => setOpen(false)} style={{ width: 30, height: 30, borderRadius: 'var(--radius-s)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}><Icon name="x" size={17} /></button>
            </div>
          </div>
          <div style={{ padding: 10, overflowY: 'auto', flex: 1 }}>
            {notifs.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, padding: '28px 8px' }}>No notifications</div>
            ) : notifs.map((n) => (
              <button key={n.id} className="ies-row-hover" onClick={() => openOne(n)} style={{ width: '100%', display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 'var(--radius-m)', textAlign: 'left', background: n.read_at ? 'transparent' : 'var(--accent-tint)', marginBottom: 2 }}>
                <Avatar name={n.actor?.full_name} size={28} />
                <span style={{ lineHeight: 1.35, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13 }}>
                    <b style={{ fontWeight: 600 }}>{n.actor?.full_name || 'Someone'}</b>{' '}
                    {(NOTIF_COPY[n.type] || NOTIF_COPY.mention).text(n)}
                  </span>
                  {n.body_preview && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body_preview}</span>}
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{ago(n.created_at)}</span>
                </span>
              </button>
            ))}
            <ActivityFeed />
          </div>
        </aside>
      )}
    </div>
  )
}

// 9J — recent activity, read-only. The exact query the Dashboard already runs
// against audit_log; surfaced in the panel too because the SnowUI shell puts
// activity beside notifications. No new table, no new write, SELECT only.
function ActivityFeed() {
  const { rows } = useLiveQuery('audit_log', (q) =>
    q.select('id,actor_name,action,entity_type,summary,created_at').order('created_at', { ascending: false }).limit(6))
  if (!rows.length) return null
  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', padding: '0 12px 8px' }}>Recent activity</div>
      {rows.map((a) => (
        <div key={a.id} style={{ display: 'flex', gap: 10, padding: '8px 12px', lineHeight: 1.35 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--track)', marginTop: 6, flex: 'none' }} />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 12.5 }}>
              <b style={{ fontWeight: 600 }}>{a.actor_name || 'Someone'}</b> {a.action} {a.entity_type}
            </span>
            {a.summary && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.summary}</span>}
            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-faint)' }}>{ago(a.created_at)}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  return <div lang="en" className="ies-topmeta" style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-3)' }}>{fmtClock(now)}</div>
}

// 9J — nav GROUPS. This is presentation only: the ids, their order within the
// role's list, their labels, icons, routes and `end` matching all still come
// from navForRole()/NAV_CATALOG. A role that could not see Settings before
// still cannot; the group headings simply describe what is already there.
const NAV_GROUPS = [
  { label: 'Overview', ids: ['dashboard'] },
  { label: 'Programme', ids: ['projects', 'materials', 'reports'] },
  { label: 'My work', ids: ['tasks', 'escalation'] },
  { label: 'Admin', ids: ['settings'] },
]

export default function Shell() {
  const { profile, role, signInWithRole, signOut } = useAuth()
  const loc = useLocation()
  const { labels } = useBreadcrumb()
  const [roleMenu, setRoleMenu] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('ies.sidebar') === 'collapsed')
  const menuRef = useRef(null)

  useEffect(() => { setDrawer(false); setRoleMenu(false) }, [loc.pathname])
  useEffect(() => {
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setRoleMenu(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const toggleCollapse = () => setCollapsed((c) => { localStorage.setItem('ies.sidebar', c ? 'expanded' : 'collapsed'); return !c })

  const nav = navForRole(role)
  const crumbs = crumbsFor(loc.pathname, labels)
  const byId = Object.fromEntries(nav.map((n) => [n.id, n]))
  const groups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.ids.map((id) => byId[id]).filter(Boolean) }))
    .filter((g) => g.items.length)

  const navBtn = (n) => (
    <NavLink key={n.id} to={n.to} end={!!n.end} title={collapsed ? n.label : undefined}
      className="ies-nav-btn"
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 11, padding: collapsed ? '10px 0' : '9px 12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 'var(--radius-s)', fontSize: 13.5, whiteSpace: 'nowrap', position: 'relative',
        color: isActive ? 'var(--text)' : 'var(--side-text)',
        background: isActive ? 'var(--side-active)' : 'transparent',
        fontWeight: isActive ? 600 : 500, margin: '1px 0',
      })}>
      {({ isActive }) => (<>
        {isActive && <span style={{ position: 'absolute', left: 0, top: 7, bottom: 7, width: 3, borderRadius: 999, background: 'var(--accent)' }} />}
        <Icon name={n.icon} size={17} />
        {!collapsed && <span>{n.label}</span>}
      </>)}
    </NavLink>
  )

  return (
    <div className="ies-shell">
      <div className={'ies-scrim' + (drawer ? ' open' : '')} onClick={() => setDrawer(false)} />

      {/* ── sidebar ─────────────────────────────────────────────────────── */}
      <aside className={'ies-side' + (collapsed ? ' collapsed' : '') + (drawer ? ' open' : '')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '16px 0' : '16px 14px', justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {/* the navy survives only here, inside the mark */}
            <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-s)', background: 'var(--logo-navy)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--surface-1)', fontSize: 12, flex: 'none' }}>
              IES<span style={{ position: 'absolute', top: 3, right: 3, width: 5, height: 5, borderRadius: '50%', background: 'var(--brass-bright)' }} />
            </div>
            {!collapsed && <div style={{ lineHeight: 1.2, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>IES Control</div>
              <div style={{ color: 'var(--text-3)', fontSize: 11 }}>Retrofit</div>
            </div>}
          </Link>
        </div>

        <nav style={{ flex: 1, overflowY: 'auto', padding: collapsed ? '4px 10px' : '4px 12px' }}>
          {groups.map((g) => (
            <div key={g.label} style={{ marginBottom: 14 }}>
              {!collapsed && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-faint)', padding: '0 12px 4px' }}>{g.label}</div>}
              {g.items.map(navBtn)}
            </div>
          ))}
        </nav>

        {/* user block, bottom — the same menu that used to hang off the top bar */}
        <div ref={menuRef} style={{ position: 'relative', borderTop: '1px solid var(--line)', padding: collapsed ? 10 : 12 }}>
          <button className="ies-hover" onClick={() => setRoleMenu((o) => !o)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? 0 : '6px 8px', borderRadius: 'var(--radius-s)', justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <Avatar name={profile?.full_name} color={roleColor(role)} size={30} />
            {!collapsed && <>
              <span style={{ lineHeight: 1.25, textAlign: 'left', minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontWeight: 600, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile?.full_name || '—'}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>{roleTitle(role)}</span>
              </span>
              <span style={{ color: 'var(--text-3)' }}><Icon name="chevron" size={13} /></span>
            </>}
          </button>
          {roleMenu && (
            <div style={{ position: 'absolute', left: 10, right: 10, bottom: 62, background: 'var(--surface-1)', borderRadius: 'var(--radius-m)', boxShadow: 'var(--shadow-2)', padding: 8, zIndex: 200, maxHeight: '60vh', overflowY: 'auto' }}>
              {/* Role switching is a demo-only affordance (DEMO_MODE) — in a
                  production build the menu is just the signed-in card + Sign out. */}
              {DEMO_MODE && (<>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', padding: '6px 10px 8px' }}>Switch demo role</div>
                {ROLE_ORDER.map((r) => (
                  <button key={r} className="ies-row-hover" onClick={() => { setRoleMenu(false); signInWithRole(r) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--radius-s)', textAlign: 'left', background: r === role ? 'var(--accent-tint)' : 'transparent' }}>
                    <Avatar name={ROSTER[r].name} color={roleColor(r)} size={26} />
                    <span style={{ lineHeight: 1.25 }}><span style={{ display: 'block', fontWeight: 600, fontSize: 12.5 }}>{roleTitle(r)}</span><span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>{ROSTER[r].name}</span></span>
                    {r === role && <span style={{ marginLeft: 'auto', color: 'var(--accent)' }}><Icon name="check" size={15} /></span>}
                  </button>
                ))}
                <div style={{ height: 1, background: 'var(--line)', margin: '8px 4px' }} />
              </>)}
              <button className="ies-hover" onClick={() => { setRoleMenu(false); signOut() }} style={{ width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 'var(--radius-s)', fontSize: 13, color: 'var(--bad)', fontWeight: 600 }}>Sign out</button>
            </div>
          )}
        </div>
      </aside>

      {/* ── main column ─────────────────────────────────────────────────── */}
      <div className={'ies-main' + (collapsed ? ' collapsed' : '')}>
        <header style={{ height: 56, background: 'var(--surface-1)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px', position: 'sticky', top: 0, zIndex: 120 }}>
          <button className="ies-hamburger ies-hover" onClick={() => setDrawer((d) => !d)} style={{ width: 34, height: 34, borderRadius: 'var(--radius-s)', color: 'var(--text-2)', alignItems: 'center', justifyContent: 'center' }}><Icon name="menu" size={18} /></button>
          <button className="ies-hover ies-topmeta" onClick={toggleCollapse} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{ width: 34, height: 34, borderRadius: 'var(--radius-s)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}><Icon name="menu" size={17} /></button>

          {/* nested breadcrumb — each non-terminal crumb is a deep link */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-3)', flexWrap: 'wrap', minWidth: 0 }}>
            {crumbs.map((c, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                {c.to && !c.active
                  ? <Link to={c.to} className="ies-crumb" style={{ whiteSpace: 'nowrap', color: 'var(--text-3)', fontWeight: 500 }}>{c.label}</Link>
                  : <span style={{ whiteSpace: 'nowrap', color: c.active ? 'var(--text)' : 'var(--text-3)', fontWeight: c.active ? 600 : 500 }}>{c.label}</span>}
                {i < crumbs.length - 1 && <span style={{ color: 'var(--text-faint)' }}>›</span>}
              </span>
            ))}
          </div>

          {/* 9Q(2) — global search. Sits BEFORE the marginLeft:auto group so the
              Live indicator, the Clock and the NotifBell keep their positions
              and their order; it takes the slack the breadcrumb leaves. */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <GlobalSearch />
            <div className="ies-topmeta" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--live)' }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--live)', animation: 'iesBlink 1.6s infinite' }} />Live</div>
            <Clock />
            <NotifBell />
          </div>
        </header>

        <main className="ies-content" style={{ padding: '24px 24px 40px', maxWidth: 1320, margin: '0 auto' }}>
          <Outlet />
        </main>
      </div>
      <BuildWatcher />
      {/* 9L — مُرشد rides the shell, so it is present on every routed page
          without any page importing it. It reads the page's own
          data-screen-label from the DOM; nothing is passed down. */}
      <MurshidLauncher collapsed={collapsed} />
    </div>
  )
}
