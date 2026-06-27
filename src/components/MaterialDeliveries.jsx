import { useState, useRef } from 'react'
import { useLiveQuery, bgInsert, bgUpdate, bgDelete } from '../lib/db'
import { supabase } from '../lib/supabase'
import { useAuth } from '../rbac'
import { Empty, Btn, Modal, Field, inputStyle } from './ui'
import DateInput from './DateInput'
import { fmtDate } from '../lib/format'
import { toast } from '../lib/toast'
import InspectionFormModal from './InspectionFormModal'

const DSTATUS = {
  pending: ['Pending', '#64748B', '#F1F5F9'], in_transit: ['In Transit', '#2563EB', '#EFF6FF'],
  pending_approval: ['Pending approval', '#D97706', '#FFFBEB'],
  delivered: ['Delivered', '#10B981', '#ECFDF5'], rejected: ['Rejected', '#EF4444', '#FEF2F2'],
}
const DDESC = {
  pending: 'Supplier confirmed the order but it has not shipped yet.',
  in_transit: 'Shipped — on its way, awaiting on-site receipt.',
  pending_approval: 'Extracted from a delivery-note PDF — awaiting engineer approval.',
  delivered: 'Received on site and checked in against the submittal.',
  rejected: 'Delivery refused — wrong, damaged, or failed inspection.',
}
// Engineers (proje) can add + approve alongside the other write roles (migration 0061).
const WRITE_ROLES = ['admin', 'pmo', 'projm', 'progm', 'procm', 'proco', 'proje']
const inp = { padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 12.5, background: '#fff' }
const today = () => new Date().toISOString().slice(0, 10)

export default function MaterialDeliveries({ projectId, buildings = [] }) {
  const { user, role } = useAuth()
  const canWrite = WRITE_ROLES.includes(role)
  const { rows, refetch } = useLiveQuery('material_deliveries',
    (q) => q.select('*,building:buildings(id,code,name),esm:esms(id,code,name)').eq('project_id', projectId).order('scheduled_date', { ascending: true }), [projectId])
  const { rows: projRows } = useLiveQuery('projects',
    (q) => q.select('id,code,name,region,client,project_reference_no,beneficiary_entity,contractor_name,doc_rev').eq('id', projectId).is('deleted_at', null), [projectId])
  const [addOpen, setAddOpen] = useState(false)
  const [mirOpen, setMirOpen] = useState(false)
  const [rejectFor, setRejectFor] = useState(null) // delivery row being rejected
  const project = projRows[0]

  const patchRow = async (id, patch) => { const { error } = await bgUpdate('material_deliveries', id, patch); if (!error) refetch() }
  const removeRow = async (id) => { const { error } = await bgDelete('material_deliveries', id); if (!error) refetch() }
  const approve = (r) => patchRow(r.id, { status: 'delivered', approved_by: user.id, approved_at: new Date().toISOString() })
  const openPdf = async (path) => {
    const { data } = await supabase.storage.from('delivery-notes').createSignedUrl(path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener'); else toast("Couldn't open the PDF", 'err')
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Materials Delivery</div>
        {canWrite && <div style={{ display: 'flex', gap: 8 }}>
          <Btn icon="plus" variant="primary" style={{ padding: '7px 11px', fontSize: 12 }} onClick={() => setMirOpen(true)} disabled={!project}>Generate MIR</Btn>
          <Btn icon="plus" style={{ padding: '7px 11px', fontSize: 12 }} onClick={() => setAddOpen(true)}>Add delivery</Btn>
        </div>}
      </div>
      {rows.length === 0 ? <Empty icon="box">No deliveries scheduled.</Empty> : (
        <div className="ies-table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 760 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
              <th style={{ padding: 8, fontWeight: 600 }}>MATERIAL</th><th style={{ padding: 8, fontWeight: 600 }}>BUILDING</th>
              <th style={{ padding: 8, fontWeight: 600 }}>SCHEDULED</th><th style={{ padding: 8, fontWeight: 600 }}>ACTUAL</th>
              <th style={{ padding: 8, fontWeight: 600 }}>STATUS</th><th style={{ padding: 8, fontWeight: 600 }}>NOTES</th>{canWrite && <th />}
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const [lbl, col, bg] = DSTATUS[r.status] || DSTATUS.pending
                const isPdf = r.source === 'pdf'
                const isPending = r.status === 'pending_approval'
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '9px 8px', fontWeight: 600, maxWidth: 240 }}>
                      <span className="ies-ellipsis" title={r.material_name} style={{ verticalAlign: 'middle' }}>{r.material_name}</span>
                      {isPdf && r.pdf_path && <button onClick={() => openPdf(r.pdf_path)} title="Open the source delivery-note PDF" style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--accent)', border: '1px solid var(--line)', borderRadius: 6, padding: '1px 6px', background: '#fff', cursor: 'pointer' }}>📎 PDF</button>}
                    </td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>{r.building?.code || '—'}</td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{r.scheduled_date ? fmtDate(r.scheduled_date) : '—'}</td>
                    <td style={{ padding: '9px 8px' }}>
                      {canWrite && !isPending
                        ? <DateInput value={r.actual_date || ''} onChange={(e) => e.target.value !== (r.actual_date || '') && patchRow(r.id, { actual_date: e.target.value || null })} style={{ ...inp, padding: '4px 6px' }} />
                        : <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{r.actual_date ? fmtDate(r.actual_date) : '—'}</span>}
                    </td>
                    <td style={{ padding: '9px 8px' }}>
                      {canWrite && !isPending
                        ? <select title={DDESC[r.status] || ''} value={r.status} onChange={(e) => patchRow(r.id, { status: e.target.value })} style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 6, color: col, background: bg, border: `1px solid ${col}33` }}>{['pending', 'in_transit', 'delivered', 'rejected'].map((s) => <option key={s} value={s}>{DSTATUS[s][0]}</option>)}</select>
                        : <span title={DDESC[r.status] || ''} style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: col, background: bg, cursor: 'help' }}>{lbl}</span>}
                    </td>
                    <td style={{ padding: '9px 8px', color: 'var(--text-3)', fontSize: 11.5, maxWidth: 200 }}>
                      <span className="ies-clamp2" title={r.status === 'rejected' && r.rejection_reason ? `Rejected: ${r.rejection_reason}` : (r.notes || '')}>{r.status === 'rejected' && r.rejection_reason ? `Rejected: ${r.rejection_reason}` : (r.notes || '—')}</span>
                    </td>
                    {canWrite && <td style={{ padding: '9px 8px', whiteSpace: 'nowrap' }}>
                      {isPending ? (
                        <>
                          <button onClick={() => approve(r)} style={{ color: '#10B981', fontSize: 11.5, fontWeight: 700, marginRight: 8 }}>Approve</button>
                          <button onClick={() => setRejectFor(r)} style={{ color: 'var(--bad)', fontSize: 11.5, fontWeight: 700 }}>Reject</button>
                        </>
                      ) : (
                        <button onClick={() => removeRow(r.id)} style={{ color: 'var(--bad)', fontSize: 11.5, fontWeight: 700 }}>Remove</button>
                      )}
                    </td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {addOpen && project && (
        <AddDeliveryModal projectId={projectId} buildings={buildings} userId={user.id}
          onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); refetch() }} />
      )}
      {rejectFor && (
        <RejectModal row={rejectFor} userId={user.id}
          onClose={() => setRejectFor(null)} onDone={() => { setRejectFor(null); refetch() }} />
      )}
      {mirOpen && project && (
        <InspectionFormModal kind="mir" project={project} esm={null} building={null}
          onClose={() => setMirOpen(false)} onDone={refetch} />
      )}
    </div>
  )
}

// ── Reject (with reason) ─────────────────────────────────────────────────────
function RejectModal({ row, userId, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!reason.trim()) { toast('A reason is required to reject', 'err'); return }
    setBusy(true)
    const { error } = await bgUpdate('material_deliveries', row.id,
      { status: 'rejected', rejection_reason: reason.trim(), approved_by: userId, approved_at: new Date().toISOString() })
    setBusy(false); if (!error) onDone()
  }
  return (
    <Modal open width={460} title={`Reject delivery · ${row.material_name}`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="danger" onClick={submit} disabled={busy}>{busy ? 'Rejecting…' : 'Reject delivery'}</Btn></>}>
      <Field label="Reason for rejection (required)">
        <textarea lang="en" style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Quantity mismatch vs PO / damaged on arrival" />
      </Field>
    </Modal>
  )
}

// ── Add delivery — two tabs: Upload PDF (default) + Manual entry ──────────────
function AddDeliveryModal({ projectId, buildings, userId, onClose, onSaved }) {
  const [tab, setTab] = useState('pdf')
  const tabBtn = (k, label) => (
    <button onClick={() => setTab(k)} style={{ padding: '8px 14px', fontSize: 13, fontWeight: tab === k ? 700 : 500, color: tab === k ? 'var(--accent)' : 'var(--text-3)', borderBottom: tab === k ? '2px solid var(--accent)' : '2px solid transparent', background: 'none', marginBottom: -1 }}>{label}</button>
  )
  return (
    <Modal open width={760} title="Add delivery" onClose={onClose}>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--line)', marginBottom: 16 }}>
        {tabBtn('pdf', 'Upload PDF')}{tabBtn('manual', 'Manual entry')}
      </div>
      {tab === 'pdf'
        ? <PdfTab projectId={projectId} buildings={buildings} userId={userId} onClose={onClose} onSaved={onSaved} />
        : <ManualTab projectId={projectId} buildings={buildings} userId={userId} onSaved={onSaved} />}
    </Modal>
  )
}

// ── Manual tab (the previous inline-add fields) ──────────────────────────────
function ManualTab({ projectId, buildings, userId, onSaved }) {
  const [f, setF] = useState({ material_name: '', building_id: '', scheduled_date: '', status: 'pending', notes: '' })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const save = async () => {
    if (!f.material_name.trim()) { toast('Material is required', 'err'); return }
    setBusy(true)
    const { error } = await bgInsert('material_deliveries', {
      project_id: projectId, material_name: f.material_name.trim(), building_id: f.building_id || null,
      scheduled_date: f.scheduled_date || null, status: f.status, notes: f.notes || null, source: 'manual', created_by: userId,
    }, { okMsg: 'Delivery added' })
    setBusy(false); if (!error) onSaved()
  }
  return (
    <div>
      <Field label="Material"><input lang="en" style={inputStyle} value={f.material_name} onChange={(e) => set('material_name', e.target.value)} placeholder="Material name" /></Field>
      <Field label="Building"><select style={inputStyle} value={f.building_id} onChange={(e) => set('building_id', e.target.value)}><option value="">All / —</option>{buildings.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}</select></Field>
      <Field label="Scheduled date"><DateInput style={inputStyle} value={f.scheduled_date} onChange={(e) => set('scheduled_date', e.target.value)} /></Field>
      <Field label="Status"><select style={inputStyle} value={f.status} onChange={(e) => set('status', e.target.value)}>{['pending', 'in_transit', 'delivered', 'rejected'].map((s) => <option key={s} value={s}>{DSTATUS[s][0]}</option>)}</select></Field>
      <Field label="Notes"><input lang="en" style={inputStyle} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Optional" /></Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Btn variant="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add delivery'}</Btn></div>
    </div>
  )
}

// ── PDF tab — upload → AI extract → review → save as pending_approval ─────────
function PdfTab({ projectId, buildings, userId, onClose, onSaved }) {
  const { rows: materials } = useLiveQuery('materials', (q) => q.select('id,code,name,unit,esm_id').order('code'))
  const [file, setFile] = useState(null)
  const [buildingId, setBuildingId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [pdfPath, setPdfPath] = useState('')
  const [header, setHeader] = useState(null) // { supplier, po_ref, invoice_no, delivery_date, dateDefaulted }
  const [lines, setLines] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return
    if (f.type !== 'application/pdf') { setErr('Please choose a PDF file.'); return }
    if (f.size > 5 * 1024 * 1024) { setErr('PDF exceeds the 5 MB limit.'); return }
    setErr(''); setFile(f); setHeader(null); setLines(null)
  }

  const extract = async () => {
    if (!file) return
    setErr(''); setBusy(true)
    const path = `${projectId}/${crypto.randomUUID()}.pdf`
    const up = await supabase.storage.from('delivery-notes').upload(path, file, { contentType: 'application/pdf', upsert: false })
    if (up.error) { setBusy(false); setErr('Upload failed — ' + up.error.message); return }
    setPdfPath(path)
    const { data, error } = await supabase.functions.invoke('extract-delivery-pdf', { body: { project_id: projectId, pdf_path: path } })
    setBusy(false)
    if (error) {
      let msg = 'Extraction failed — please try again or use Manual entry.'
      try { const j = await error.context?.json?.(); if (j?.message) msg = j.message } catch (_) { /* keep default */ }
      setErr(msg); return
    }
    const e = data.extracted || {}
    const dateDefaulted = !e.delivery_date
    setHeader({ supplier: e.supplier || '', po_ref: e.po_ref || '', invoice_no: e.invoice_no || '', delivery_date: e.delivery_date || today(), dateDefaulted })
    setLines((data.lines_with_matches || []).map((l) => ({
      material_id: l.material_id || '', material_description: l.material_description || '',
      qty: l.qty ?? '', unit: l.unit || l.catalog_unit || '', raw_text: l.raw_text || '',
      catalog_name: l.catalog_name || '', match_type: l.match_type, showRaw: false,
    })))
  }

  const setLine = (i, patch) => setLines((arr) => arr.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const allMatched = lines && lines.every((l) => !!l.material_id)
  const canSave = !!buildingId && allMatched && !saving

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    const matById = Object.fromEntries(materials.map((m) => [m.id, m]))
    const rows = lines.map((l) => {
      const m = matById[l.material_id]
      const note = [l.qty !== '' ? `Qty ${l.qty}${l.unit ? ' ' + l.unit : ''}` : '', l.raw_text].filter(Boolean).join(' · ')
      return {
        project_id: projectId, building_id: buildingId, material_id: l.material_id,
        material_name: m?.name || l.material_description, esm_id: m?.esm_id || null,
        scheduled_date: header.delivery_date || null, status: 'pending_approval', source: 'pdf',
        pdf_path: pdfPath, notes: note || null, created_by: userId,
        extracted_metadata: { header, line: { ...l, showRaw: undefined } },
      }
    })
    const { error } = await bgInsert('material_deliveries', rows)
    setSaving(false)
    if (!error) { toast(`✓ ${rows.length} deliver${rows.length === 1 ? 'y' : 'ies'} created, awaiting engineer approval`); onSaved() }
  }

  // ----- preview not loaded yet: upload form -----
  if (!lines) {
    return (
      <div>
        <Field label="Building (required — every line lands on this building)">
          <select style={{ ...inputStyle, borderColor: buildingId ? 'var(--line)' : '#FCA5A5' }} value={buildingId} onChange={(e) => setBuildingId(e.target.value)}>
            <option value="">Choose a building…</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
          </select>
        </Field>
        <Field label="Delivery-note PDF (max 5 MB)">
          <input ref={fileRef} type="file" accept="application/pdf" onChange={onFile} style={{ display: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Btn icon="upload" onClick={() => fileRef.current?.click()}>{file ? 'Change PDF' : 'Choose PDF'}</Btn>
            <span style={{ fontSize: 12.5, color: file ? 'var(--text)' : 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file?.name}>{file?.name || 'No file chosen'}</span>
          </div>
        </Field>
        {err && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 10, fontSize: 12.5, color: '#B91C1C', marginBottom: 10 }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={extract} disabled={!file || !buildingId || busy} title={!buildingId ? 'Pick a building first' : (!file ? 'Choose a PDF first' : undefined)}>{busy ? 'Reading delivery note… 5–15s' : 'Extract delivery'}</Btn>
        </div>
      </div>
    )
  }

  // ----- review preview -----
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <Field label="Supplier"><input lang="en" style={inputStyle} value={header.supplier} onChange={(e) => setHeader({ ...header, supplier: e.target.value })} /></Field>
        <Field label="PO ref"><input lang="en" style={inputStyle} value={header.po_ref} onChange={(e) => setHeader({ ...header, po_ref: e.target.value })} /></Field>
        <Field label="Invoice no"><input lang="en" style={inputStyle} value={header.invoice_no} onChange={(e) => setHeader({ ...header, invoice_no: e.target.value })} /></Field>
        <Field label="Delivery date">
          <DateInput style={inputStyle} value={header.delivery_date} onChange={(e) => setHeader({ ...header, delivery_date: e.target.value, dateDefaulted: false })} />
          {header.dateDefaulted && <div style={{ fontSize: 11, color: '#D97706', marginTop: 3 }}>ⓘ defaulted to today (none found in PDF)</div>}
        </Field>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>Review each line. Unmatched codes (⚠) must be linked to a catalog material before saving.</div>
      <div className="ies-table-wrap" style={{ maxHeight: 320, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 9.5, fontFamily: 'var(--mono)', position: 'sticky', top: 0, background: '#F8FAFC' }}>
            <th style={{ padding: 7 }} /><th style={{ padding: 7 }}>MATERIAL</th><th style={{ padding: 7, width: 64 }}>QTY</th><th style={{ padding: 7, width: 80 }}>UNIT</th><th style={{ padding: 7, width: 40 }} />
          </tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const matched = !!l.material_id
              return (
                <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '6px 7px', textAlign: 'center' }} title={matched ? 'Matched to catalog' : 'Not in catalog — pick a material'}>{matched ? <span style={{ color: '#10B981' }}>✓</span> : <span style={{ color: '#D97706' }}>⚠</span>}</td>
                  <td style={{ padding: '6px 7px' }}>
                    <select value={l.material_id} onChange={(e) => setLine(i, { material_id: e.target.value })}
                      style={{ ...inp, width: '100%', borderColor: matched ? 'var(--line)' : '#FCA5A5' }}>
                      <option value="">{`⚠ Pick from catalog — "${(l.material_description || '').slice(0, 40)}"`}</option>
                      {materials.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}
                    </select>
                    {!matched && <div style={{ fontSize: 10.5, color: '#B91C1C', marginTop: 2 }}>Not in catalog — pick an existing material (or add it in Materials first).</div>}
                  </td>
                  <td style={{ padding: '6px 7px' }}><input style={{ ...inp, width: 56 }} value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} /></td>
                  <td style={{ padding: '6px 7px' }}><input style={{ ...inp, width: 70 }} value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} /></td>
                  <td style={{ padding: '6px 7px', textAlign: 'center' }}><button title="Show raw extracted text" onClick={() => setLine(i, { showRaw: !l.showRaw })} style={{ fontSize: 11, color: 'var(--text-3)' }}>{l.showRaw ? '▲' : '▼'}</button></td>
                </tr>
              )
            })}
            {lines.map((l, i) => l.showRaw ? (
              <tr key={'raw' + i}><td /><td colSpan={4} style={{ padding: '4px 7px', fontSize: 11, color: 'var(--text-3)' }} dir="auto"><strong>Raw:</strong> {l.raw_text || '—'}</td></tr>
            ) : null)}
          </tbody>
        </table>
      </div>
      {err && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 10, fontSize: 12.5, color: '#B91C1C', marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <span style={{ fontSize: 11.5, color: allMatched ? '#047857' : '#B45309' }}>{allMatched ? 'All lines matched.' : 'Some lines are unmatched — resolve them to enable Save.'}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save} disabled={!canSave} title={!buildingId ? 'Pick a building' : (!allMatched ? 'Resolve unmatched lines' : undefined)}>{saving ? 'Saving…' : 'Save as pending'}</Btn>
        </div>
      </div>
    </div>
  )
}
