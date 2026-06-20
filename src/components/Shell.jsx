import { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, useLocation, matchPath } from 'react-router-dom'
import Icon from './Icon'
import { Avatar } from './ui'
import { NAV, ROLE_ORDER, ROSTER, roleColor, roleTitle } from '../lib/constants'
import { useAuth } from '../rbac'
import { initials } from '../lib/format'

function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const p = (x) => String(x).padStart(2, '0')
  const s = `${days[now.getDay()]} ${p(now.getDate())} ${M[now.getMonth()]} · ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`
  return <div className="ies-topmeta" style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#94A3B8' }}>{s}</div>
}

export default function Shell() {
  const { profile, role, signInWithRole, signOut } = useAuth()
  const loc = useLocation()
  const [roleMenu, setRoleMenu] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => { setDrawer(false); setRoleMenu(false) }, [loc.pathname])
  useEffect(() => {
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setRoleMenu(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const pageLabel = matchPath('/projects/:id', loc.pathname) ? 'Project Detail'
    : (NAV.find((n) => (n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to)))?.label || 'Dashboard')
  const crumbs = ['IES', 'Retrofit', pageLabel]

  const navBtn = (n, big = false) => (
    <NavLink key={n.to} to={n.to} end={n.to === '/'}
      className="ies-nav-btn"
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: big ? 11 : 7, padding: big ? '11px 12px' : '8px 12px',
        borderRadius: 8, fontSize: big ? 14 : 13, whiteSpace: 'nowrap', position: 'relative',
        color: isActive ? '#fff' : '#94A3B8', background: isActive ? '#1E293B' : 'transparent', fontWeight: isActive ? 700 : 500,
        width: big ? '100%' : 'auto', textAlign: 'left',
      })}>
      <Icon name={n.icon} size={16} /><span>{n.label}</span>
    </NavLink>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* preview strip */}
      <div style={{ background: '#0F172A', borderBottom: '1px solid #1E293B', color: '#FCD34D', fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '2px', textAlign: 'center', padding: '4px 12px' }}>
        PREVIEW · DEMO DATA ONLY · NOT FOR PRODUCTION
      </div>

      {/* top header */}
      <header style={{ height: 58, background: 'var(--nav-bg)', display: 'flex', alignItems: 'center', gap: 18, padding: '0 18px', position: 'sticky', top: 0, zIndex: 120 }}>
        <button className="ies-hamburger ies-hover" onClick={() => setDrawer((d) => !d)} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #334155', color: '#E2E8F0', alignItems: 'center', justifyContent: 'center' }}><Icon name="menu" size={18} /></button>
        <NavLink to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#1E293B', border: '1px solid #334155', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontWeight: 700, color: '#fff', fontSize: 11 }}>IES<span style={{ position: 'absolute', top: 4, right: 4, width: 5, height: 5, borderRadius: '50%', background: '#F59E0B' }} /></div>
          <div style={{ lineHeight: 1.1 }}><div style={{ color: '#fff', fontWeight: 700, fontSize: 13.5 }}>IES Control</div><div style={{ color: '#64748B', fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '1.5px' }}>RETROFIT · v2</div></div>
        </NavLink>
        <nav className="ies-topnav-items" style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 8 }}>
          {NAV.map((n) => navBtn(n))}
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="ies-topmeta" style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ok)' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ok)', animation: 'iesBlink 1.6s infinite' }} />LIVE</div>
          <Clock />
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button className="ies-hover" onClick={() => setRoleMenu((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 8px 4px 4px', borderRadius: 9, border: '1px solid #334155' }}>
              <Avatar name={profile?.full_name} color={roleColor(role)} size={28} />
              <span className="ies-topmeta" style={{ lineHeight: 1.15, textAlign: 'left' }}>
                <span style={{ display: 'block', fontWeight: 600, fontSize: 12, color: '#E2E8F0' }}>{profile?.full_name || '—'}</span>
                <span style={{ display: 'block', fontSize: 10, color: '#64748B', fontFamily: 'var(--mono)' }}>{roleTitle(role)}</span>
              </span>
              <span style={{ color: '#94A3B8' }}><Icon name="chevron" size={15} /></span>
            </button>
            {roleMenu && (
              <div style={{ position: 'absolute', right: 0, top: 44, width: 280, background: '#fff', border: '1px solid var(--line)', borderRadius: 12, boxShadow: '0 12px 32px rgba(15,23,42,.16)', padding: 8, zIndex: 200 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1.5px', color: 'var(--text-3)', padding: '6px 10px 8px' }}>SWITCH DEMO ROLE</div>
                {ROLE_ORDER.map((r) => (
                  <button key={r} className="ies-row-hover" onClick={() => { setRoleMenu(false); signInWithRole(r) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, textAlign: 'left', background: r === role ? '#EFF6FF' : 'transparent' }}>
                    <Avatar name={ROSTER[r].name} color={roleColor(r)} size={26} />
                    <span style={{ lineHeight: 1.2 }}><span style={{ display: 'block', fontWeight: 600, fontSize: 12.5 }}>{roleTitle(r)}</span><span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-3)' }}>{ROSTER[r].name}</span></span>
                    {r === role && <span style={{ marginLeft: 'auto', color: 'var(--accent)' }}><Icon name="check" size={15} /></span>}
                  </button>
                ))}
                <div style={{ height: 1, background: 'var(--line)', margin: '8px 4px' }} />
                <button className="ies-hover" onClick={() => { setRoleMenu(false); signOut() }} style={{ width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, fontSize: 12.5, color: 'var(--bad)', fontWeight: 600 }}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* mobile drawer */}
      {drawer && (
        <div className="ies-drawer open" style={{ flexDirection: 'column', gap: 2, background: 'var(--nav-bg)', padding: '10px 12px 16px', position: 'sticky', top: 58, zIndex: 110, animation: 'iesDrawer .2s ease' }}>
          {NAV.map((n) => navBtn(n, true))}
        </div>
      )}

      {/* breadcrumb */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--line)', padding: '9px 18px', display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--text-3)', position: 'sticky', top: 58, zIndex: 90 }}>
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ whiteSpace: 'nowrap', color: i === crumbs.length - 1 ? '#0F172A' : '#64748B', fontWeight: i === crumbs.length - 1 ? 700 : 500 }}>{c}</span>
            {i < crumbs.length - 1 && <span style={{ color: '#CBD5E1' }}>›</span>}
          </span>
        ))}
      </div>

      <main className="ies-content" style={{ padding: 22, maxWidth: 1320, margin: '0 auto' }}>
        <Outlet />
      </main>
    </div>
  )
}
