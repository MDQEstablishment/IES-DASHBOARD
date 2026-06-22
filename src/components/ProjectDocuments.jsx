import { useState, useEffect } from 'react'
import { useLiveQuery, bgInsert, bgUpdate, uploadToBucket, signedUrlFor } from '../lib/db'
import { useAuth } from '../rbac'
import Icon from './Icon'
import { Empty, Btn, Modal, Field, inputStyle } from './ui'
import { compressImage } from '../lib/image'
import { toast } from '../lib/toast'

// One vocabulary, shared with the ESM Documentation Tracker matrix.
export const DOC_TYPES = [
  ['material_submittal', 'Material Submittal'], ['method_statement', 'Method Statement'],
  ['mir', 'MIR'], ['wir', 'WIR'], ['coc', 'COC'], ['other', 'Other…'],
]
const TYPE_LABEL = Object.fromEntries(DOC_TYPES)
const DSTAT = {
  submitted: ['Submitted', '#2563EB', '#EFF6FF'], under_review: ['Under Review', '#F59E0B', '#FFFBEB'],
  approved: ['Approved', '#10B981', '#ECFDF5'], rejected: ['Rejected', '#EF4444', '#FEF2F2'], superseded: ['Superseded', '#64748B', '#F1F5F9'],
}
const WRITE_ROLES = ['admin', 'pmo', 'projm', 'progm', 'proje']
const REVIEW_ROLES = ['admin', 'pmo', 'projm']
const HARD_CAP = 25 * 1024 * 1024
const fmtIso = (t) => (t ? String(t).slice(0, 10) : '—') // YYYY-MM-DD, locale-proof

// `uploadRequest` ({ esmId, docType, key }) opens the modal pre-filled (used by
// the Tracker matrix's clickable "Missing" cells). `onChanged` lets the parent
// refetch a sibling view (the matrix) after an upload — deterministic, not
// realtime-dependent.
export default function ProjectDocuments({ projectId, buildingId = null, title = 'Project Documents', uploadRequest = null, onChanged }) {
  const { role } = useAuth()
  const canWrite = WRITE_ROLES.includes(role)
  const canReview = REVIEW_ROLES.includes(role)
  const [up, setUp] = useState(false)
  const [prefill, setPrefill] = useState(null)
  const [review, setReview] = useState(null) // document under review, or null
  const { rows, refetch } = useLiveQuery('project_documents',
    (q) => {
      let b = q.select('*,esm:esms(code)').eq('project_id', projectId)
      b = buildingId ? b.eq('building_id', buildingId) : b.is('building_id', null)
      return b.order('submitted_at', { ascending: false })
    }, [projectId, buildingId])
  const { rows: people } = useLiveQuery('profiles', (q) => q.select('id,full_name'))
  const { rows: pEsms } = useLiveQuery('project_esms',
    (q) => q.select('custom_name,ordinal,esm:esms(id,code,name)').eq('project_id', projectId).order('ordinal'), [projectId])
  const esmOpts = pEsms.filter((pe) => pe.esm).map((pe) => ({ id: pe.esm.id, code: pe.esm.code, label: pe.custom_name || pe.esm.name }))
  const nameById = Object.fromEntries(people.map((p) => [p.id, p.full_name]))

  // open pre-filled when the parent sends an uploadRequest
  useEffect(() => {
    if (uploadRequest?.key) { setPrefill({ esmId: uploadRequest.esmId, docType: uploadRequest.docType }); setUp(true) }
  }, [uploadRequest?.key])

  const afterChange = () => { refetch(); onChanged?.() }
  const openDoc = async (d) => {
    const url = await signedUrlFor('project-docs', d.storage_path)
    if (url) window.open(url, '_blank', 'noopener'); else toast("Couldn't open the file", 'err')
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        {canWrite && <Btn icon="upload" style={{ padding: '7px 11px', fontSize: 12 }} onClick={() => { setPrefill(null); setUp(true) }}>Upload document</Btn>}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>Formal documents with ESM, version, review state and submission/review dates. Sorted by latest activity.</div>
      {rows.length === 0 ? <Empty icon="doc">No documents uploaded yet.</Empty> : (
        <div className="ies-table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
              <th style={{ padding: 8, fontWeight: 600 }}>NAME</th><th style={{ padding: 8, fontWeight: 600 }}>ESM</th><th style={{ padding: 8, fontWeight: 600 }}>TYPE</th>
              <th style={{ padding: 8, fontWeight: 600 }}>VER</th><th style={{ padding: 8, fontWeight: 600 }}>STATUS</th>
              <th style={{ padding: 8, fontWeight: 600 }}>SUBMITTED</th><th style={{ padding: 8, fontWeight: 600 }}>REVIEWED</th><th style={{ padding: 8, fontWeight: 600 }}>REVIEWER</th>
              {canReview && <th style={{ padding: 8, fontWeight: 600 }} />}
            </tr></thead>
            <tbody>
              {rows.map((d) => {
                const [lbl, col, bg] = DSTAT[d.status] || DSTAT.submitted
                const typeLabel = d.doc_type === 'other' ? (d.custom_type_label || 'Other') : (TYPE_LABEL[d.doc_type] || d.doc_type)
                const pending = d.status === 'submitted' || d.status === 'under_review'
                return (
                  <tr key={d.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '9px 8px', fontWeight: 600 }}>
                      {d.storage_path
                        ? <button onClick={() => openDoc(d)} title="Open file" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: 12.5, padding: 0, textDecoration: 'underline' }}><Icon name="doc" size={13} />{d.name}</button>
                        : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-3)' }}><Icon name="doc" size={13} />{d.name}</span>}
                    </td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)' }}>{d.esm?.code || '—'}</td>
                    <td style={{ padding: '9px 8px', color: 'var(--text-3)' }}>{typeLabel}</td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)' }}>{d.version}</td>
                    <td style={{ padding: '9px 8px' }}><span title={d.status === 'rejected' && d.review_notes ? `Reason: ${d.review_notes}` : undefined} style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: col, background: bg, cursor: d.status === 'rejected' && d.review_notes ? 'help' : 'default' }}>{lbl}</span></td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{fmtIso(d.submitted_at)}</td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{fmtIso(d.reviewed_at)}</td>
                    <td style={{ padding: '9px 8px', color: 'var(--text-3)' }}>{nameById[d.reviewed_by] || '—'}</td>
                    {canReview && (
                      <td style={{ padding: '9px 8px', whiteSpace: 'nowrap' }}>
                        {pending
                          ? <button onClick={() => setReview(d)} className="ies-hover" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent)', border: '1px solid var(--line)', borderRadius: 7, padding: '4px 9px', background: '#fff', cursor: 'pointer' }}>Review</button>
                          : <span style={{ color: 'var(--text-3)', fontSize: 11 }}>—</span>}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {up && <UploadModal projectId={projectId} buildingId={buildingId} esmOpts={esmOpts} rows={rows} prefill={prefill}
        onClose={() => { setUp(false); setPrefill(null) }} onDone={afterChange} />}
      {review && <ReviewModal doc={review} onClose={() => setReview(null)} onDone={afterChange} />}
    </div>
  )
}

// Approve / Request Changes for a submitted or under-review document.
function ReviewModal({ doc, onClose, onDone }) {
  const { user } = useAuth()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const decide = async (decision) => {
    if (decision === 'rejected' && !reason.trim()) { toast('A reason is required to request changes', 'err'); return }
    setBusy(true)
    const patch = decision === 'approved'
      ? { status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: user.id, review_notes: null }
      : { status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: user.id, review_notes: reason.trim() }
    const { data, error } = await bgUpdate('project_documents', doc.id, patch)
    setBusy(false)
    if (error) return
    if (Array.isArray(data) && data.length === 0) { toast("You don't have permission to review this document", 'err'); return }
    onDone?.(); onClose()
  }

  return (
    <Modal open title="Review document" onClose={onClose}
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="danger" onClick={() => decide('rejected')} disabled={busy}>Request changes</Btn>
        <Btn variant="primary" onClick={() => decide('approved')} disabled={busy}>{busy ? 'Saving…' : 'Approve'}</Btn>
      </>}>
      <div style={{ fontSize: 13, marginBottom: 12 }}>Review <strong>{doc.name}</strong>{doc.esm?.code ? ` · ${doc.esm.code}` : ''}. Approving marks it accepted; requesting changes sends it back with your reason.</div>
      <Field label="Reason (required to request changes)">
        <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What needs to change?" />
      </Field>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Recorded with your name and the time; the Tracker matrix updates immediately.</div>
    </Modal>
  )
}

function UploadModal({ projectId, buildingId, esmOpts, rows, prefill, onClose, onDone }) {
  const { user } = useAuth()
  const suggestVersion = (eid, dt) => String.fromCharCode(65 + rows.filter((r) => r.esm_id === eid && r.doc_type === dt).length)
  const [esmId, setEsmId] = useState(prefill?.esmId || esmOpts[0]?.id || '')
  const [type, setType] = useState(prefill?.docType || 'material_submittal')
  const [name, setName] = useState('')
  const [custom, setCustom] = useState('')
  const [version, setVersion] = useState('A')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)

  // keep the version suggestion in sync with the chosen ESM + type
  useEffect(() => { setVersion(suggestVersion(esmId, type)) }, [esmId, type]) // eslint-disable-line react-hooks/exhaustive-deps

  const onFile = (e) => {
    const f = e.target.files?.[0]
    if (f && f.size > HARD_CAP) { toast('File exceeds the 25 MB cap', 'err'); e.target.value = ''; return }
    if (f && f.size > 10 * 1024 * 1024) toast('Large file (>10 MB) — upload may be slow', 'err')
    setFile(f || null)
    if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''))
  }

  const save = async () => {
    if (!name.trim()) { toast('A document name is required', 'err'); return }
    if (!esmId) { toast('Select an ESM', 'err'); return }
    setBusy(true)
    let storage_path = null, file_size_bytes = null, mime_type = null
    if (file) {
      const toUp = file.type.startsWith('image/') ? await compressImage(file, { maxBytes: 500000 }) : file
      const { path, error } = await uploadToBucket('project-docs', toUp, { userId: user.id, prefix: projectId, maxBytes: HARD_CAP })
      if (error) { setBusy(false); return }
      storage_path = path; file_size_bytes = toUp.size; mime_type = toUp.type
    }
    const { error } = await bgInsert('project_documents', {
      project_id: projectId, building_id: buildingId || null, esm_id: esmId, doc_type: type,
      custom_type_label: type === 'other' ? (custom || null) : null,
      name: name.trim(), version: version || 'A', status: 'submitted', submitted_by: user.id, storage_path, file_size_bytes, mime_type,
    }, { okMsg: 'Document uploaded' })
    setBusy(false); if (!error) { onDone?.(); onClose() }
  }

  return (
    <Modal open title="Upload document" onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save} disabled={busy || !name.trim() || !esmId}>{busy ? 'Uploading…' : 'Upload'}</Btn></>}>
      <Field label="Document name"><input lang="en" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. COC — Police HQ ESM1" /></Field>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="ESM">
          <select style={inputStyle} value={esmId} onChange={(e) => setEsmId(e.target.value)}>
            <option value="">Select…</option>
            {esmOpts.map((o) => <option key={o.id} value={o.id}>{o.code} — {o.label}</option>)}
          </select>
        </Field></div>
        <div style={{ flex: 1 }}><Field label="Type"><select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>{DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field></div>
        <div style={{ flex: '0 0 80px' }}><Field label="Version"><input lang="en" style={inputStyle} value={version} onChange={(e) => setVersion(e.target.value)} /></Field></div>
      </div>
      {type === 'other' && <Field label="Custom type label"><input lang="en" style={inputStyle} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. Inspection Report" /></Field>}
      <Field label="File (PDF stored as-is; images compressed to ≤500 KB; 25 MB cap)"><input lang="en" type="file" onChange={onFile} style={{ fontSize: 13 }} /></Field>
    </Modal>
  )
}
