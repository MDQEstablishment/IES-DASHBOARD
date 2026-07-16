import { useState, useEffect } from 'react'
import { Paperclip } from 'lucide-react'
import { useLiveQuery, bgInsert, bgUpdate, uploadToBucket, signedUrlFor } from '../lib/db'
import { useAuth } from '../rbac'
import Icon from './Icon'
import { Empty, Btn, Modal, Field, inputStyle, Drawer } from './ui'
import { compressImage } from '../lib/image'
import { toast } from '../lib/toast'
import InspectionFormModal from './InspectionFormModal'
import FileDropZone from './FileDropZone'

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
  draft:                  ['Draft', '#8A8577', '#F0EDE4', 'Prepared by the contractor, not yet submitted to the client.'],
  submitted:              ['Submitted', '#A0762B', '#F5EEDF', 'Submitted to the client (Tarshid) — logged with the submission date.'],
  under_review:           ['With Client', '#6D5A8E', '#F3E8FF', 'With the client (Tarshid) for review — awaiting their response.'],
  approved:               ['Approved', '#217A54', '#E9F3EE', 'Approved by Client — ready for project closeout.'],
  approved_with_comments: ['Approved w/ Comments', '#B45309', '#F5E9CE', 'Approved by Client with comments — a cover-comments version was uploaded.'],
  rejected:               ['Rejected', '#B3362B', '#F9ECEA', 'Returned by Client — must be revised and resubmitted (see notes).'],
  resubmitted:            ['Resubmitted', '#A0762B', '#F5EEDF', 'Revised and resubmitted to the client after a return.'],
  superseded:             ['Superseded', '#8A8577', '#F0EDE4', 'Replaced by a newer revision.'],
}
export const docStatusMeta = (s) => DOC_STATUS[s] || DOC_STATUS.submitted

// Attachment affordance for a Doc Tracker cell: a paperclip + count of the
// cell's documents that carry a file. Click opens a popover of direct links.
export function AttachmentChip({ docs = [], onOpen }) {
  const [open, setOpen] = useState(false)
  const withFiles = docs.filter((d) => d.storage_path)
  if (!withFiles.length) return null
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }} title={`${withFiles.length} attached file(s)`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--text-3)', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>
        <Paperclip size={12} />{withFiles.length}
      </button>
      {open && (
        <>
          <div onClick={(e) => { e.stopPropagation(); setOpen(false) }} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', zIndex: 31, top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid var(--line)', borderRadius: 6, boxShadow: '0 8px 24px rgba(16,26,36,.14)', padding: 6, minWidth: 190 }}>
            {withFiles.map((d) => (
              <button key={d.id} className="ies-hover" onClick={() => { setOpen(false); onOpen?.(d) }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: 12, color: 'var(--accent)', fontWeight: 600, borderRadius: 6 }}>
                <Paperclip size={11} />{d.reference_no || d.name || 'Document'}{d.revision ? ` (Rev ${d.revision})` : ''}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  )
}

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

export default function ProjectDocuments({ projectId, project = null, buildingId = null, title = 'Project Documents', uploadRequest = null, onChanged, headerExtra = null }) {
  const { role } = useAuth()
  const canWrite = WRITE_ROLES.includes(role)
  const canReview = REVIEW_ROLES.includes(role)
  const [up, setUp] = useState(false)
  const [prefill, setPrefill] = useState(null)
  const [statusDoc, setStatusDoc] = useState(null)
  const [historyDoc, setHistoryDoc] = useState(null)
  const [replaceDoc, setReplaceDoc] = useState(null) // Option-A revision: re-submit inheriting the reference no
  // Project Documents lists EVERY submittal for the project (building-scoped ones
  // too); the building-scoped variant filters to one building. Ordering is
  // approved-first then most-recently-updated (Airtable-style).
  // Embed-free query (PostgREST joins were returning nothing in the client) —
  // resolve esm/building codes via separate maps, exactly like the Doc Tracker.
  const { rows, refetch } = useLiveQuery('project_documents',
    (q) => {
      let b = q.select('*').eq('project_id', projectId)
      if (buildingId) b = b.eq('building_id', buildingId)
      return b.order('updated_at', { ascending: false, nullsFirst: false })
    }, [projectId, buildingId])
  const { rows: pEsms } = useLiveQuery('project_esms',
    (q) => q.select('custom_name,ordinal,esm:esms(id,code,name)').eq('project_id', projectId).order('ordinal'), [projectId])
  const { rows: bldgs } = useLiveQuery('buildings',
    (q) => q.select('id,code,name,status_override').eq('project_id', projectId).order('code'), [projectId])
  const { rows: profs } = useLiveQuery('profiles', (q) => q.select('id,full_name'), [])
  const nameById = Object.fromEntries(profs.map((p) => [p.id, p.full_name]))
  const esmCodeById = Object.fromEntries(pEsms.filter((pe) => pe.esm).map((pe) => [pe.esm.id, pe.esm.code]))
  const bldgCodeById = Object.fromEntries(bldgs.map((b) => [b.id, b.code]))
  const APPROVED_SET = new Set(['approved', 'approved_with_comments'])
  const sortedRows = [...rows].sort((a, b) => {
    const aa = APPROVED_SET.has(a.status) ? 0 : 1, bb = APPROVED_SET.has(b.status) ? 0 : 1
    if (aa !== bb) return aa - bb
    return new Date(b.updated_at || b.submitted_at || 0) - new Date(a.updated_at || a.submitted_at || 0)
  })
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
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{headerExtra}{canWrite && <Btn icon="upload" style={{ padding: '7px 11px', fontSize: 12 }} onClick={() => { setPrefill(null); setUp(true) }}>Upload document</Btn>}</div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>Every submittal for this project — MIR, WIR, COC, material submittals and method statements. Approved first, then most recently updated. Open any file directly.</div>
      {sortedRows.length === 0 ? <Empty icon="doc">No documents submitted yet.</Empty> : (
        <div className="ies-table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 860 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
              <th style={{ padding: 8, fontWeight: 600 }}>NAME</th><th style={{ padding: 8, fontWeight: 600 }}>REFERENCE</th><th style={{ padding: 8, fontWeight: 600 }}>ESM</th><th style={{ padding: 8, fontWeight: 600 }}>TYPE</th>
              <th style={{ padding: 8, fontWeight: 600 }}>REV</th><th style={{ padding: 8, fontWeight: 600 }}>STATUS</th><th style={{ padding: 8, fontWeight: 600 }}>SUBMITTED</th>
              <th style={{ padding: 8, fontWeight: 600 }}>CLIENT REVIEWER</th><th style={{ padding: 8, fontWeight: 600 }}>RESPONDED</th>
              <th style={{ padding: 8, fontWeight: 600 }} title="Days the submittal has spent with the client (response date − submitted, or days pending)">DAYS IN COURT</th>
              <th style={{ padding: 8, fontWeight: 600 }}>NOTES</th>
              {(canWrite || canReview) && <th style={{ padding: 8, fontWeight: 600 }} />}
            </tr></thead>
            <tbody>
              {sortedRows.map((d) => {
                const [lbl, col, bg, tip] = docStatusMeta(d.status)
                const typeLabel = d.doc_type === 'other' ? (d.custom_type_label || 'Other') : (TYPE_LABEL[d.doc_type] || d.doc_type)
                return (
                  <tr key={d.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '9px 8px', fontWeight: 600 }}>
                      {d.storage_path
                        ? <button onClick={() => openDoc(d)} title={`Open file — ${d.name}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 320, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: 12.5, padding: 0, textDecoration: 'underline' }}><Icon name="doc" size={13} /><span className="ies-ellipsis" title={d.name}>{d.name}</span></button>
                        : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 320, color: 'var(--text-3)' }}><Icon name="doc" size={13} /><span className="ies-ellipsis" title={d.name}>{d.name}</span></span>}
                      {bldgCodeById[d.building_id] && <span style={{ marginLeft: 6, fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--text-3)' }}>· {bldgCodeById[d.building_id]}</span>}
                      <button title="View submission history" onClick={() => setHistoryDoc(d)} style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 12 }}>⌚</button>
                    </td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>{d.reference_no || '—'}{d.rev_no > 0 && <span title={`Revision ${d.rev_no}`} style={{ marginLeft: 5, fontSize: 9.5, color: '#fff', background: 'var(--accent)', padding: '1px 5px', borderRadius: 5 }}>R{d.rev_no}</span>}</td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)' }}>{esmCodeById[d.esm_id] || '—'}</td>
                    <td style={{ padding: '9px 8px', color: 'var(--text-3)' }}>{typeLabel}</td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', fontWeight: 700 }}>{d.revision || 'A'}</td>
                    <td style={{ padding: '9px 8px' }}><span title={tip} style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: col, background: bg, cursor: 'help' }}>{lbl}</span></td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{fmtIso(d.submitted_at)}{nameById[d.submitted_by] && <div style={{ fontFamily: 'var(--font)', fontSize: 10 }}>by {nameById[d.submitted_by]}</div>}</td>
                    <td style={{ padding: '9px 8px', color: 'var(--text-3)' }}>{d.client_reviewer_name || '—'}</td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{fmtIso(d.client_response_date)}</td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)' }}>{(() => { const x = daysInCourt(d); if (!x) return <span style={{ color: 'var(--text-3)' }}>—</span>; const warn = x.pending && x.days > 14; return <span title={x.pending ? 'Still awaiting client response' : 'Client response turnaround'} style={{ color: warn ? 'var(--bad)' : 'var(--text-3)', fontWeight: warn ? 700 : 400 }}>{x.days}d{x.pending ? '*' : ''}</span> })()}</td>
                    <td style={{ padding: '9px 8px', color: 'var(--text-3)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.response_notes || ''}>{d.response_notes || '—'}</td>
                    {(canWrite || canReview) && (
                      <td style={{ padding: '9px 8px', whiteSpace: 'nowrap' }}>
                        {canWrite && <button onClick={() => setReplaceDoc(d)} className="ies-hover" title="Re-submit a new revision keeping this reference number" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', border: '1px solid var(--line)', borderRadius: 7, padding: '4px 9px', background: '#fff', cursor: 'pointer', marginRight: 8 }}>Replace</button>}
                        {canReview && <button onClick={() => setStatusDoc(d)} className="ies-hover" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent)', border: '1px solid var(--line)', borderRadius: 7, padding: '4px 9px', background: '#fff', cursor: 'pointer' }}>Update Status</button>}
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
      {historyDoc && <DocHistoryDrawer doc={historyDoc} onClose={() => setHistoryDoc(null)} />}
      {/* Replace (Option-A revision): MIR/WIR re-generate, other kinds re-upload */}
      {replaceDoc && ['mir', 'wir'].includes(replaceDoc.doc_type) && project && (
        <InspectionFormModal kind={replaceDoc.doc_type} project={project}
          esm={replaceDoc.esm_id ? { id: replaceDoc.esm_id } : null}
          building={replaceDoc.building_id ? { id: replaceDoc.building_id } : null}
          replaceOf={{ referenceNo: replaceDoc.reference_no, revNo: (replaceDoc.rev_no || 0) + 1, title: replaceDoc.name, storageLocation: replaceDoc.storage_location, installationAreas: replaceDoc.installation_areas, esm_id: replaceDoc.esm_id }}
          onClose={() => setReplaceDoc(null)} onDone={afterChange} />
      )}
      {replaceDoc && !(['mir', 'wir'].includes(replaceDoc.doc_type) && project) && (
        <UploadModal projectId={projectId} buildingId={buildingId} esmOpts={esmOpts} bldgOpts={bldgOpts} rows={rows}
          prefill={{ esmId: replaceDoc.esm_id, docType: replaceDoc.doc_type, buildingId: replaceDoc.building_id }} replaceOf={replaceDoc}
          onClose={() => setReplaceDoc(null)} onDone={afterChange} />
      )}
    </div>
  )
}

// ── Doc lifecycle: submit → with client → approved/comments/rejected ────────
// History rows are written automatically by the DB trigger on status change.
export function UpdateStatusModal({ doc, onClose, onDone, progressPct = null }) {
  const { user } = useAuth()
  const [reviewer, setReviewer] = useState(doc.client_reviewer_name || '')
  const [notes, setNotes] = useState(doc.response_notes || '')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  // Sprint 8J-3 — soft guard: approving below 90% building progress prompts first.
  const [confirmApprove, setConfirmApprove] = useState(null)

  const apply = async (patch) => {
    setBusy(true)
    const { data, error } = await bgUpdate('project_documents', doc.id, patch)
    setBusy(false)
    if (error) return
    if (Array.isArray(data) && data.length === 0) { toast("You don't have permission to update this document", 'err'); return }
    onDone?.(); onClose()
  }
  const now = () => new Date().toISOString()
  const uploadFile = async () => {
    if (!file) return null
    const toUp = file.type.startsWith('image/') ? await compressImage(file, { maxBytes: 500000 }) : file
    const { path, error } = await uploadToBucket('project-docs', toUp, { userId: user.id, prefix: doc.project_id })
    if (error) return { error }
    return { path }
  }
  const decide = async (decision, confirmed = false) => {
    const needsFile = decision === 'approved' || decision === 'approved_with_comments'
    // Soft 90% guard (COC only — progressPct is passed in that context). UI-only;
    // the client remains responsible, so this just confirms, never blocks.
    if (needsFile && progressPct != null && progressPct < 90 && !confirmed) { setConfirmApprove(decision); return }
    if (needsFile && !reviewer.trim()) { toast('Client reviewer name is required', 'err'); return }
    if (needsFile && !file) { toast('Upload the approved version file', 'err'); return }
    if (decision === 'approved_with_comments' && !notes.trim()) { toast('Notes capturing the client comments are required', 'err'); return }
    if (decision === 'rejected' && !notes.trim()) { toast('Rejection reason (notes) is required', 'err'); return }
    setBusy(true)
    let storage_path
    if (needsFile) { const up = await uploadFile(); if (up?.error) { setBusy(false); return } storage_path = up?.path }
    setBusy(false)
    const patch = decision === 'submitted' ? { status: 'submitted', submitted_at: doc.submitted_at || now() }
      : decision === 'under_review' ? { status: 'under_review', client_reviewer_name: reviewer.trim() || null }
      : { status: decision, client_reviewer_name: reviewer.trim() || null, client_response_date: now(), response_notes: notes.trim() || null, ...(storage_path ? { storage_path } : {}) }
    return apply(patch)
  }
  const createRevision = async () => {
    setBusy(true)
    const { error } = await bgInsert('project_documents', {
      project_id: doc.project_id, building_id: doc.building_id || null, esm_id: doc.esm_id || null, delivery_id: doc.delivery_id || null,
      doc_type: doc.doc_type, custom_type_label: doc.custom_type_label || null, name: doc.name, storage_path: null,
      revision: nextRev(doc.revision), version: doc.version || 'A', status: 'draft', submitted_by: doc.submitted_by || null,
    })
    setBusy(false); if (!error) { onDone?.(); onClose() }
  }
  const btn = (label, onClick, variant = 'secondary') => <Btn variant={variant} style={{ fontSize: 12, padding: '7px 10px' }} disabled={busy} onClick={onClick}>{label}</Btn>

  return (
    <Modal open width={540} title={`Update status · ${doc.name} (Rev ${doc.revision || 'A'})`} onClose={onClose}
      footer={<Btn onClick={onClose}>Close</Btn>}>
      <Field label="Client reviewer name (required to approve)"><input lang="en" style={inputStyle} value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="e.g. Eng. Khalid Al-Mutairi" /></Field>
      <Field label="Notes / client comments (required to reject or approve-with-comments)"><textarea style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Client comments / rejection reason" /></Field>
      <FileDropZone label="Approved / cover-comments version file (required for an approval)" accept=".pdf,image/*" maxSizeMb={25} onFiles={(f) => setFile(f)} helperText="PDF or image · 25 MB cap" />
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', margin: '4px 0 8px' }}>WORKFLOW</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {doc.status === 'draft' && btn('Mark Submitted', () => decide('submitted'))}
        {(doc.status === 'submitted') && btn('Mark With Client', () => decide('under_review'))}
        {btn('Approved by Client', () => decide('approved'), 'primary')}
        {btn('Approved w/ Comments', () => decide('approved_with_comments'))}
        {btn('Rejected', () => decide('rejected'), 'danger')}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', margin: '14px 0 8px' }}>RESUBMISSION</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {btn(`Create Revision ${nextRev(doc.revision)}`, createRevision)}
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Clones this as a draft (new file awaited); client review restarts.</span>
      </div>
      {confirmApprove && (
        <Modal open width={460} title="Building below 90% — approve anyway?" onClose={() => setConfirmApprove(null)}
          footer={<><Btn onClick={() => setConfirmApprove(null)}>Cancel</Btn><Btn variant="primary" disabled={busy} onClick={() => { const d = confirmApprove; setConfirmApprove(null); decide(d, true) }}>Approve anyway</Btn></>}>
          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
            This building is at <strong>{progressPct}%</strong> completion. COC approval typically requires at least 90%. Continue anyway?
          </div>
        </Modal>
      )}
    </Modal>
  )
}

// ── Doc submission history timeline drawer (5C) ─────────────────────────────
const ACTION_META = {
  submitted: ['Submitted to client', '#A0762B'], client_received: ['Received by client', '#6D5A8E'],
  approved: ['Approved', '#217A54'], approved_with_comments: ['Approved with comments', '#B45309'],
  rejected: ['Rejected', '#B3362B'], resubmitted: ['Resubmitted', '#A0762B'],
}
export function DocHistoryDrawer({ doc, onClose }) {
  const { rows: events } = useLiveQuery('doc_submission_history', (q) => q.select('*').eq('doc_id', doc.id).order('action_date', { ascending: true }), [doc.id])
  const { rows: people } = useLiveQuery('profiles', (q) => q.select('id,full_name'))
  const nameById = Object.fromEntries(people.map((p) => [p.id, p.full_name]))
  const openFile = async (p) => { const u = await signedUrlFor('project-docs', p); if (u) window.open(u, '_blank', 'noopener') }
  return (
    <Drawer open title={`History · ${doc.name}`} subtitle={`Rev ${doc.revision || 'A'} · ${doc.doc_type}`} onClose={onClose}>
      {events.length === 0 ? <Empty icon="doc">No history yet.</Empty> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {events.map((ev, i) => {
            const [lbl, c] = ACTION_META[ev.action] || [ev.action, '#8A8577']
            return (
              <div key={ev.id} style={{ display: 'flex', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: c, marginTop: 4 }} />
                  {i < events.length - 1 && <span style={{ flex: 1, width: 2, background: 'var(--line)' }} />}
                </div>
                <div style={{ paddingBottom: 16, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: c }}>{lbl}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>{fmtIso(ev.action_date)} · {nameById[ev.actor_id] || 'System'}</div>
                  {ev.notes && <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 3 }}>{ev.notes}</div>}
                  {ev.file_path && <button onClick={() => openFile(ev.file_path)} style={{ fontSize: 11.5, color: 'var(--accent)', textDecoration: 'underline', marginTop: 3, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Open attached file</button>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Drawer>
  )
}

function UploadModal({ projectId, buildingId, esmOpts, bldgOpts, rows, prefill, replaceOf = null, onClose, onDone }) {
  const { user } = useAuth()
  const suggestRev = (eid, dt, bid) => String.fromCharCode(65 + rows.filter((r) => r.esm_id === eid && r.doc_type === dt && (r.building_id || null) === (bid || null)).length)
  const [esmId, setEsmId] = useState(prefill?.esmId || esmOpts[0]?.id || '')
  const [bldgId, setBldgId] = useState(prefill?.buildingId || buildingId || '')
  const [type, setType] = useState(prefill?.docType || 'material_submittal')
  const [name, setName] = useState(replaceOf?.name || '')
  const [custom, setCustom] = useState('')
  const [revision, setRevision] = useState('A')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { setRevision(suggestRev(esmId, type, bldgId)) }, [esmId, type, bldgId]) // eslint-disable-line react-hooks/exhaustive-deps

  const onFile = (f) => {
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
      // Replace (Option A): inherit the reference number, bump the numeric revision
      ...(replaceOf ? { reference_no: replaceOf.reference_no, rev_no: (replaceOf.rev_no || 0) + 1 } : {}),
    }, { okMsg: replaceOf ? `Revision R${(replaceOf.rev_no || 0) + 1} submitted` : 'Document submitted' })
    setBusy(false); if (!error) { onDone?.(); onClose() }
  }

  const perBuilding = MULTI_KINDS.has(type)
  return (
    <Modal open width={560} title={replaceOf ? `Replace document · ${replaceOf.reference_no || ''} R${(replaceOf.rev_no || 0) + 1}` : 'Upload / submit document'} onClose={onClose}
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
      <FileDropZone label="File" accept=".pdf,image/*" maxSizeMb={25} onFiles={onFile} helperText="PDF stored as-is; images compressed to ≤500 KB; 25 MB cap" />
    </Modal>
  )
}
