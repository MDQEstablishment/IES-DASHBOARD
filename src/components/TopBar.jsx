import { useState, useEffect } from 'react'
import { useLocation, matchPath } from 'react-router-dom'
import Icon from './Icon'
import { NAV } from '../lib/constants'
import { useProject } from '../project'

function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t) }, [])
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][now.getMonth()]
  return `${now.getDate()} ${mon} · ${hh}:${mm} AST`
}

export default function TopBar() {
  const loc = useLocation()
  const { current } = useProject()
  const clock = useClock()
  const nav = NAV.find((n) => (n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to)))
  const page = matchPath('/projects/:id', loc.pathname) ? 'Project Detail' : (nav?.label || 'Dashboard')

  return (
    <div className="topbar">
      <div className="crumbs">
        <span>IES</span>
        <Icon name="ChevronRight" size={10} color="var(--text-4)" />
        <span>{current ? current.name : 'All Projects'}</span>
        <Icon name="ChevronRight" size={10} color="var(--text-4)" />
        <span style={{ color: 'var(--text)' }}>{page}</span>
      </div>
      <div className="grow" />
      <div className="flex center gap-2">
        <span className="pulse-dot" />
        <span className="tb-status">Live</span>
      </div>
      <span className="tb-status num" style={{ letterSpacing: '0.04em' }}>{clock}</span>
      <button className="btn btn-ghost btn-sm" title="Notifications"><Icon name="Bell" size={15} /></button>
    </div>
  )
}
