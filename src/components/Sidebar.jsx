import { useState, useRef, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import Icon from './Icon'
import { Avatar } from './ui'
import { NAV, ROLE_ORDER, ROSTER, roleGradient, roleTitle } from '../lib/constants'
import { useAuth } from '../rbac'
import { useProject } from '../project'

export default function Sidebar() {
  const { profile, role, signInWithRole, signOut } = useAuth()
  const { projects, projectId, setProjectId } = useProject()
  const [projOpen, setProjOpen] = useState(false)
  const [roleOpen, setRoleOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setProjOpen(false); setRoleOpen(false) } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const cur = projects.find((p) => p.id === projectId)
  const projLabel = projectId === 'ALL' ? 'All projects' : (cur?.name || 'Select project')

  return (
    <aside className="sidebar" ref={ref}>
      <div className="brand-row">
        <div className="brand-mark"><span className="g">IES</span><span className="dot" /></div>
        <div className="grow truncate">
          <div className="brand-name">IES Platform</div>
          <div className="brand-sub">Programme Control</div>
        </div>
      </div>

      <div className="nav-proj">
        <button className="nav-proj-btn" onClick={() => setProjOpen((o) => !o)}>
          <span className={`dot dot-${projectId === 'ALL' ? 'blue' : (cur?.status === 'active' ? 'green' : 'gray')}`} />
          <span className="nav-proj-name grow">{projLabel}</span>
          <Icon name="ChevronsUpDown" size={13} color="var(--nav-text-3)" />
        </button>
        {projOpen && (
          <div className="role-menu" style={{ bottom: 'auto', top: 48 }}>
            <button className={`role-opt ${projectId === 'ALL' ? 'cur' : ''}`} onClick={() => { setProjectId('ALL'); setProjOpen(false) }}>
              <span className="dot dot-blue" /><span className="user-name" style={{ color: '#fff' }}>All projects</span>
            </button>
            {projects.map((p) => (
              <button key={p.id} className={`role-opt ${projectId === p.id ? 'cur' : ''}`} onClick={() => { setProjectId(p.id); setProjOpen(false) }}>
                <span className={`dot dot-${p.status === 'active' ? 'green' : 'gray'}`} />
                <span className="user-name grow truncate" style={{ color: '#fff' }}>{p.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="nav-list">
        {NAV.map((item) => (
          <div key={item.to}>
            {item.cap && <div className="nav-cap">{item.cap}</div>}
            <NavLink to={item.to} end={item.to === '/'} className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
              <Icon name={item.icon} size={15} />
              <span className="grow truncate">{item.label}</span>
            </NavLink>
          </div>
        ))}
      </nav>

      <div className={`user-card ${roleOpen ? 'open' : ''}`}>
        {roleOpen && (
          <div className="role-menu">
            <div className="nav-cap" style={{ padding: '6px 8px 4px' }}>Switch role (demo)</div>
            {ROLE_ORDER.map((r) => (
              <button key={r} className={`role-opt ${r === role ? 'cur' : ''}`}
                onClick={() => { setRoleOpen(false); signInWithRole(r) }}>
                <Avatar name={ROSTER[r].name} gradient={roleGradient(r)} size={26} />
                <div className="grow truncate">
                  <div className="user-name">{ROSTER[r].name}</div>
                  <div className="user-sub">{roleTitle(r)}</div>
                </div>
                {r === role && <Icon name="Check" size={14} color="var(--nav-accent)" />}
              </button>
            ))}
            <div style={{ height: 1, background: 'var(--nav-line)', margin: '4px 0' }} />
            <button className="role-opt" onClick={() => { setRoleOpen(false); signOut() }}>
              <span style={{ width: 26, display: 'grid', placeItems: 'center' }}><Icon name="LogOut" size={15} color="var(--nav-text-2)" /></span>
              <span className="user-name">Sign out</span>
            </button>
          </div>
        )}
        <button className="user-btn" onClick={() => setRoleOpen((o) => !o)}>
          <Avatar name={profile?.full_name} gradient={roleGradient(role)} size={32} />
          <div className="grow truncate">
            <div className="user-name">{profile?.full_name || '—'}</div>
            <div className="user-sub">{roleTitle(role)}</div>
          </div>
          <Icon name="ChevronsUpDown" size={14} color="var(--nav-text-3)" />
        </button>
      </div>
    </aside>
  )
}
