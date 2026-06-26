import { useState } from 'react'
import { useAuth } from '../rbac'
import { useLiveQuery } from '../lib/db'
import { supabase } from '../lib/supabase'
import { Modal, Field, inputStyle, Btn } from './ui'
import { compressImage } from '../lib/image'
import { toast } from '../lib/toast'
import { buildInspectionPdf, commitInspectionDoc } from './CocWizard'

// Multi-item MIR / WIR generator. Project-level fields (Reference No / Contractor
// / Beneficiary) come from the project record — not retyped here. The user builds
// a multi-row item list, attaches photos, previews the real PDF, then Downloads
// (which commits to Doc Tracker + Project Documents) or Cancels (nothing saved).
const emptyRow = () => ({ description: '', brand: '', model: '', qty: '', unit: 'pcs' })

export default function InspectionFormModal({ kind, project, esm = null, building = null, onClose, onDone }) {
  const { user, profile } = useAuth()
  const today = new Date().toISOString().slice(0, 10)
  const generatedBy = profile?.full_name || user?.email || ''
  const title0 = kind === 'mir' ? 'Generate MIR' : 'Generate WIR'

  const [view, setView] = useState('form') // 'form' | 'preview'
  const [docTitle, setDocTitle] = useState('')
  const [rows, setRows] = useState([emptyRow()])
  const [esmId, setEsmId] = useState(esm?.id || '')
  const [photos, setPhotos] = useState([]) // File[]
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null) // { url, bytes, refNo }

  const { rows: pEsms } = useLiveQuery('project_esms',
    (q) => q.select('esm:esms(id,code,name),custom_name,ordinal').eq('project_id', project?.id).order('ordinal'), [project?.id])
  const esmOpts = pEsms.filter((pe) => pe.esm).map((pe) => ({ id: pe.esm.id, code: pe.esm.code, name: pe.custom_name || pe.esm.name }))
  const chosenEsm = esmOpts.find((e) => e.id === esmId) || esm || null

  const { rows: items } = useLiveQuery('project_installed_items',
    (q) => q.select('id,item_description,model_code,capacity_value,capacity_unit,total_quantity,esm_code').eq('project_id', project?.id), [project?.id])

  // project defaults that must be set once in Project Settings
  const missing = ['project_reference_no', 'contractor_name', 'beneficiary_entity'].filter((k) => !project?.[k])

  const addBlank = () => setRows((r) => [...r, emptyRow()])
  const addFromItem = (id) => {
    const it = items.find((x) => x.id === id); if (!it) return
    setRows((r) => [...r.filter((x) => x.description || x.qty), {
      description: it.item_description || '', brand: '', model: it.model_code || '',
      qty: it.total_quantity ?? '', unit: it.capacity_unit || 'pcs',
    }])
  }
  const setRow = (i, patch) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))
  const removeRow = (i) => setRows((r) => (r.length === 1 ? [emptyRow()] : r.filter((_, idx) => idx !== i)))
  const addPhotos = (e) => { const fs = Array.from(e.target.files || []); if (fs.length) setPhotos((p) => [...p, ...fs]); e.target.value = '' }
  const removePhoto = (i) => setPhotos((p) => p.filter((_, idx) => idx !== i))

  const validRows = rows.filter((r) => r.description.trim())

  const generatePreview = async () => {
    if (!validRows.length) { toast('Add at least one item (description required)', 'err'); return }
    setBusy(true)
    let photoFiles = photos
    try { photoFiles = await Promise.all(photos.map((f) => (f.type.startsWith('image/') ? compressImage(f, { maxBytes: 350000, maxDim: 1280 }) : f))) } catch { photoFiles = photos }
    let refNo = ''
    try { const { data } = await supabase.rpc('next_doc_reference', { p_project_id: project.id, p_doc_type: kind }); refNo = data || '' } catch { refNo = '' }
    const items2 = validRows.map((r) => ({ description: r.description.trim(), brand: r.brand.trim(), model: r.model.trim(), qty: r.qty, unit: r.unit }))
    let bytes
    try {
      bytes = await buildInspectionPdf({ kind, project, esm: chosenEsm, building, items: items2, photoFiles, title: docTitle.trim(), generatedBy, referenceNo: refNo })
    } catch (e) { setBusy(false); toast('Could not build the PDF — ' + (e?.message || ''), 'err'); return }
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    setPreview({ url, bytes, refNo })
    setView('preview'); setBusy(false)
  }

  const download = async () => {
    if (!preview) return
    setBusy(true)
    const res = await commitInspectionDoc({ kind, project, esm: chosenEsm, building, userId: user.id, referenceNo: preview.refNo, title: docTitle.trim() || (chosenEsm ? chosenEsm.code : kind.toUpperCase()), bytes: preview.bytes })
    setBusy(false)
    if (res?.error) { toast(`${kind.toUpperCase()} save failed — ${res.error.message || ''}`, 'err'); return }
    const a = document.createElement('a'); a.href = preview.url; a.download = res.filename; document.body.appendChild(a); a.click(); a.remove()
    toast(`${res.referenceNo} generated — added to Doc Tracker`)
    onDone?.(); onClose?.()
  }
  const backToForm = () => { if (preview?.url) URL.revokeObjectURL(preview.url); setPreview(null); setView('form') }
  const cancel = () => { if (preview?.url) URL.revokeObjectURL(preview.url); onClose?.() }

  const readOnly = { ...inputStyle, background: '#F8FAFC', color: 'var(--text-3)' }
  const cell = { padding: '5px 7px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, width: '100%' }

  if (view === 'preview') {
    return (
      <Modal open width={760} title={`${title0} — preview`} onClose={cancel}
        footer={<><Btn onClick={backToForm}>Edit fields</Btn><Btn onClick={cancel}>Cancel</Btn><Btn variant="primary" onClick={download} disabled={busy}>{busy ? 'Saving…' : 'Download & save'}</Btn></>}>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 8 }}>Reference <strong style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>{preview?.refNo || '—'}</strong>. Review the document below. Nothing is saved until you click Download &amp; save.</div>
        <iframe title="PDF preview" src={preview?.url} style={{ width: '100%', height: 520, border: '1px solid var(--line)', borderRadius: 8 }} />
      </Modal>
    )
  }

  return (
    <Modal open width={720} title={title0} onClose={cancel}
      footer={<><Btn onClick={cancel}>Cancel</Btn><Btn variant="primary" onClick={generatePreview} disabled={busy}>{busy ? 'Building…' : 'Generate preview'}</Btn></>}>
      {missing.length > 0 && (
        <div style={{ background: '#FEF9C3', border: '1px solid #FDE68A', color: '#854D0E', borderRadius: 9, padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>
          Set <strong>Project Reference No / Contractor / Beneficiary</strong> in Project Settings (Edit project) so they appear on every MIR/WIR/COC. Missing now: {missing.map((m) => m.replace(/_/g, ' ')).join(', ')}. You can still generate; those fields will be blank.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Project"><input lang="en" style={readOnly} value={`${project?.name || ''} (${project?.code || ''})`} readOnly /></Field>
        <Field label="Generated by"><input lang="en" style={readOnly} value={generatedBy} readOnly /></Field>
        <Field label="Date"><input lang="en" style={readOnly} value={today} readOnly /></Field>
        <Field label="ESM (which Doc Tracker row this lands in)">
          <select style={inputStyle} value={esmId} onChange={(e) => setEsmId(e.target.value)}>
            <option value="">— Not ESM-specific —</option>
            {esmOpts.map((e) => <option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Title (used in the filename & document name)"><input lang="en" style={inputStyle} value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="e.g. Lighting Batch A" /></Field>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '8px 0 4px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700 }}>Items ({validRows.length})</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value="" onChange={(e) => addFromItem(e.target.value)} style={{ ...cell, width: 'auto', fontWeight: 600 }}>
            <option value="">+ Add from Items &amp; Replacements…</option>
            {items.map((it) => <option key={it.id} value={it.id}>{it.esm_code} · {it.item_description || '(unnamed)'} {it.model_code ? '· ' + it.model_code : ''}</option>)}
          </select>
          <button onClick={addBlank} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>+ Add blank row</button>
        </div>
      </div>
      <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
          <th style={{ padding: 4 }}>DESCRIPTION</th><th style={{ padding: 4, width: 90 }}>BRAND</th><th style={{ padding: 4, width: 100 }}>MODEL</th><th style={{ padding: 4, width: 60 }}>QTY</th><th style={{ padding: 4, width: 56 }}>UNIT</th><th style={{ width: 26 }} />
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ padding: 2 }}><input lang="en" style={cell} value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} placeholder="Item description" /></td>
              <td style={{ padding: 2 }}><input lang="en" style={cell} value={r.brand} onChange={(e) => setRow(i, { brand: e.target.value })} placeholder="Brand" /></td>
              <td style={{ padding: 2 }}><input lang="en" style={cell} value={r.model} onChange={(e) => setRow(i, { model: e.target.value })} placeholder="Model" /></td>
              <td style={{ padding: 2 }}><input lang="en" inputMode="numeric" style={cell} value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} placeholder="Qty" /></td>
              <td style={{ padding: 2 }}><input lang="en" style={cell} value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })} placeholder="pcs" /></td>
              <td style={{ padding: 2, textAlign: 'center' }}><button title="Remove row" onClick={() => removeRow(i)} style={{ color: 'var(--bad)', fontWeight: 700 }}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table></div>

      <Field label={`Photos (${photos.length}) — embedded as a grid in the PDF`}>
        <label className="ies-hover" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: '1px dashed var(--line)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + Add photos<input type="file" accept="image/*" multiple onChange={addPhotos} style={{ display: 'none' }} />
        </label>
      </Field>
      {photos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {photos.map((f, i) => (
            <div key={i} style={{ position: 'relative', width: 64, height: 64, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)' }}>
              <img src={URL.createObjectURL(f)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button onClick={() => removePhoto(i)} title="Remove" style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 12, lineHeight: '16px' }}>×</button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
