import { useState, useEffect, useRef } from 'react'
import { useLiveQuery, uploadToBucket, signedUrlFor, bgInsert } from '../lib/db'
import { useAuth, can } from '../rbac'
import { Empty } from './ui'
import Icon from './Icon'
import { compressImage } from '../lib/image'
import { CAN_INSTALL } from '../lib/constants'
import { fmtDate } from '../lib/format'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'

// Building photos (Phase 4). daily_report photos carry an ESM badge + date;
// direct uploads are "General". Private bucket → signed URLs. Lightbox browsing.
export default function BuildingPhotos({ buildingId }) {
  const { user, role } = useAuth()
  const canUpload = can(role, CAN_INSTALL)
  const { rows } = useLiveQuery('building_photos',
    (q) => q.select('*').eq('building_id', buildingId).order('taken_at', { ascending: false }), [buildingId])
  const [urls, setUrls] = useState({})
  const [index, setIndex] = useState(-1)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const m = {}
      for (const p of rows) m[p.id] = await signedUrlFor('building-photos', p.storage_path)
      if (alive) setUrls(m)
    })()
    return () => { alive = false }
  }, [rows])

  const onFiles = async (e) => {
    const files = [...(e.target.files || [])]
    if (!files.length) return
    setBusy(true)
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      const small = await compressImage(file, { maxBytes: 200000 })
      const { path, error } = await uploadToBucket('building-photos', small, { userId: user.id, prefix: buildingId })
      if (!error) {
        await bgInsert('building_photos', {
          building_id: buildingId, storage_path: path, source: 'direct_upload', esm: null,
          taken_at: new Date().toISOString(), file_size_bytes: small.size, mime_type: small.type, uploaded_by: user.id,
        })
      }
    }
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  // group by date → list (with esm badge)
  const groups = {}
  rows.forEach((p) => { const d = (p.taken_at || p.uploaded_at || '').slice(0, 10) || 'Undated'; (groups[d] = groups[d] || []).push(p) })
  const ordered = rows.map((p) => ({ src: urls[p.id] })).filter((s) => s.src)

  const slideIndexOf = (id) => rows.filter((p) => urls[p.id]).findIndex((p) => p.id === id)

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Site Photos</div>
        {canUpload && (
          <>
            <input lang="en" ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
            <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 6, background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700 }}>
              <Icon name="camera" size={14} />{busy ? 'Uploading…' : 'Upload photos'}
            </button>
          </>
        )}
      </div>
      {rows.length === 0 ? <Empty icon="camera">No site photos yet. Uploads here are compressed and tagged “General”; Daily Report photos arrive tagged by date + ESM.</Empty> : (
        Object.entries(groups).map(([date, ps]) => (
          <div key={date} style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.5px', color: 'var(--text-3)', marginBottom: 8 }}>{date === 'Undated' ? 'UNDATED' : fmtDate(date).toUpperCase()}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 10 }}>
              {ps.map((p) => (
                <button key={p.id} onClick={() => setIndex(slideIndexOf(p.id))} style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)', background: '#EDEAE0' }}>
                  {urls[p.id] ? <img src={urls[p.id]} alt={p.caption || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 10, color: 'var(--text-3)' }}>…</span>}
                  <span style={{ position: 'absolute', top: 5, left: 5, fontFamily: 'var(--mono)', fontSize: 8.5, fontWeight: 700, padding: '2px 6px', borderRadius: 5, color: '#fff', background: p.source === 'daily_report' ? 'rgba(160,118,43,.9)' : 'rgba(16,26,36,.7)' }}>
                    {p.source === 'daily_report' ? (p.esm || 'ESM') : 'General'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))
      )}
      <Lightbox open={index >= 0} index={Math.max(0, index)} close={() => setIndex(-1)} slides={ordered} />
    </div>
  )
}
