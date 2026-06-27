import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../rbac'
import { useLiveQuery } from '../lib/db'
import { supabase } from '../lib/supabase'
import { Modal, Field, inputStyle, Btn } from './ui'
import { compressImage } from '../lib/image'
import { toast } from '../lib/toast'
import { buildInspectionPdf, commitInspectionDoc } from './CocWizard'

// Multi-item MIR / WIR generator with a LIVE side-by-side PDF preview: the iframe
// re-renders (debounced) as the user edits any field/item/photo. Project-level
// defaults (Reference No / Contractor / Beneficiary) come from the project record.
// Download commits to Doc Tracker + Project Documents; Cancel persists nothing.
const emptyRow = () => ({ description: '', brand: '', model: '', qty: '', unit: 'pcs' })

export default function InspectionFormModal({ kind, project, esm = null, building = null, onClose, onDone, replaceOf = null }) {
  const { user, profile } = useAuth()
  const today = new Date().toISOString().slice(0, 10)
  const generatedBy = profile?.full_name || user?.email || ''
  const revNo = replaceOf ? (replaceOf.revNo || 0) : 0
  const heading = (replaceOf ? `Replace ${kind.toUpperCase()}` : (kind === 'mir' ? 'Generate MIR' : 'Generate WIR')) + (revNo > 0 ? ` · R${revNo}` : '')

  const [docTitle, setDocTitle] = useState(replaceOf?.title || '')
  const [rows, setRows] = useState([emptyRow()])
  const [esmId, setEsmId] = useState(replaceOf?.esm_id || esm?.id || '')
  const [storage, setStorage] = useState(replaceOf?.storageLocation || '')
  const [installation, setInstallation] = useState(replaceOf?.installationAreas || '')
  const [photos, setPhotos] = useState([]) // [{ orig, preview, url }]
  const [refNo, setRefNo] = useState('')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const buildSeq = useRef(0)

  const { rows: pEsms } = useLiveQuery('project_esms',
    (q) => q.select('esm:esms(id,code,name),custom_name,ordinal').eq('project_id', project?.id).order('ordinal'), [project?.id])
  const esmOpts = pEsms.filter((pe) => pe.esm).map((pe) => ({ id: pe.esm.id, code: pe.esm.code, name: pe.custom_name || pe.esm.name }))
  const chosenEsm = esmOpts.find((e) => e.id === esmId) || esm || null
  const { rows: items } = useLiveQuery('project_installed_items',
    (q) => q.select('id,item_description,model_code,capacity_value,capacity_unit,total_quantity,esm_code').eq('project_id', project?.id), [project?.id])

  const missing = ['project_reference_no', 'contractor_name', 'beneficiary_entity'].filter((k) => !project?.[k])
  // MIR item picker (Sprint 8E #6): group items by ESM — the selected ESM first
  // (labelled "selected"), then the rest in ascending ESM order; within a group
  // sort by description then model.
  const ESM_RANK = (c) => ({ ESM1: 1, ESM2: 2, ESM3: 3 }[c] || 9)
  const groupedItems = (() => {
    const byEsm = {}
    items.forEach((it) => { (byEsm[it.esm_code] = byEsm[it.esm_code] || []).push(it) })
    const sel = chosenEsm?.code
    return Object.keys(byEsm)
      .sort((a, b) => (a === sel ? -1 : b === sel ? 1 : 0) || ESM_RANK(a) - ESM_RANK(b))
      .map((code) => ({ code, selected: code === sel, items: byEsm[code].slice().sort((x, y) => (x.item_description || '').localeCompare(y.item_description || '') || (x.model_code || '').localeCompare(y.model_code || '')) }))
  })()
  const validRows = rows.filter((r) => r.description.trim())
  const itemsForPdf = validRows.map((r) => ({ description: r.description.trim(), brand: r.brand.trim(), model: r.model.trim(), qty: r.qty, unit: r.unit }))

  // peek the reference number once; reused by every preview build + the commit.
  // When replacing, keep the original reference (a revision shares it).
  useEffect(() => {
    if (replaceOf?.referenceNo) { setRefNo(replaceOf.referenceNo); return }
    let live = true
    ;(async () => { try { const { data } = await supabase.rpc('next_doc_reference', { p_project_id: project.id, p_doc_type: kind }); if (live) setRefNo(data || '') } catch { /* keep blank */ } })()
    return () => { live = false }
  }, [project?.id, kind, replaceOf?.referenceNo])

  // live preview — debounced rebuild on any content change, cancelling in-flight
  useEffect(() => {
    const seq = ++buildSeq.current
    setPreviewBusy(true)
    const t = setTimeout(async () => {
      try {
        const bytes = await buildInspectionPdf({
          kind, project, esm: chosenEsm, building, items: itemsForPdf,
          photoFiles: photos.map((p) => p.preview), title: docTitle.trim(),
          generatedBy, referenceNo: refNo, storage: storage.trim(), installation: installation.trim(),
        })
        if (seq !== buildSeq.current) return // superseded by a newer edit
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
        setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url })
      } catch { /* keep last good preview */ }
      finally { if (seq === buildSeq.current) setPreviewBusy(false) }
    }, 250)
    return () => clearTimeout(t)
    // depends only on PDF content — focus / unrelated state never triggers a rebuild
  }, [docTitle, rows, esmId, photos, storage, installation, refNo]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const addBlank = () => setRows((r) => [...r, emptyRow()])
  const addFromItem = (id) => {
    const it = items.find((x) => x.id === id); if (!it) return
    setRows((r) => [...r.filter((x) => x.description || x.qty), {
      description: it.item_description || '', brand: '', model: it.model_code || '', qty: it.total_quantity ?? '', unit: it.capacity_unit || 'pcs',
    }])
  }
  const setRow = (i, patch) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))
  const removeRow = (i) => setRows((r) => (r.length === 1 ? [emptyRow()] : r.filter((_, idx) => idx !== i)))
  const addPhotos = async (e) => {
    const files = Array.from(e.target.files || []); e.target.value = ''
    if (!files.length) return
    // compress once to a small preview size (≈72dpi) for the live iframe
    const metas = await Promise.all(files.map(async (orig) => {
      let preview = orig
      try { preview = orig.type.startsWith('image/') ? await compressImage(orig, { maxBytes: 140000, maxDim: 900 }) : orig } catch { /* use orig */ }
      return { orig, preview, url: URL.createObjectURL(orig) }
    }))
    setPhotos((p) => [...p, ...metas])
  }
  const removePhoto = (i) => setPhotos((p) => { const m = p[i]; if (m?.url) URL.revokeObjectURL(m.url); return p.filter((_, idx) => idx !== i) })

  const download = async () => {
    if (!validRows.length) { toast('Add at least one item (description required)', 'err'); return }
    setBusy(true)
    // final render uses higher-resolution photos than the preview
    const finalFiles = await Promise.all(photos.map((p) => (p.orig.type.startsWith('image/') ? compressImage(p.orig, { maxBytes: 350000, maxDim: 1280 }).catch(() => p.orig) : p.orig)))
    let bytes
    try {
      bytes = await buildInspectionPdf({ kind, project, esm: chosenEsm, building, items: itemsForPdf, photoFiles: finalFiles, title: docTitle.trim(), generatedBy, referenceNo: refNo, storage: storage.trim(), installation: installation.trim() })
    } catch (e) { setBusy(false); toast('Could not build the PDF — ' + (e?.message || ''), 'err'); return }
    const res = await commitInspectionDoc({ kind, project, esm: chosenEsm, building, userId: user.id, referenceNo: refNo, revNo, title: docTitle.trim() || (chosenEsm ? chosenEsm.code : kind.toUpperCase()), storage: storage.trim(), installation: installation.trim(), bytes })
    setBusy(false)
    if (res?.error) { toast(`${kind.toUpperCase()} save failed — ${res.error.message || ''}`, 'err'); return }
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    const a = document.createElement('a'); a.href = url; a.download = res.filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    toast(`${res.referenceNo} generated — added to Doc Tracker`)
    onDone?.(); onClose?.()
  }

  const readOnly = { ...inputStyle, background: '#F8FAFC', color: 'var(--text-3)' }
  const cell = { padding: '5px 7px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, width: '100%' }

  return (
    <Modal open width={980} title={`${heading}${refNo ? ' · ' + refNo : ''}`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={download} disabled={busy}>{busy ? 'Saving…' : 'Download & save'}</Btn></>}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
        {/* ── form pane ─────────────────────────────────────────────── */}
        <div style={{ flex: '1 1 0', minWidth: 0, maxHeight: 560, overflowY: 'auto', paddingRight: 4 }}>
          {missing.length > 0 && (
            <div style={{ background: '#FEF9C3', border: '1px solid #FDE68A', color: '#854D0E', borderRadius: 9, padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>
              Set <strong>Project Reference No / Contractor / Beneficiary</strong> in Project Settings (Edit project) so they appear on every MIR/WIR/COC. Missing: {missing.map((m) => m.replace(/_/g, ' ')).join(', ')}. You can still generate; those fields will be blank.
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
          <Field label="Description (used in the filename & document name)"><input lang="en" style={inputStyle} value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="e.g. Lighting Batch A" /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Storage location"><input lang="en" style={inputStyle} value={storage} onChange={(e) => setStorage(e.target.value)} placeholder="e.g. Warehouse A, MOI-001 basement" /></Field>
            <Field label="Installation areas"><input lang="en" style={inputStyle} value={installation} onChange={(e) => setInstallation(e.target.value)} placeholder="e.g. all floors, exterior facade, parking" /></Field>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '8px 0 4px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>Items ({validRows.length})</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value="" onChange={(e) => addFromItem(e.target.value)} style={{ ...cell, width: 'auto', fontWeight: 600 }}>
                <option value="">+ Add from Items &amp; Replacements…</option>
                {groupedItems.map((g) => (
                  <optgroup key={g.code} label={`${g.code}${g.selected ? ' — selected' : ''}`}>
                    {g.items.map((it) => <option key={it.id} value={it.id}>{it.item_description || '(unnamed)'}{it.model_code ? ' · ' + it.model_code : ''}</option>)}
                  </optgroup>
                ))}
              </select>
              <button onClick={addBlank} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>+ Add blank row</button>
            </div>
          </div>
          <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
              <th style={{ padding: 4 }}>DESCRIPTION</th><th style={{ padding: 4, width: 80 }}>BRAND</th><th style={{ padding: 4, width: 90 }}>MODEL</th><th style={{ padding: 4, width: 54 }}>QTY</th><th style={{ padding: 4, width: 50 }}>UNIT</th><th style={{ width: 24 }} />
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

          <Field label={`Photos (${photos.length}) — 2 per page, large, on the last pages`}>
            <label className="ies-hover" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: '1px dashed var(--line)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              + Add photos<input type="file" accept="image/*" multiple onChange={addPhotos} style={{ display: 'none' }} />
            </label>
          </Field>
          {photos.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {photos.map((f, i) => (
                <div key={i} style={{ position: 'relative', width: 60, height: 60, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)' }}>
                  <img src={f.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button onClick={() => removePhoto(i)} title="Remove" style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 12, lineHeight: '16px' }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── live preview pane ─────────────────────────────────────── */}
        <div style={{ flex: '0 0 410px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            Live preview {previewBusy && <span style={{ color: 'var(--accent)', fontWeight: 600 }}>· Updating…</span>}
          </div>
          <div style={{ position: 'relative', flex: 1, minHeight: 540, border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', background: '#F8FAFC' }}>
            {previewUrl
              ? <iframe title="PDF preview" src={previewUrl} style={{ width: '100%', height: '100%', border: 'none' }} />
              : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-3)', fontSize: 12 }}>Building preview…</div>}
            {previewBusy && previewUrl && <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(37,99,235,.9)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>Updating…</div>}
          </div>
        </div>
      </div>
    </Modal>
  )
}
