import { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom'
import Icon from './Icon'
import { Avatar } from './ui'
import { ROLE_ORDER, ROSTER, roleColor, roleTitle } from '../lib/constants'
import { navForRole, crumbsFor } from '../lib/nav'
import { useAuth } from '../rbac'
import { useBreadcrumb } from '../breadcrumbs'
import { fmtClock } from '../lib/format'

function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  return <div lang="en" className="ies-topmeta" style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#8DA0B1' }}>{fmtClock(now)}</div>
}

export default function Shell() {
  const { profile, role, signInWithRole, signOut } = useAuth()
  const loc = useLocation()
  const { labels } = useBreadcrumb()
  const [roleMenu, setRoleMenu] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => { setDrawer(false); setRoleMenu(false) }, [loc.pathname])
  useEffect(() => {
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setRoleMenu(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const nav = navForRole(role)
  const crumbs = crumbsFor(loc.pathname, labels)

  const navBtn = (n, big = false) => (
    <NavLink key={n.id} to={n.to} end={!!n.end}
      className="ies-nav-btn ies-hover"
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: big ? 11 : 7, padding: big ? '11px 12px' : '8px 12px',
        borderRadius: 6, fontSize: big ? 14 : 12.5, whiteSpace: 'nowrap', position: 'relative',
        color: isActive ? '#fff' : '#8DA0B1', background: isActive ? 'var(--nav-bg-elev)' : 'transparent', fontWeight: isActive ? 700 : 500,
        boxShadow: isActive ? 'inset 0 -2px 0 var(--brass-bright)' : 'none',
        width: big ? '100%' : 'auto', textAlign: 'left',
      })}>
      <Icon name={n.icon} size={16} /><span>{n.label}</span>
    </NavLink>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* top header (dc lines 102-142) */}
      <header style={{ height: 58, background: 'var(--nav-bg)', borderBottom: '1px solid rgba(194,154,75,.25)', display: 'flex', alignItems: 'center', gap: 18, padding: '0 18px', position: 'sticky', top: 0, zIndex: 120 }}>
        <button className="ies-hamburger ies-hover-dark" onClick={() => setDrawer((d) => !d)} style={{ width: 34, height: 34, borderRadius: 6, border: '1px solid #2C4359', color: '#E3DFD3', alignItems: 'center', justifyContent: 'center' }}><Icon name="menu" size={18} /></button>
        <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
          <div style={{ width: 34, height: 34, borderRadius: 6, background: 'linear-gradient(135deg,#1B3A53,#10273B)', border: '1.5px solid rgba(194,154,75,.45)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 12.5 }}>IES<span style={{ position: 'absolute', top: 3, right: 3, width: 5, height: 5, borderRadius: '50%', background: 'var(--brass-bright)' }} /></div>
          <div style={{ lineHeight: 1.1 }}><div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>IES Control</div><div style={{ color: '#8DA0B1', fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '2px' }}>RETROFIT · V2</div></div>
        </Link>
        <nav className="ies-topnav-items" style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 8 }}>
          {nav.map((n) => navBtn(n))}
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="ies-topmeta" style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--live)' }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--live)', animation: 'iesBlink 1.6s infinite' }} />LIVE</div>
          <Clock />
          <NavLink to="/dashboard" className="ies-hover-dark" style={{ position: 'relative', width: 34, height: 34, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8DA0B1' }}>
            <Icon name="bell" size={17} />
          </NavLink>
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button className="ies-hover-dark" onClick={() => setRoleMenu((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 8px 4px 4px', borderRadius: 8, border: '1px solid rgba(255,255,255,.16)' }}>
              <Avatar name={profile?.full_name} color={roleColor(role)} size={28} />
              <span className="ies-topmeta" style={{ lineHeight: 1.15, textAlign: 'left' }}>
                <span style={{ display: 'block', fontWeight: 600, fontSize: 12, color: '#F0EDE3' }}>{profile?.full_name || '—'}</span>
                <span style={{ display: 'block', fontSize: 9.5, color: '#8DA0B1', fontFamily: 'var(--mono)' }}>{roleTitle(role)}</span>
              </span>
              <span style={{ color: '#8DA0B1' }}><Icon name="chevron" size={12} /></span>
            </button>
            {roleMenu && (
              <div style={{ position: 'absolute', right: 0, top: 44, width: 280, background: '#fff', border: '1px solid var(--line)', borderRadius: 12, boxShadow: '0 12px 32px rgba(16,26,36,.16)', padding: 8, zIndex: 200 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1.5px', color: 'var(--text-3)', padding: '6px 10px 8px' }}>SWITCH DEMO ROLE</div>
                {ROLE_ORDER.map((r) => (
                  <button key={r} className="ies-row-hover" onClick={() => { setRoleMenu(false); signInWithRole(r) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, textAlign: 'left', background: r === role ? '#F5EEDF' : 'transparent' }}>
                    <Avatar name={ROSTER[r].name} color={roleColor(r)} size={26} />
                    <span style={{ lineHeight: 1.2 }}><span style={{ display: 'block', fontWeight: 600, fontSize: 12.5 }}>{roleTitle(r)}</span><span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-3)' }}>{ROSTER[r].name}</span></span>
                    {r === role && <span style={{ marginLeft: 'auto', color: 'var(--accent)' }}><Icon name="check" size={15} /></span>}
                  </button>
                ))}
                <div style={{ height: 1, background: 'var(--line)', margin: '8px 4px' }} />
                <button className="ies-hover" onClick={() => { setRoleMenu(false); signOut() }} style={{ width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 6, fontSize: 12.5, color: 'var(--bad)', fontWeight: 600 }}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* mobile drawer (dc lines 144-148) */}
      {drawer && (
        <div className="ies-drawer open" style={{ flexDirection: 'column', gap: 2, background: 'var(--nav-bg)', padding: '10px 12px 16px', position: 'sticky', top: 58, zIndex: 110, animation: 'iesDrawer .2s ease' }}>
          {nav.map((n) => navBtn(n, true))}
        </div>
      )}

      {/* nested breadcrumb (dc lines 150-155) — each non-terminal crumb is a deep link */}
      <div style={{ background: 'var(--raised)', borderBottom: '1px solid var(--line)', padding: '9px 18px', display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--text-3)', position: 'sticky', top: 58, zIndex: 90, flexWrap: 'wrap' }}>
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {c.to && !c.active
              ? <Link to={c.to} className="ies-crumb" style={{ whiteSpace: 'nowrap', color: '#8A8577', fontWeight: 500 }}>{c.label}</Link>
              : <span style={{ whiteSpace: 'nowrap', color: c.active ? '#16222D' : '#8A8577', fontWeight: c.active ? 700 : 500 }}>{c.label}</span>}
            {i < crumbs.length - 1 && <span style={{ color: '#C9C3B4' }}>›</span>}
          </span>
        ))}
      </div>

      <main className="ies-content" style={{ padding: '26px 24px 40px', maxWidth: 1320, margin: '0 auto' }}>
        <Outlet />
      </main>
    </div>
  )
}
