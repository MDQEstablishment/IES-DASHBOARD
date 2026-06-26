import { useState, useMemo } from 'react'
import { useLiveQuery, bgInsert, bgUpdate, uploadToBucket } from '../lib/db'
import { useAuth } from '../rbac'
import { Modal, Field, inputStyle, Btn, Empty } from './ui'
import { toast } from '../lib/toast'
import { generateDocPdf } from '../lib/docPdf'

// Build the COC PDF data object + generate + upload + attach storage_path. Shared
// by the create wizard and the "Regenerate PDF" action.
export async function buildAndAttachCocPdf({ docId, cocNo, revision, referenceNo, project, buildings, esmList, installed, removed, userId }) {
  const selEsm = new Set(esmList.map((e) => e.code))
  const ins = installed.filter((i) => selEsm.has(i.esm_code))
  const b0 = buildings[0] || {}
  const data = {
    docNo: cocNo, referenceNo: referenceNo || cocNo, revision: revision || 'A', projectName: project?.name, projectCode: project?.code,
    clientName: project?.client || project?.beneficiary_entity || 'Tarshid', date: new Date().toISOString().slice(0, 10),
    buildingIds: buildings.map((b) => b.code).join(', '),
    buildingList: buildings.map((b) => `${b.code}${b.name ? ' - ' + b.name : ''}`),
    region: project?.region || '', city: project?.city || b0.city || '',
    buildingType: project?.building_type || b0.building_type || '',
    coords: (b0.location_lat != null && b0.location_lng != null) ? `${b0.location_lat}, ${b0.location_lng}` : '',
    contractDate: project?.contract_sign_date || '', endDate: project?.works_end_date || '',
    esco: project?.energy_services_company || 'Tarshid', subcontractor: project?.subcontractor || '-',
    meterNo: b0.elec_meter_no || '', subscriptionNo: b0.elec_subscription_no || '', accountNo: b0.elec_account_no || '',
    esmNo: esmList.map((e) => e.code).join('+'), esmName: esmList.map((e) => e.name || '').filter(Boolean).join(', '),
    brief: `Completion of ${esmList.map((e) => e.name || e.code).join(', ')} across ${buildings.length} building(s).`,
    totalBoqs: ins.reduce((s, i) => s + (Number(i.total_quantity) || 0), 0),
    attachmentsChecked: ['boq', 'testReport'],
    installed: ins, removed: removed || [], location: [project?.region, project?.client].filter(Boolean).join(' / '),
  }
  const bytes = await generateDocPdf('coc', data)
  const file = new File([bytes], `${cocNo}.pdf`, { type: 'application/pdf' })
  const { path, error } = await uploadToBucket('project-docs', file, { userId, prefix: project?.id || project?.code })
  if (error) return { error }
  const { error: upErr } = await bgUpdate('project_documents', docId, { storage_path: path, updated_at: new Date().toISOString() })
  return { error: upErr, path }
}

// ── MIR/WIR generation: build-for-preview, then commit-on-download ──────────
export const slugify = (s) => String(s || '').trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'document'
// {PROJECT_CODE}_{KIND}-{YYYY-SEQ}_{slug}.pdf  (KIND/CODE already in refNo prefix)
export function smartFilename({ projectCode, kind, referenceNo, title }) {
  const tail = String(referenceNo || '').split('-').slice(-2).join('-') || Date.now().toString().slice(-4)
  return `${projectCode || 'PRJ'}_${kind.toUpperCase()}-${tail}_${slugify(title)}.pdf`
}

// Assemble the PDF data object from project defaults + the modal's items/photos.
function inspectionPdfData({ kind, project, esm, building, items, photoFiles, title, generatedBy, referenceNo, storage, installation }) {
  return {
    referenceNo, projectName: project?.name, projectCode: project?.code,
    clientName: project?.client || 'Tarshid', date: new Date().toISOString().slice(0, 10),
    generatedBy: generatedBy || '', region: project?.region || '',
    rev: project?.doc_rev || '00', revDate: new Date().toISOString().slice(0, 10),
    projectRef: project?.project_reference_no || '',
    beneficiary: project?.beneficiary_entity || project?.client || '',
    contractor: project?.contractor_name || '',
    esmNo: esm?.code || '', esmName: title || esm?.name || '',
    items: items || [],
    storageLocation: storage || building?.name || project?.region || '',
    installationLocation: installation || building?.name || project?.region || '',
    attachmentsChecked: (photoFiles && photoFiles.length) ? ['Pictures'] : [],
    photoFiles: photoFiles || [],
  }
}

// Build the PDF bytes for preview (no DB writes, nothing persisted).
export async function buildInspectionPdf(opts) {
  return await generateDocPdf(opts.kind, inspectionPdfData(opts))
}

// Commit: persist the project_documents row (reference_no explicit so it matches
// the previewed PDF), upload the bytes under a traceable path, link storage_path.
export async function commitInspectionDoc({ kind, project, esm, building, userId, referenceNo, title, storage, installation, bytes, status = 'submitted' }) {
  const { data, error } = await bgInsert('project_documents', {
    project_id: project.id, building_id: building?.id || null, esm_id: esm?.id || null,
    doc_type: kind, name: title || referenceNo, reference_no: referenceNo || null,
    storage_location: storage || null, installation_areas: installation || null,
    revision: 'A', version: 'A', status, submitted_by: userId, submitted_at: new Date().toISOString(),
  })
  if (error || !data?.[0]) return { error: error || { message: 'insert failed' } }
  const docId = data[0].id
  const refNo = data[0].reference_no || referenceNo
  const filename = smartFilename({ projectCode: project?.code, kind, referenceNo: refNo, title })
  const file = new File([bytes], filename, { type: 'application/pdf' })
  const { path, error: upErr } = await uploadToBucket('project-docs', file, { userId, prefix: project.id, label: refNo })
  if (upErr) return { error: upErr, docId }
  await bgUpdate('project_documents', docId, { storage_path: path })
  return { docId, path, filename, referenceNo: refNo }
}

export default function CocWizard({ projectId, project, onClose, onDone }) {
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [selB, setSelB] = useState(() => new Set())
  const [selE, setSelE] = useState(() => new Set())
  const [rangeStr, setRangeStr] = useState('')
  const [respPick, setRespPick] = useState('')

  const { rows: bRows } = useLiveQuery('buildings', (q) => q.select('id,code,name,responsible_person_name,status_override').eq('project_id', projectId).order('code'), [projectId])
  const buildings = useMemo(() => bRows.filter((b) => b.status_override !== 'archived'), [bRows])
  const { rows: pEsms } = useLiveQuery('project_esms', (q) => q.select('custom_name,ordinal,coc_bundle_key,esm:esms(id,code,name)').eq('project_id', projectId).order('ordinal'), [projectId])
  const esms = useMemo(() => pEsms.filter((pe) => pe.esm).map((pe) => ({ id: pe.esm.id, code: pe.esm.code, name: pe.custom_name || pe.esm.name, bundle: pe.coc_bundle_key })), [pEsms])
  // bundle key -> all esm codes in that bundle
  const bundles = useMemo(() => { const m = {}; esms.forEach((e) => { if (e.bundle) (m[e.bundle] = m[e.bundle] || []).push(e.code) }); return m }, [esms])
  const { rows: installed } = useLiveQuery('project_installed_items', (q) => q.select('*').eq('project_id', projectId), [projectId])
  const { rows: removed } = useLiveQuery('project_removed_items', (q) => q.select('*').eq('project_id', projectId), [projectId])
  const { rows: cocRows, refetch } = useLiveQuery('project_documents', (q) => q.select('id').eq('project_id', projectId).eq('doc_type', 'coc'), [projectId])

  const responsibles = useMemo(() => [...new Set(buildings.map((b) => b.responsible_person_name).filter(Boolean))], [buildings])
  const selBuildings = buildings.filter((b) => selB.has(b.id))
  const selEsmList = esms.filter((e) => selE.has(e.code))
  const selEsmCodes = new Set(selEsmList.map((e) => e.code))

  const toggle = (set, setter, key) => { const n = new Set(set); n.has(key) ? n.delete(key) : n.add(key); setter(n) }
  const applyRange = () => {
    const m = rangeStr.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/)
    if (!m) { toast('Range looks like "1-22"', 'err'); return }
    const a = Math.max(1, +m[1]), b = Math.min(buildings.length, +m[2])
    const n = new Set(selB); buildings.slice(a - 1, b).forEach((x) => n.add(x.id)); setSelB(n)
  }
  const selectByResp = () => { if (!respPick) return; const n = new Set(selB); buildings.filter((x) => x.responsible_person_name === respPick).forEach((x) => n.add(x.id)); setSelB(n) }

  const cocNo = `${project?.code || 'PRJ'}-COC-${String((cocRows.length || 0) + 1).padStart(3, '0')}`

  const generate = async () => {
    if (selBuildings.length === 0 || selEsmList.length === 0) { toast('Select at least one building and one ESM', 'err'); return }
    // bundle-break warning: a configured bundle is only partially selected
    const broken = Object.entries(bundles).filter(([, codes]) => { const sel = codes.filter((c) => selEsmCodes.has(c)).length; return sel > 0 && sel < codes.length }).map(([k]) => k)
    if (broken.length && !window.confirm(`This breaks the ${broken.join(', ')} bundle defined for this project (those ESMs are normally certified together). Continue anyway?`)) return
    setBusy(true)
    const { data, error } = await bgInsert('project_documents', {
      project_id: projectId, doc_type: 'coc', name: cocNo, revision: 'A', version: 'A', status: 'draft',
      esm_id: selEsmList[0].id, building_id: selBuildings[0].id, submitted_by: user.id, submitted_at: new Date().toISOString(),
    })
    if (error || !data?.[0]) { setBusy(false); return }
    const docId = data[0].id
    const refNo = data[0].reference_no || cocNo
    await bgInsert('coc_buildings', selBuildings.map((b) => ({ coc_id: docId, building_id: b.id })))
    await bgInsert('coc_esms', selEsmList.map((e) => ({ coc_id: docId, esm_code: e.code })))
    const { error: pErr } = await buildAndAttachCocPdf({ docId, cocNo, referenceNo: refNo, revision: 'A', project, buildings: selBuildings, esmList: selEsmList, installed, removed, userId: user.id })
    setBusy(false)
    if (pErr) { toast('COC created, but PDF generation failed — ' + (pErr.message || ''), 'err') }
    else toast(`COC ${cocNo} created`)
    refetch(); onDone?.(); onClose()
  }

  const previewInstalled = installed.filter((i) => selEsmCodes.has(i.esm_code))
  const previewRemoved = removed.filter((i) => selEsmCodes.has(i.esm_code))

  return (
    <Modal open width={680} title={`New COC · Step ${step} of 3`} onClose={onClose}
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        {step > 1 && <Btn onClick={() => setStep(step - 1)}>Back</Btn>}
        {step < 3 && <Btn variant="primary" onClick={() => setStep(step + 1)} disabled={step === 1 && (selBuildings.length === 0 || selEsmList.length === 0)}>Next</Btn>}
        {step === 3 && <Btn variant="primary" onClick={generate} disabled={busy}>{busy ? 'Generating…' : 'Generate COC + PDF'}</Btn>}
      </>}>
      {step === 1 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Scope — buildings</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
            <button onClick={() => setSelB(new Set(buildings.map((b) => b.id)))} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>Select all</button>
            <button onClick={() => setSelB(new Set())} style={{ fontSize: 12, color: 'var(--text-3)' }}>Clear</button>
            <input lang="en" inputMode="numeric" style={{ ...inputStyle, width: 90, padding: '6px 8px' }} placeholder="1-22" value={rangeStr} onChange={(e) => setRangeStr(e.target.value)} />
            <button onClick={applyRange} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>Add range</button>
            {responsibles.length > 0 && <>
              <select style={{ ...inputStyle, width: 200, padding: '6px 8px' }} value={respPick} onChange={(e) => setRespPick(e.target.value)}><option value="">By responsible person…</option>{responsibles.map((r) => <option key={r} value={r}>{r}</option>)}</select>
              <button onClick={selectByResp} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>Add</button>
            </>}
          </div>
          <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 8, marginBottom: 14 }}>
            {buildings.length === 0 ? <Empty icon="buildings">No active buildings.</Empty> : buildings.map((b, i) => (
              <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', fontSize: 12.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={selB.has(b.id)} onChange={() => toggle(selB, setSelB, b.id)} />
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-3)', width: 24 }}>{i + 1}</span>
                <span style={{ fontWeight: 600 }}>{b.code}</span><span style={{ color: 'var(--text-3)' }}>{b.name}</span>
                {b.responsible_person_name && <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-3)' }}>👤 {b.responsible_person_name}</span>}
              </label>
            ))}
          </div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Scope — ESMs</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {esms.map((e) => (
              <button key={e.code} onClick={() => toggle(selE, setSelE, e.code)}
                style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (selE.has(e.code) ? 'var(--accent)' : 'var(--line)'), background: selE.has(e.code) ? '#EFF6FF' : '#fff', color: selE.has(e.code) ? 'var(--accent)' : 'var(--text-3)' }}>{e.code} · {e.name}</button>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 12 }}>{selBuildings.length} buildings × {selEsmList.length} ESMs selected. This will create one COC ({cocNo}).</div>
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ background: '#F8FAFC', border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 12.5 }}>
            <div style={{ fontWeight: 700 }}>{project?.name} <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>· {cocNo}</span></div>
            <div style={{ color: 'var(--text-3)', marginTop: 4 }}>🏢 {project?.client || '—'} · 📍 {project?.region || '—'} · 🛠 {selEsmList.map((e) => e.code).join('+')}</div>
            <div style={{ marginTop: 6 }}><strong>Buildings ({selBuildings.length}):</strong> {selBuildings.map((b) => b.code).join(', ')}</div>
          </div>
          <PreviewTable title="Installed Items" rows={previewInstalled} cols={['item_description', 'model_code', 'cap', 'eff', 'total_quantity']} headers={['Description', 'Model', 'Capacity', 'Efficiency', 'Qty']} />
          <PreviewTable title="Removed Items" rows={previewRemoved} cols={['item_description', 'cap', 'eff', 'total_quantity', 'ret']} headers={['Description', 'Capacity', 'Efficiency', 'Qty', 'Returned']} />
          {previewInstalled.length === 0 && previewRemoved.length === 0 && <div style={{ fontSize: 12, color: 'var(--warn)' }}>No items captured for the selected ESMs — the COC will generate with empty item tables. Add them in the Items &amp; Replacements tab first if needed.</div>}
        </>
      )}

      {step === 3 && (
        <div style={{ fontSize: 13 }}>
          <p>Ready to create <strong>{cocNo}</strong> covering <strong>{selBuildings.length}</strong> buildings × <strong>{selEsmList.length}</strong> ESMs.</p>
          <p style={{ color: 'var(--text-3)', fontSize: 12.5 }}>This creates a draft COC, writes the building/ESM coverage, generates the Tarshid-style PDF, and attaches it. You can update its status and regenerate later.</p>
        </div>
      )}
    </Modal>
  )
}

function PreviewTable({ title, rows, cols, headers }) {
  const cell = (r, c) => c === 'cap' ? (r.capacity_value != null ? `${r.capacity_value} ${r.capacity_unit || ''}` : '—')
    : c === 'eff' ? (r.efficiency_value != null ? `${r.efficiency_value} ${r.efficiency_unit || ''}` : '—')
    : c === 'ret' ? (r.returned_to_facility ? 'Yes' : 'No') : (r[c] ?? '—')
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 4 }}>{title} ({rows.length})</div>
      {rows.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-3)' }}>None.</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 9.5, fontFamily: 'var(--mono)' }}>{headers.map((h) => <th key={h} style={{ padding: '4px 6px', fontWeight: 600 }}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>{cols.map((c) => <td key={c} style={{ padding: '4px 6px', fontFamily: c === 'total_quantity' ? 'var(--mono)' : undefined }}>{cell(r, c)}</td>)}</tr>)}</tbody>
        </table>
      )}
    </div>
  )
}
