// 9Q(2) — the top-bar global search.
//
// This component holds NO access-control logic, deliberately. Every row it
// renders came back through the signed-in user's own session, so it can only
// ever show what the person could already reach by navigating. See
// src/lib/search.js for why that is structural rather than a promise.
//
// Placement: between the breadcrumb and the right-hand chrome, so the Live
// indicator, the Clock and the NotifBell keep their positions. Below 1024px it
// collapses to an icon-only trigger — the bar is 56px with a hamburger, a
// collapse toggle, a wrapping breadcrumb and three chrome items already, and a
// 320px field is what would break it.

import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from './Icon'
import { runSearch, MIN_QUERY_CHARS } from '../lib/search'
import { toLatin } from '../lib/format'

const DEBOUNCE_MS = 200

export default function GlobalSearch() {
  const [q, setQ] = useState('')
  const [groups, setGroups] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [cursor, setCursor] = useState(0)     // index into the FLAT result list
  const [expanded, setExpanded] = useState(false)  // small-screen icon -> field
  const boxRef = useRef(null)
  const inputRef = useRef(null)
  const [focused, setFocused] = useState(false)
  const runId = useRef(0)
  const navigate = useNavigate()

  // flat list so the arrow keys cross group boundaries the way a person expects
  const flat = groups.flatMap((g) => g.rows.map((r) => ({ group: g, row: r })))

  useEffect(() => {
    const query = q.trim()
    if (query.length < MIN_QUERY_CHARS) { setGroups([]); setBusy(false); return }
    setBusy(true)
    // Debounced so a fast typist issues one round of queries, not one per
    // keystroke. `id` discards a slow response that lands after a newer one —
    // otherwise stale results can overwrite fresh ones.
    const id = ++runId.current
    const t = setTimeout(async () => {
      const res = await runSearch(query)
      if (runId.current !== id) return
      setGroups(res)
      setCursor(0)
      setBusy(false)
      setOpen(true)
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [q])

  // click-away and Escape both close; Escape also returns focus to the field so
  // the keyboard never gets stranded
  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const go = useCallback((hit) => {
    if (!hit) return
    setOpen(false); setQ(''); setGroups([]); setExpanded(false)
    navigate(hit.group.to(hit.row))
  }, [navigate])

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); inputRef.current?.focus(); return }
    if (!flat.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setCursor((c) => (c + 1) % flat.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setCursor((c) => (c - 1 + flat.length) % flat.length) }
    else if (e.key === 'Enter') { e.preventDefault(); go(flat[cursor] || flat[0]) }
  }

  // It was never literally unstyled — it used --radius-s and --line-ctrl. What
  // made it READ as a default input is that a hairline border with no fill
  // against a white bar has nothing to hold it: the field dissolved into the
  // chrome. So it gets a real surface (--track), the theme's larger radius, an
  // inset hairline for depth, and a focus state that belongs to this product
  // rather than the browser's.
  const field = {
    width: '100%', height: 38, borderRadius: 'var(--radius-m)',
    border: `1px solid ${focused ? 'var(--accent)' : 'var(--line)'}`,
    background: focused ? 'var(--surface-1)' : 'var(--track)',
    color: 'var(--text)', fontFamily: 'inherit', fontSize: 13,
    padding: '0 52px 0 34px', outline: 'none',
    boxShadow: focused ? '0 0 0 3px var(--accent-tint)' : 'inset 0 1px 2px rgba(28,28,28,.04)',
    transition: 'background .16s, border-color .16s, box-shadow .16s',
  }

  return (
    <div ref={boxRef} style={{ position: 'relative', width: 'min(430px, 42vw)', minWidth: 0, display: 'flex', justifyContent: 'center' }}>
      {/* below 1024 the field is an icon until it is asked for */}
      <button
        className="ies-hover ies-search-trigger"
        aria-label="Search"
        onClick={() => { setExpanded(true); setTimeout(() => inputRef.current?.focus(), 0) }}
        style={{ width: 34, height: 34, borderRadius: 'var(--radius-s)', color: 'var(--text-3)', alignItems: 'center', justifyContent: 'center', display: 'none' }}>
        <Icon name="search" size={17} />
      </button>

      <div className={`ies-search-field${expanded ? ' expanded' : ''}`} style={{ position: 'relative', width: '100%', minWidth: 0 }}>
        <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none', display: 'flex' }}>
          <Icon name="search" size={15} />
        </span>
        <input
          ref={inputRef}
          lang="en"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="ies-search-results"
          placeholder="Search projects, buildings, materials…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { setFocused(true); if (groups.length) setOpen(true) }}
          onKeyDown={onKeyDown}
          onBlur={() => { setFocused(false); if (!q) setExpanded(false) }}
          style={field}
        />
        {!focused && !q && (
          <span aria-hidden="true" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 3, pointerEvents: 'none' }}>
            {['\u2318', 'K'].map((k) => (
              <span key={k} style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)', background: 'var(--surface-1)', border: '1px solid var(--line-ctrl)', borderRadius: 5, padding: '2px 5px', lineHeight: 1 }}>{k}</span>
            ))}
          </span>
        )}
      </div>

      {open && q.trim().length >= MIN_QUERY_CHARS && (
        <div
          id="ies-search-results"
          role="listbox"
          style={{
            position: 'absolute', top: 40, right: 0, width: 'min(420px, 92vw)', zIndex: 130,
            background: 'var(--surface-1)', borderRadius: 'var(--radius-m)', boxShadow: 'var(--shadow-2)',
            maxHeight: '70vh', overflowY: 'auto', padding: 6,
          }}>
          {busy && <div style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--text-3)' }}>Searching…</div>}
          {!busy && !flat.length && (
            <div style={{ padding: '14px 12px', fontSize: 12.5, color: 'var(--text-3)' }}>
              No matches you have access to.
            </div>
          )}
          {!busy && groups.map((g) => (
            <div key={g.key}>
              <div style={{
                padding: '7px 10px 4px', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
                letterSpacing: '.04em', color: 'var(--text-3)', textTransform: 'uppercase',
              }}>{g.label}</div>
              {g.rows.map((r) => {
                const idx = flat.findIndex((h) => h.group.key === g.key && h.row.id === r.id)
                const active = idx === cursor
                return (
                  <button
                    key={r.id}
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setCursor(idx)}
                    onClick={() => go({ group: g, row: r })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                      padding: '8px 10px', borderRadius: 'var(--radius-s)',
                      background: active ? 'var(--hover)' : 'transparent', color: 'var(--text)',
                    }}>
                    <span style={{
                      flex: 'none', fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700,
                      padding: '2px 6px', borderRadius: 'var(--radius-s)',
                      background: 'var(--accent-tint)', color: 'var(--accent)',
                    }}>{g.label.replace(/s$/, '').toUpperCase()}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {toLatin(g.title(r) || '')}
                      </span>
                      <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {toLatin(g.sub(r) || '')}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
