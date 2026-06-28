import { useRef, useState } from 'react'
import { UploadCloud } from 'lucide-react'
import { toast } from '../lib/toast'

// Sprint 8K — the ONE file picker for the whole app. Replaces every native
// <input type="file"> so the browser's locale default "no file chosen" text
// (which renders in Arabic on Arabic Chrome) can never leak into the UI. The real
// input is kept hidden; users only ever see this. Dashed drop zone + click-to-browse,
// drag & drop, size cap, and removable file chips. Owns its own file list and
// reports up via onFiles (a single File when !multi, else a File[]).
export default function FileDropZone({ accept = '', maxSizeMb = 25, multi = false, label, helperText, onFiles, compact = false }) {
  const ref = useRef(null)
  const [over, setOver] = useState(false)
  const [files, setFiles] = useState([])
  const maxBytes = maxSizeMb * 1024 * 1024

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

  return (
    <div>
      {label && <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>{label}</span>}
      <input ref={ref} type="file" accept={accept} multiple={multi} onChange={(e) => take(e.target.files)} style={{ display: 'none' }} />
      <div
        role="button" tabIndex={0}
        onClick={() => ref.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ref.current?.click() } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files) }}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', textAlign: 'center',
          flexDirection: compact ? 'row' : 'column',
          padding: compact ? '12px 14px' : '20px 16px', borderRadius: 10, cursor: 'pointer',
          border: `1.5px dashed ${over ? 'var(--accent)' : 'var(--line)'}`,
          background: over ? '#EFF6FF' : '#FBFCFE', transition: 'background .12s, border-color .12s',
        }}>
        <UploadCloud size={compact ? 18 : 24} color={over ? 'var(--accent)' : 'var(--text-3)'} />
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>Drop a file or click to browse</div>
          {helperText && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{helperText}</div>}
        </div>
      </div>
      {!!files.length && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {files.map((f, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 220, padding: '4px 7px 4px 9px', borderRadius: 6, background: '#F1F5F9', fontSize: 11.5, color: 'var(--text-2)' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <button type="button" title="Remove" onClick={(e) => { e.stopPropagation(); remove(i) }} style={{ border: 'none', background: 'none', color: 'var(--bad)', fontWeight: 700, cursor: 'pointer', lineHeight: 1, fontSize: 14 }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
