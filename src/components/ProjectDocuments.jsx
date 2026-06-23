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
export const TYPE_LABEL = Object.fromEntries(DOC_TYPES)
// Multi-per-ESM kinds (per delivery / per building) vs single-per-ESM kinds.
export const MULTI_KINDS = new Set(['mir', 'wir', 'coc'])

// Client-court status vocabulary: [label, color, bg, tooltip].
export const DOC_STATUS = {
  draft:                  ['Draft', '#64748B', '#F1F5F9', 'Prepared by the contractor, not yet submitted to the client.'],
  submitted:              ['Submitted', '#2563EB', '#EFF6FF', 'Submitted to the client’s technical team — awaiting their acknowledgement.'],
  under_review:           ['Under Review', '#F59E0B', '#FFFBEB', 'Client confirmed receipt and is reviewing the submittal.'],
  approved:               ['Approved', '#10B981', '#ECFDF5', 'Approved by Client — ready for project closeout.'],
  approved_with_comments: ['Approved w/ Comments', '#0D9488', '#ECFEFF', 'Approved by Client with minor comments to address.'],
  rejected:               ['Rejected', '#EF4444', '#FEF2F2', 'Returned by Client — changes required (see notes).'],
  resubmitted:            ['Resubmitted', '#2563EB', '#EFF6FF', 'Revised and resubmitted to the client after a return.'],
  superseded:             ['Superseded', '#64748B', '#F1F5F9', 'Replaced by a newer revision.'],
}
export const docStatusMeta = (s) => DOC_STATUS[s] || DOC_STATUS.submitted

const WRITE_ROLES = ['admin', 'pmo', 'projm', 'progm', 'proje']
const REVIEW_ROLES = ['admin', 'pmo', 'projm']
const HARD_CAP = 25 * 1024 * 1024
const fmtIso = (t) => (t ? String(t).slice(0, 10) : '—') // YYYY-MM-DD, locale-proof
const nextRev = (r) => String.fromCharCode(((r || 'A').toUpperCase().charCodeAt(0) || 64) + 1)
// Days in client court: response date − submitted date, or days-since-submission while pending.
const daysInCourt = (d) => {
  if (!d.submitted_at) return null
  const end = d.client_response_date ? new Date(d.client_response_date) : new Date()
  return { days: Math.max(0, Math.round((end - new Date(d.submitted_at)) / 86400000)), pending: !d.client_response_date }
}

export default function ProjectDocuments({ projectId, buildingId = null, title = 'Project Documents', uploadRequest = null, onChanged, headerExtra = null }) {
  const { role } = useAuth()
  const canWrite = WRITE_ROLES.includes(role)
  const canReview = REVIEW_ROLES.includes(role)
  const [up, setUp] = useState(false)
  const [prefill, setPrefill] = useState(null)
  const [statusDoc, setStatusDoc] = useState(null)
  const { rows, refetch } = useLiveQuery('project_documents',
    (q) => {
      let b = q.select('*,esm:esms(code),building:buildings(code)').eq('project_id', projectId)
      b = buildingId ? b.eq('building_id', buildingId) : b.is('building_id', null)
      return b.order('submitted_at', { ascending: false, nullsFirst: false })
    }, [projectId, buildingId])
  const { rows: pEsms } = useLiveQuery('project_esms',
    (q) => q.select('custom_name,ordinal,esm:esms(id,code,name)').eq('project_id', projectId).order('ordinal'), [projectId])
  const { rows: bldgs } = useLiveQuery('buildings',
    (q) => q.select('id,code,name,status_override').eq('project_id', projectId).order('code'), [projectId])
  const esmOpts = pEsms.filter((pe) => pe.esm).map((pe) => ({ id: pe.esm.id, code: pe.esm.code, label: pe.custom_name || pe.esm.name }))
  const bldgOpts = bldgs.filter((b) => b.status_override !== 'archived').map((b) => ({ id: b.id, code: b.code, label: b.name }))

  useEffect(() => {
    if (uploadRequest?.key) { setPrefill({ esmId: uploadRequest.esmId, docType: uploadRequest.docType, buildingId: uploadRequest.buildingId || null }); setUp(true) }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{headerExtra}{canWrite && <Btn icon="upload" style={{ padding: '7px 11px', fontSize: 12 }} onClick={() => { setPrefill(null); setUp(true) }}>Upload document</Btn>}</div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>Contractor submittals reviewed by the client’s technical team. Sorted by latest activity.</div>
      {rows.length === 0 ? <Empty icon="doc">No documents submitted yet.</Empty> : (
        <div className="ies-table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 860 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
              <th style={{ padding: 8, fontWeight: 600 }}>NAME</th><th style={{ padding: 8, fontWeight: 600 }}>ESM</th><th style={{ padding: 8, fontWeight: 600 }}>TYPE</th>
              <th style={{ padding: 8, fontWeight: 600 }}>REV</th><th style={{ padding: 8, fontWeight: 600 }}>STATUS</th><th style={{ padding: 8, fontWeight: 600 }}>SUBMITTED</th>
              <th style={{ padding: 8, fontWeight: 600 }}>CLIENT REVIEWER</th><th style={{ padding: 8, fontWeight: 600 }}>RESPONDED</th>
              <th style={{ padding: 8, fontWeight: 600 }} title="Days the submittal has spent with the client (response date − submitted, or days pending)">DAYS IN COURT</th>
              <th style={{ padding: 8, fontWeight: 600 }}>NOTES</th>
              {canReview && <th style={{ padding: 8, fontWeight: 600 }} />}
            </tr></thead>
            <tbody>
              {rows.map((d) => {
                const [lbl, col, bg, tip] = docStatusMeta(d.status)
                const typeLabel = d.doc_type === 'other' ? (d.custom_type_label || 'Other') : (TYPE_LABEL[d.doc_type] || d.doc_type)
                return (
                  <tr key={d.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '9px 8px', fontWeight: 600 }}>
                      {d.storage_path
                        ? <button onClick={() => openDoc(d)} title="Open file" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: 12.5, padding: 0, textDecoration: 'underline' }}><Icon name="doc" size={13} />{d.name}</button>
                        : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-3)' }}><Icon name="doc" size={13} />{d.name}</span>}
                      {d.building?.code && <span style={{ marginLeft: 6, fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--text-3)' }}>· {d.building.code}</span>}
                    </td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)' }}>{d.esm?.code || '—'}</td>
                    <td style={{ padding: '9px 8px', color: 'var(--text-3)' }}>{typeLabel}</td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', fontWeight: 700 }}>{d.revision || 'A'}</td>
                    <td style={{ padding: '9px 8px' }}><span title={tip} style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: col, background: bg, cursor: 'help' }}>{lbl}</span></td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{fmtIso(d.submitted_at)}</td>
                    <td style={{ padding: '9px 8px', color: 'var(--text-3)' }}>{d.client_reviewer_name || '—'}</td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{fmtIso(d.client_response_date)}</td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)' }}>{(() => { const x = daysInCourt(d); if (!x) return <span style={{ color: 'var(--text-3)' }}>—</span>; const warn = x.pending && x.days > 14; return <span title={x.pending ? 'Still awaiting client response' : 'Client response turnaround'} style={{ color: warn ? 'var(--bad)' : 'var(--text-3)', fontWeight: warn ? 700 : 400 }}>{x.days}d{x.pending ? '*' : ''}</span> })()}</td>
                    <td style={{ padding: '9px 8px', color: 'var(--text-3)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.response_notes || ''}>{d.response_notes || '—'}</td>
                    {canReview && (
                      <td style={{ padding: '9px 8px', whiteSpace: 'nowrap' }}>
                        <button onClick={() => setStatusDoc(d)} className="ies-hover" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent)', border: '1px solid var(--line)', borderRadius: 7, padding: '4px 9px', background: '#fff', cursor: 'pointer' }}>Update Status</button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {up && <UploadModal projectId={projectId} buildingId={buildingId} esmOpts={esmOpts} bldgOpts={bldgOpts} rows={rows} prefill={prefill}
        onClose={() => { setUp(false); setPrefill(null) }} onDone={afterChange} />}
      {statusDoc && <UpdateStatusModal doc={statusDoc} onClose={() => setStatusDoc(null)} onDone={afterChange} />}
    </div>
  )
}

// ── Client-court status update + revision ───────────────────────────────────
export function UpdateStatusModal({ doc, onClose, onDone }) {
  const [reviewer, setReviewer] = useState(doc.client_reviewer_name || '')
  const [notes, setNotes] = useState(doc.response_notes || '')
  const [busy, setBusy] = useState(false)

  const apply = async (patch) => {
    setBusy(true)
    const { data, error } = await bgUpdate('project_documents', doc.id, patch)
    setBusy(false)
    if (error) return
    if (Array.isArray(data) && data.length === 0) { toast("You don't have permission to update this document", 'err'); return }
    onDone?.(); onClose()
  }
  const now = () => new Date().toISOString()
  const act = (decision) => {
    if ((decision === 'approved' || decision === 'approved_with_comments') && !reviewer.trim()) { toast('Client reviewer name is required', 'err'); return }
    if (decision === 'rejected' && !notes.trim()) { toast('Response notes (rejection reason) are required', 'err'); return }
    if (decision === 'submitted') return apply({ status: 'submitted' })
    if (decision === 'under_review') return apply({ status: 'under_review', client_reviewer_name: reviewer.trim() || null })
    return apply({ status: decision, client_reviewer_name: reviewer.trim() || null, client_response_date: now(), response_notes: notes.trim() || null })
  }
  const createRevision = async () => {
    setBusy(true)
    const { error } = await bgInsert('project_documents', {
      project_id: doc.project_id, building_id: doc.building_id || null, esm_id: doc.esm_id || null, delivery_id: doc.delivery_id || null,
      doc_type: doc.doc_type, custom_type_label: doc.custom_type_label || null, name: doc.name, storage_path: doc.storage_path || null,
      revision: nextRev(doc.revision), version: doc.version || 'A', status: 'draft', submitted_by: doc.submitted_by || null,
    })
    setBusy(false); if (!error) { onDone?.(); onClose() }
  }

  const btn = (label, onClick, variant = 'secondary') => <Btn variant={variant} style={{ fontSize: 12, padding: '7px 10px' }} disabled={busy} onClick={onClick}>{label}</Btn>

  return (
    <Modal open width={520} title={`Update status · ${doc.name} (Rev ${doc.revision || 'A'})`} onClose={onClose}
      footer={<Btn onClick={onClose}>Close</Btn>}>
      <Field label="Client reviewer name (required to approve)"><input lang="en" style={inputStyle} value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="e.g. Eng. Khalid Al-Mutairi" /></Field>
      <Field label="Response notes (required to reject)"><textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Client comments / rejection reason" /></Field>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', margin: '4px 0 8px' }}>CLIENT DECISION</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {doc.status === 'draft' && btn('Mark Submitted', () => act('submitted'))}
        {btn('Mark Under Review', () => act('under_review'))}
        {btn('Approved by Client', () => act('approved'), 'primary')}
        {btn('Approved w/ Comments', () => act('approved_with_comments'))}
        {btn('Rejected', () => act('rejected'), 'danger')}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', margin: '14px 0 8px' }}>RESUBMISSION</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {btn(`Create Revision ${nextRev(doc.revision)}`, createRevision)}
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Clones this row as a draft for re-upload; the client review starts over.</span>
      </div>
    </Modal>
  )
}

function UploadModal({ projectId, buildingId, esmOpts, bldgOpts, rows, prefill, onClose, onDone }) {
  const { user } = useAuth()
  const suggestRev = (eid, dt, bid) => String.fromCharCode(65 + rows.filter((r) => r.esm_id === eid && r.doc_type === dt && (r.building_id || null) === (bid || null)).length)
  const [esmId, setEsmId] = useState(prefill?.esmId || esmOpts[0]?.id || '')
  const [bldgId, setBldgId] = useState(prefill?.buildingId || buildingId || '')
  const [type, setType] = useState(prefill?.docType || 'material_submittal')
  const [name, setName] = useState('')
  const [custom, setCustom] = useState('')
  const [revision, setRevision] = useState('A')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { setRevision(suggestRev(esmId, type, bldgId)) }, [esmId, type, bldgId]) // eslint-disable-line react-hooks/exhaustive-deps

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
      project_id: projectId, building_id: bldgId || buildingId || null, esm_id: esmId, doc_type: type,
      custom_type_label: type === 'other' ? (custom || null) : null,
      name: name.trim(), revision: revision || 'A', version: revision || 'A', status: 'submitted', submitted_by: user.id,
      submitted_at: new Date().toISOString(), storage_path, file_size_bytes, mime_type,
    }, { okMsg: 'Document submitted' })
    setBusy(false); if (!error) { onDone?.(); onClose() }
  }

  const perBuilding = MULTI_KINDS.has(type)
  return (
    <Modal open width={560} title="Upload / submit document" onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save} disabled={busy || !name.trim() || !esmId}>{busy ? 'Uploading…' : 'Submit'}</Btn></>}>
      <Field label="Document name"><input lang="en" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. COC — Police HQ ESM1" /></Field>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="ESM">
          <select style={inputStyle} value={esmId} onChange={(e) => setEsmId(e.target.value)}>
            <option value="">Select…</option>
            {esmOpts.map((o) => <option key={o.id} value={o.id}>{o.code} — {o.label}</option>)}
          </select>
        </Field></div>
        <div style={{ flex: 1 }}><Field label="Type"><select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>{DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field></div>
        <div style={{ flex: '0 0 80px' }}><Field label="Rev"><input lang="en" style={inputStyle} value={revision} onChange={(e) => setRevision(e.target.value)} /></Field></div>
      </div>
      {!buildingId && (
        <Field label={`Building${perBuilding ? ' (per-building document)' : ' (optional)'}`}>
          <select style={inputStyle} value={bldgId} onChange={(e) => setBldgId(e.target.value)}>
            <option value="">{perBuilding ? 'Select a building…' : 'Project-level (no building)'}</option>
            {bldgOpts.map((o) => <option key={o.id} value={o.id}>{o.code} — {o.label}</option>)}
          </select>
        </Field>
      )}
      {type === 'other' && <Field label="Custom type label"><input lang="en" style={inputStyle} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. Inspection Report" /></Field>}
      <Field label="File (PDF stored as-is; images compressed to ≤500 KB; 25 MB cap)"><input lang="en" type="file" onChange={onFile} style={{ fontSize: 13 }} /></Field>
    </Modal>
  )
}
