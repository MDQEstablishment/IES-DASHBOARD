import { useRef, useState } from 'react'
import { UploadCloud, Camera, Upload } from 'lucide-react'
import { toast } from '../lib/toast'

// Sprint 8K/8L — the ONE file picker for the whole app. Replaces every native
// <input type="file"> so the browser's locale default "no file chosen" text
// (which renders in Arabic on Arabic Chrome) can never leak into the UI. The real
// input is kept hidden; users only ever see this.
//   • full mode (default): dashed drop zone with "Drop a file or click to browse"
//     — for standalone surfaces (Deliveries PDF, document uploads).
//   • compact mode: a small icon-button the height of an adjacent input, for
//     inline use in a row (e.g. a Daily Progress line). Drag & drop still works.
// Owns its own file list; reports up via onFiles (a single File when !multi, a File[] when multi).
const trunc = (s, n = 16) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

export default function FileDropZone({ accept = '', maxSizeMb = 25, multi = false, label, helperText, onFiles, compact = false }) {
  const ref = useRef(null)
  const [over, setOver] = useState(false)
  const [files, setFiles] = useState([])
  const maxBytes = maxSizeMb * 1024 * 1024
  const isPhoto = !/pdf|csv|xls|\.docx?|\.txt/i.test(accept) // image-ish accept → "photo" wording
  const ctaLabel = isPhoto ? '+ Add photo' : '+ Add file'
  const CompactIcon = isPhoto ? Camera : Upload

  const take = (list) => {
    const incoming = Array.from(list || []).filter((f) => {
      if (f.size > maxBytes) { toast(`${f.name} exceeds the ${maxSizeMb} MB limit`, 'err'); return false }
      return true
    })
    if (!incoming.length) return
    const next = multi ? [...files, ...incoming] : incoming.slice(0, 1)
    setFiles(next)
    onFiles?.(multi ? next : next[0] || null)
    if (ref.current) ref.current.value = ''
  }
  const remove = (i) => {
    const next = files.filter((_, j) => j !== i)
    setFiles(next)
    onFiles?.(multi ? next : next[0] || null)
  }

  const hiddenInput = <input ref={ref} type="file" accept={accept} multiple={multi} onChange={(e) => take(e.target.files)} style={{ display: 'none' }} />
  const dnd = {
    onDragOver: (e) => { e.preventDefault(); setOver(true) },
    onDragLeave: () => setOver(false),
    onDrop: (e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files) },
  }
  const chips = !!files.length && (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {files.map((f, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 7px 4px 9px', borderRadius: 6, background: '#F0EDE4', fontSize: 11.5, color: 'var(--text-2)' }}>
          <span title={f.name}>{compact ? trunc(f.name) : <span style={{ display: 'inline-block', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>{f.name}</span>}</span>
          <button type="button" title="Remove" onClick={(e) => { e.stopPropagation(); remove(i) }} style={{ border: 'none', background: 'none', color: 'var(--bad)', fontWeight: 700, cursor: 'pointer', lineHeight: 1, fontSize: 14 }}>×</button>
        </span>
      ))}
    </div>
  )

  if (compact) {
    return (
      <div>
        {label && <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>{label}</span>}
        {hiddenInput}
        <button type="button" {...dnd}
          onClick={() => ref.current?.click()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: over ? 'var(--accent)' : 'var(--text-2)', border: `1px solid ${over ? 'var(--accent)' : 'var(--line)'}`, background: over ? '#F5EEDF' : '#fff' }}>
          <CompactIcon size={15} /> {ctaLabel}
        </button>
        {chips}
      </div>
    )
  }

  return (
    <div>
      {label && <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>{label}</span>}
      {hiddenInput}
      <div
        role="button" tabIndex={0} {...dnd}
        onClick={() => ref.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ref.current?.click() } }}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', textAlign: 'center', flexDirection: 'column',
          padding: '20px 16px', borderRadius: 10, cursor: 'pointer',
          border: `1.5px dashed ${over ? 'var(--accent)' : 'var(--line)'}`,
          background: over ? '#F5EEDF' : '#FCFBF7', transition: 'background .12s, border-color .12s',
        }}>
        <UploadCloud size={24} color={over ? 'var(--accent)' : 'var(--text-3)'} />
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>Drop a file or click to browse</div>
          {helperText && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{helperText}</div>}
        </div>
      </div>
      {chips}
    </div>
  )
}
