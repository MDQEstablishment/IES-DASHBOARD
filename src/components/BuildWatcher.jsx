// 9Q(3) — tell an open tab that it is out of date.
//
// WHY THIS EXISTS, precisely, because the failure it fixes cost four hours and
// an accusation that the deploy had lied:
//
// The app uses HashRouter. Every in-app navigation is a hash change, so
// index.html is fetched ONCE, when the tab is opened, and never again for the
// life of that tab. Assets are content-hashed, so index.html is the only thing
// that names the current bundle. Put those two facts together and an open tab
// runs its original bundle forever, no matter how many deploys land behind it.
//
// The trap is that this looks like a working deploy. Everything shipped BEFORE
// the tab was opened is present and correct, so the app appears live and
// current; only changes shipped AFTER are missing. On 2 Aug a tab opened after
// run 226 showed the new Dashboard layout perfectly and simply had no global
// search in it, and the reasonable conclusion from inside that tab — "recent
// work is live, so my copy must be current" — was wrong.
//
// So: the build stamps its id into the bundle (__BUILD_ID__, the commit SHA in
// CI) and also writes it to version.json, which is unhashed and fetched with
// cache: 'no-store'. If the deployed id differs from the running one, the tab
// is stale and says so. It never reloads on its own — an unannounced reload
// mid-edit would be its own defect — it offers, and the person decides.
//
// Costs nothing worth measuring: one ~30-byte request every five minutes, and
// only while the tab is visible.

/* global __BUILD_ID__ */
import { useEffect, useState } from 'react'

const POLL_MS = 5 * 60 * 1000
const RUNNING = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : null

export default function BuildWatcher() {
  const [stale, setStale] = useState(false)

  useEffect(() => {
    // A dev build has no meaningful deployed counterpart to compare against.
    if (!RUNNING || RUNNING.startsWith('local-')) return
    let dead = false

    const check = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const url = `${import.meta.env.BASE_URL || '/'}version.json`
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) return
        const { buildId } = await res.json()
        if (!dead && buildId && buildId !== RUNNING) setStale(true)
      } catch {
        // Offline, or the file is not there yet on a first deploy. Staying
        // quiet is correct: a failed check is not evidence of a new build.
      }
    }

    check()
    const t = setInterval(check, POLL_MS)
    document.addEventListener('visibilitychange', check)
    return () => { dead = true; clearInterval(t); document.removeEventListener('visibilitychange', check) }
  }, [])

  if (!stale) return null

  return (
    <div style={{
      position: 'fixed', right: 16, bottom: 16, zIndex: 200,
      display: 'flex', alignItems: 'center', gap: 10,
      background: 'var(--surface-1)', borderRadius: 'var(--radius-m)',
      boxShadow: 'var(--shadow-2)', padding: '10px 12px', maxWidth: 320,
    }}>
      <span style={{ flex: 'none', width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />
      <span style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.35 }}>
        A newer version of this dashboard has been deployed. This tab is still running the older one.
      </span>
      <button
        className="ies-hover"
        onClick={() => window.location.reload()}
        style={{
          flex: 'none', padding: '6px 10px', borderRadius: 'var(--radius-s)',
          background: 'var(--accent)', color: 'var(--surface-1)', fontSize: 12, fontWeight: 600,
        }}>
        Reload
      </button>
    </div>
  )
}
