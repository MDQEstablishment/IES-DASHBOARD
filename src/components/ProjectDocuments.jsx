import { useState } from 'react'
import { useLiveQuery, bgInsert, uploadToBucket } from '../lib/db'
import { useAuth } from '../rbac'
import { Empty, Btn, Modal, Field, inputStyle } from './ui'
import { fmtDate } from '../lib/format'
import { compressImage } from '../lib/image'
import { toast } from '../lib/toast'

const DOC_TYPES = [['COC', 'COC'], ['MS', 'Material Submittal'], ['RFI', 'RFI'], ['submittal', 'Submittal'], ['drawing', 'Drawing'], ['warranty', 'Warranty'], ['other', 'Other…']]
const DSTAT = {
  submitted: ['Submitted', '#2563EB', '#EFF6FF'], under_review: ['Under Review', '#F59E0B', '#FFFBEB'],
  approved: ['Approved', '#10B981', '#ECFDF5'], rejected: ['Rejected', '#EF4444', '#FEF2F2'], superseded: ['Superseded', '#64748B', '#F1F5F9'],
}
const WRITE_ROLES = ['admin', 'pmo', 'projm', 'progm', 'proje']
const HARD_CAP = 25 * 1024 * 1024

export default function ProjectDocuments({ projectId, buildingId = null, title = 'Project Documents' }) {
  const { role } = useAuth()
  const canWrite = WRITE_ROLES.includes(role)
  const [up, setUp] = useState(false)
  const { rows } = useLiveQuery('project_documents',
    (q) => {
      let b = q.select('*').eq('project_id', projectId)
      b = buildingId ? b.eq('building_id', buildingId) : b.is('building_id', null)
      return b.order('submitted_at', { ascending: false })
    }, [projectId, buildingId])
  const { rows: people } = useLiveQuery('profiles', (q) => q.select('id,full_name'))
  const nameById = Object.fromEntries(people.map((p) => [p.id, p.full_name]))

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        {canWrite && <Btn icon="upload" style={{ padding: '7px 11px', fontSize: 12 }} onClick={() => setUp(true)}>Upload document</Btn>}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>Formal documents with version, review state and submission/review dates. Sorted by latest activity.</div>
      {rows.length === 0 ? <Empty icon="doc">No documents uploaded yet.</Empty> : (
        <div className="ies-table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 700 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
              <th style={{ padding: 8, fontWeight: 600 }}>NAME</th><th style={{ padding: 8, fontWeight: 600 }}>TYPE</th>
              <th style={{ padding: 8, fontWeight: 600 }}>VER</th><th style={{ padding: 8, fontWeight: 600 }}>STATUS</th>
              <th style={{ padding: 8, fontWeight: 600 }}>SUBMITTED</th><th style={{ padding: 8, fontWeight: 600 }}>REVIEWED</th><th style={{ padding: 8, fontWeight: 600 }}>REVIEWER</th>
            </tr></thead>
            <tbody>
              {rows.map((d) => {
                const [lbl, col, bg] = DSTAT[d.status] || DSTAT.submitted
                const typeLabel = d.doc_type === 'other' ? (d.custom_type_label || 'Other') : (DOC_TYPES.find((t) => t[0] === d.doc_type)?.[1] || d.doc_type)
                return (
                  <tr key={d.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '9px 8px', fontWeight: 600 }}>{d.name}</td>
                    <td style={{ padding: '9px 8px', color: 'var(--text-3)' }}>{typeLabel}</td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)' }}>{d.version}</td>
                    <td style={{ padding: '9px 8px' }}><span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: col, background: bg }}>{lbl}</span></td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{d.submitted_at ? fmtDate(d.submitted_at) : '—'}</td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{d.reviewed_at ? fmtDate(d.reviewed_at) : '—'}</td>
                    <td style={{ padding: '9px 8px', color: 'var(--text-3)' }}>{nameById[d.reviewed_by] || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {up && <UploadModal projectId={projectId} buildingId={buildingId} onClose={() => setUp(false)} />}
    </div>
  )
}

function UploadModal({ projectId, buildingId, onClose }) {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [type, setType] = useState('COC')
  const [custom, setCustom] = useState('')
  const [version, setVersion] = useState('A')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)

  const onFile = (e) => {
    const f = e.target.files?.[0]
    if (f && f.size > HARD_CAP) { toast('File exceeds the 25 MB cap', 'err'); e.target.value = ''; return }
    if (f && f.size > 10 * 1024 * 1024) toast('Large file (>10 MB) — upload may be slow', 'err')
    setFile(f || null)
    if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''))
  }

  const save = async () => {
    if (!name.trim()) { toast('A document name is required', 'err'); return }
    setBusy(true)
    let storage_path = null, file_size_bytes = null, mime_type = null
    if (file) {
      const toUp = file.type.startsWith('image/') ? await compressImage(file, { maxBytes: 500000 }) : file
      const { path, error } = await uploadToBucket('project-docs', toUp, { userId: user.id, prefix: projectId, maxBytes: HARD_CAP })
      if (error) { setBusy(false); return }
      storage_path = path; file_size_bytes = toUp.size; mime_type = toUp.type
    }
    const { error } = await bgInsert('project_documents', {
      project_id: projectId, building_id: buildingId || null, doc_type: type, custom_type_label: type === 'other' ? (custom || null) : null,
      name: name.trim(), version, status: 'submitted', submitted_by: user.id, storage_path, file_size_bytes, mime_type,
    }, { okMsg: 'Document uploaded' })
    setBusy(false); if (!error) onClose()
  }

  return (
    <Modal open title="Upload document" onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save} disabled={busy || !name.trim()}>{busy ? 'Uploading…' : 'Upload'}</Btn></>}>
      <Field label="Document name"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. COC — Police HQ ESM1" /></Field>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 2 }}><Field label="Type"><select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>{DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field></div>
        <div style={{ flex: 1 }}><Field label="Version"><input style={inputStyle} value={version} onChange={(e) => setVersion(e.target.value)} /></Field></div>
      </div>
      {type === 'other' && <Field label="Custom type label"><input style={inputStyle} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. Inspection Report" /></Field>}
      <Field label="File (PDF stored as-is; images compressed to ≤500 KB; 25 MB cap)"><input type="file" onChange={onFile} style={{ fontSize: 13 }} /></Field>
    </Modal>
  )
}
