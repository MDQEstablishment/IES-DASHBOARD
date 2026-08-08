import { useRef, useState } from 'react'

// Where the project photo sits inside the card frame.
//
// PLACEMENT IS THE POINT: this lives in Add Project and Edit Project, and
// nowhere else. The card is a READ surface everywhere it appears — the
// Projects list, the project page — and its appearance is configured where the
// project is configured. Owner's ruling, and it is the cleaner model: you set
// the image and its position when you create or edit the project, not while
// looking at it.
//
// The preview below is the real card frame at the real aspect, with the real
// scrim, so what is dragged here is what renders in the list.

// Kept in step with the card in Projects.jsx. Both read the same constant so a
// change to the card's proportions cannot leave the picker lying about it.
export const CARD_W = 290
export const CARD_H = 420
export const CARD_SCRIM = 'linear-gradient(180deg, rgba(16,39,59,0.88) 0%, rgba(16,39,59,0.78) 10%, rgba(16,39,59,0.35) 22%, rgba(16,39,59,0) 42%, rgba(16,39,59,0.78) 62%, rgba(16,39,59,0.95) 100%)'

/** The style a stored focal point produces. One home for it, used by the card
 *  and by this picker, so a preview can never disagree with the real thing. */
export const focalStyle = (p) => ({
  objectFit: 'cover',
  objectPosition: `${p?.photo_pos_x ?? 50}% ${p?.photo_pos_y ?? 50}%`,
  transform: `scale(${(p?.photo_zoom ?? 100) / 100})`,
  transformOrigin: `${p?.photo_pos_x ?? 50}% ${p?.photo_pos_y ?? 50}%`,
})

export default function PhotoFocalPicker({ url, value, onChange }) {
  const box = useRef(null)
  const [drag, setDrag] = useState(null)
  const x = value.photo_pos_x ?? 50
  const y = value.photo_pos_y ?? 50
  const zoom = value.photo_zoom ?? 100
  const [touched, setTouched] = useState(false)

  const clamp = (n) => Math.min(100, Math.max(0, n))
  const move = (nx, ny) => onChange({ ...value, photo_pos_x: Math.round(clamp(nx)), photo_pos_y: Math.round(clamp(ny)) })

  const onDown = (e) => {
    if (!url) return
    setTouched(true)
    box.current?.setPointerCapture(e.pointerId)
    setDrag({ sx: e.clientX, sy: e.clientY, ox: x, oy: y })
  }
  const onMove = (e) => {
    if (!drag || !box.current) return
    const r = box.current.getBoundingClientRect()
    move(drag.ox - ((e.clientX - drag.sx) / r.width) * 100,
         drag.oy - ((e.clientY - drag.sy) / r.height) * 100)
  }
  const onKey = (e) => {
    const d = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] }[e.key]
    if (!d || !url) return
    e.preventDefault(); setTouched(true)
    move(x + d[0], y + d[1])
  }

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div
        ref={box}
        role="application"
        aria-label="Photo position"
        tabIndex={url ? 0 : -1}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={onKey}
        style={{
          position: 'relative', width: CARD_W, height: CARD_H, flex: 'none',
          borderRadius: 'var(--radius-m)', overflow: 'hidden', background: 'var(--track)',
          boxShadow: '0 2px 8px rgba(22,29,36,0.12)', userSelect: 'none',
          cursor: url ? (drag ? 'grabbing' : 'grab') : 'default',
        }}
      >
        {url
          ? <img src={url} alt="" draggable={false}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...focalStyle(value) }} />
          : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.08em' }}>NO PHOTO</div>}

        <div style={{ position: 'absolute', inset: 0, background: CARD_SCRIM, pointerEvents: 'none' }} />

        {/* The card's own furniture, so the drag is judged against what will
            actually sit on top of the image rather than against a blank frame. */}
        <div style={{ position: 'absolute', inset: 0, padding: 19, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
          <span style={{ fontSize: 12, color: 'var(--on-band-2)' }}>{value.code || 'CODE'}</span>
          <div>
            <div style={{ color: 'var(--on-band)', fontSize: 19, fontWeight: 600, lineHeight: 1.25 }}>{value.name || 'Project name'}</div>
            <div style={{ color: 'var(--on-band-2)', fontSize: 12, marginTop: 4 }}>{[value.client, value.region].filter(Boolean).join(' · ') || '—'}</div>
          </div>
        </div>

        {url && !touched && (
          <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.08em', color: '#fff', background: 'rgba(16,39,59,0.72)', padding: '6px 12px', borderRadius: 999, pointerEvents: 'none' }}>
            DRAG · ARROW KEYS
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 190, flex: 1 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>
          Fill
          <input type="range" min={100} max={160} value={zoom} disabled={!url}
            onChange={(e) => { setTouched(true); onChange({ ...value, photo_zoom: Number(e.target.value) }) }}
            style={{ flex: 1, accentColor: 'var(--accent)' }} />
        </label>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
          {x}% {y}% · fill {zoom}%
        </span>
        <button type="button" disabled={!url}
          onClick={() => { setTouched(false); onChange({ ...value, photo_pos_x: 50, photo_pos_y: 50, photo_zoom: 100 }) }}
          style={{ alignSelf: 'flex-start', height: 30, padding: '0 12px', borderRadius: 'var(--radius-s)', border: '1px solid var(--line-ctrl)', background: 'var(--surface-1)', fontSize: 12, color: 'var(--text)', fontFamily: 'inherit', opacity: url ? 1 : 0.4 }}>
          Reset
        </button>
      </div>
    </div>
  )
}
