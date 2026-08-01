import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import MurshidPanel from './MurshidPanel'
import MurshidAvatar from './MurshidAvatar'

// مُرشد — the floating launcher, present on every page inside the shell.
//
// POSITION: bottom-left of the CONTENT area, not of the viewport. The 9J shell
// pins a 240px sidebar (68px collapsed) to the left edge for the full height,
// so a viewport-corner button would sit on top of the navigation. The offset
// tracks the collapsed state through .ies-murshid-dock in index.css, which also
// drops it to the true corner below 1024px where the sidebar becomes a drawer.
//
// Z-INDEX 110: above page content and the sticky header's siblings, but BELOW
// the modal layer (1000) and the mobile drawer (125/130) — a dialog must always
// win, and the launcher must never cover the navigation it sits beside.
//
// SCREEN AWARENESS: the panel needs to know which page it is on, and every page
// already renders `data-screen-label`. Reading it from the DOM after each route
// change means no page component had to be modified to gain help content, and a
// page that adds the attribute later is picked up with no change here.
export default function MurshidLauncher({ collapsed }) {
  const [open, setOpen] = useState(false)
  const [screen, setScreen] = useState(null)
  const loc = useLocation()

  useEffect(() => {
    // after the route's paint, so the new page's label is the one we read
    const t = setTimeout(() => {
      const el = document.querySelector('[data-screen-label]')
      setScreen(el ? el.getAttribute('data-screen-label') : null)
    }, 0)
    return () => clearTimeout(t)
  }, [loc.pathname])

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open])

  return (
    <div className={'ies-murshid-dock' + (collapsed ? ' collapsed' : '')}>
      {open && (
        <div style={{ marginBottom: 10 }}>
          <MurshidPanel screen={screen} onClose={() => setOpen(false)} />
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        title={open ? 'إغلاق مُرشد' : 'افتح مُرشد — المساعد'}
        aria-label="مُرشد"
        style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '11px 16px',
          borderRadius: 999, background: 'var(--accent)', color: 'var(--surface-1)',
          boxShadow: 'var(--shadow-2)', fontWeight: 600, fontSize: 13.5,
        }}>
        <MurshidAvatar size={24} />
        <span dir="rtl">مُرشد</span>
      </button>
    </div>
  )
}
