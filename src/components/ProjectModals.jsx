import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal, Field, inputStyle, Btn } from './ui'
import DateInput from './DateInput'
import { useLiveQuery, bgInsert, bgUpdate } from '../lib/db'
import { supabase } from '../lib/supabase'
import { useAuth } from '../rbac'
import { toast } from '../lib/toast'
import { read, utils } from 'xlsx'

const STATUSES = ['active', 'draft', 'on_hold', 'closed']
const num = (v) => (v === '' || v == null ? null : Number(v))

// ── Add / Edit project ──────────────────────────────────────────────────────
export function ProjectFormModal({ mode = 'add', project, onClose }) {
  const navigate = useNavigate()
  const { rows: people } = useLiveQuery('profiles', (q) => q.select('id,full_name,role').eq('archived', false).order('full_name'))
  const init = (k, d = '') => (project?.[k] ?? d)
  const [f, setF] = useState({
    code: init('code'), name: init('name'), client: init('client'), region: init('region'),
    status: init('status', 'draft'), start_date: init('start_date'), end_date: init('end_date'),
    total_weeks: init('total_weeks'), pm_id: init('pm_id'), engineer_id: init('engineer_id'),
    location_address: init('location_address'), location_lat: init('location_lat'), location_lng: init('location_lng'),
    contractor_name: init('contractor_name'), contractor_phone: init('contractor_phone'), contractor_email: init('contractor_email'),
  })
  const [buildings, setBuildings] = useState([])
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  const save = async () => {
    if (!f.code.trim() || !f.name.trim()) { toast('Code and name are required', 'err'); return }
    setBusy(true)
    const payload = {
      code: f.code.trim(), name: f.name.trim(), client: f.client || null, region: f.region || null,
      status: f.status, start_date: f.start_date || null, end_date: f.end_date || null,
      total_weeks: num(f.total_weeks), pm_id: f.pm_id || null, engineer_id: f.engineer_id || null,
      location_address: f.location_address || null, location_lat: num(f.location_lat), location_lng: num(f.location_lng),
      contractor_name: f.contractor_name || null, contractor_phone: f.contractor_phone || null, contractor_email: f.contractor_email || null,
    }
    if (mode === 'edit') {
      const { error } = await bgUpdate('projects', project.id, payload, { okMsg: 'Project updated' })
      setBusy(false); if (!error) onClose()
      return
    }
    const { data, error } = await bgInsert('projects', payload, { okMsg: 'Project created' })
    if (!error && data?.[0] && buildings.length) {
      const pid = data[0].id
      const valid = buildings.filter((b) => b.code && b.name)
      if (valid.length) await bgInsert('buildings', valid.map((b) => ({
        project_id: pid, code: b.code.trim(), name: b.name.trim(), region: b.region || f.region || null,
        location_lat: num(b.location_lat), location_lng: num(b.location_lng),
        contractor: b.contractor_name || null, contractor_name: b.contractor_name || null,
        contractor_phone: b.contractor_phone || null, status_override: 'pending',
      })))
    }
    setBusy(false)
    if (!error) { onClose(); if (data?.[0]) navigate(`/projects/${data[0].id}`) }
  }

  return (
    <Modal open width={640} title={mode === 'edit' ? `Edit project · ${project.code}` : 'Add project'} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create project'}</Btn></>}>
      {mode === 'add' && (
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 9, padding: '10px 12px', fontSize: 12, color: '#1E40AF', marginBottom: 16 }}>
          After you save, you'll be able to: add more buildings, assign engineers, edit any field, upload documents, and log daily progress. You can add buildings now (below) or any time later.
        </div>
      )}
      <Row>
        <Field label="Project code"><input lang="en" style={inputStyle} value={f.code} onChange={(e) => set('code', e.target.value)} placeholder="MOI-ASIR" /></Field>
        <Field label="Status"><select style={inputStyle} value={f.status} onChange={(e) => set('status', e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></Field>
      </Row>
      <Field label="Project name"><input lang="en" style={inputStyle} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="MOI — Asir Region" /></Field>
      <Row>
        <Field label="Client"><input lang="en" style={inputStyle} value={f.client} onChange={(e) => set('client', e.target.value)} placeholder="Ministry of Interior" /></Field>
        <Field label="Region"><input lang="en" style={inputStyle} value={f.region} onChange={(e) => set('region', e.target.value)} placeholder="Asir" /></Field>
      </Row>
      <Row>
        <Field label="Start date"><DateInput style={inputStyle} value={f.start_date || ''} onChange={(e) => set('start_date', e.target.value)} /></Field>
        <Field label="End date"><DateInput style={inputStyle} value={f.end_date || ''} onChange={(e) => set('end_date', e.target.value)} /></Field>
        <Field label="Total weeks"><input lang="en" style={inputStyle} type="text" inputMode="numeric" min="1" value={f.total_weeks || ''} onChange={(e) => set('total_weeks', e.target.value)} /></Field>
      </Row>
      <Row>
        <Field label="Project manager"><select style={inputStyle} value={f.pm_id || ''} onChange={(e) => set('pm_id', e.target.value)}><option value="">Unassigned</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>
        <Field label="Project engineer"><select style={inputStyle} value={f.engineer_id || ''} onChange={(e) => set('engineer_id', e.target.value)}><option value="">Unassigned</option>{people.filter((p) => p.role === 'proje').map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>
      </Row>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', margin: '6px 0 8px' }}>CONTRACTOR</div>
      <Row>
        <Field label="Contractor name"><input lang="en" style={inputStyle} value={f.contractor_name} onChange={(e) => set('contractor_name', e.target.value)} /></Field>
        <Field label="Phone"><input lang="en" style={inputStyle} value={f.contractor_phone} onChange={(e) => set('contractor_phone', e.target.value)} placeholder="+966 50 000 0000" /></Field>
      </Row>
      <Field label="Contractor email"><input lang="en" style={inputStyle} value={f.contractor_email} onChange={(e) => set('contractor_email', e.target.value)} /></Field>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', margin: '6px 0 8px' }}>LOCATION (FOR MAP)</div>
      <Row>
        <Field label="Address"><input lang="en" style={inputStyle} value={f.location_address} onChange={(e) => set('location_address', e.target.value)} /></Field>
        <Field label="Latitude"><input lang="en" style={inputStyle} value={f.location_lat || ''} onChange={(e) => set('location_lat', e.target.value)} placeholder="18.2164" /></Field>
        <Field label="Longitude"><input lang="en" style={inputStyle} value={f.location_lng || ''} onChange={(e) => set('location_lng', e.target.value)} placeholder="42.5053" /></Field>
      </Row>

      {mode === 'add' && (
        <div style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Buildings (you can add now or later)</div>
            <button onClick={() => setBuildings((b) => [...b, { code: '', name: '', region: '', location_lat: '', location_lng: '', contractor_name: '', contractor_phone: '' }])} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>+ Add building</button>
          </div>
          {buildings.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 4 }}>No buildings added yet — you can add them here, or any time later from the project page.</div>}
          {buildings.map((b, i) => {
            const upd = (k, v) => setBuildings((arr) => arr.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
            return (
              <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, marginBottom: 8, background: '#F8FAFC' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)' }}>BUILDING {i + 1}</span>
                  <button onClick={() => setBuildings((arr) => arr.filter((_, j) => j !== i))} style={{ color: 'var(--bad)', fontSize: 11.5, fontWeight: 700 }}>Remove</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginBottom: 8 }}>
                  <input lang="en" style={inputStyle} value={b.code} placeholder="Code (MOI-004)" onChange={(e) => upd('code', e.target.value)} />
                  <input lang="en" style={inputStyle} value={b.name} placeholder="Building name (English)" onChange={(e) => upd('name', e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <input lang="en" style={inputStyle} value={b.location_lat} placeholder="Latitude" onChange={(e) => upd('location_lat', e.target.value)} />
                  <input lang="en" style={inputStyle} value={b.location_lng} placeholder="Longitude" onChange={(e) => upd('location_lng', e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input lang="en" style={inputStyle} value={b.contractor_name} placeholder="Contractor name" onChange={(e) => upd('contractor_name', e.target.value)} />
                  <input lang="en" style={inputStyle} value={b.contractor_phone} placeholder="Contractor phone" onChange={(e) => upd('contractor_phone', e.target.value)} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

// ── Change status (with reason → history) ───────────────────────────────────
export function StatusChangeModal({ project, onClose }) {
  const { user } = useAuth()
  const [status, setStatus] = useState(project.status)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const reasonRequired = status === 'on_hold' || status === 'closed'

  const save = async () => {
    if (status === project.status) { onClose(); return }
    if (reasonRequired && !reason.trim()) { toast('A reason is required for on-hold / closed', 'err'); return }
    setBusy(true)
    const { error } = await bgUpdate('projects', project.id, {
      status, status_changed_by: user.id, status_changed_at: new Date().toISOString(), status_change_reason: reason || null,
    }, { okMsg: `Status → ${statusLabel(status)}` })
    setBusy(false); if (!error) onClose()
  }

  return (
    <Modal open title={`Change status · ${project.code}`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Apply'}</Btn></>}>
      <Field label="New status">
        <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
      </Field>
      <Field label={`Reason${reasonRequired ? ' (required)' : ' (optional)'}`}>
        <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is the status changing?" />
      </Field>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Recorded in the project status history with your name and the time.</div>
    </Modal>
  )
}

// ── Delete (soft) — type-to-confirm, admin only ─────────────────────────────
export function DeleteProjectModal({ project, onClose }) {
  const { user } = useAuth()
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const ok = confirm.trim() === project.code

  const del = async () => {
    if (!ok) return
    setBusy(true)
    const { error } = await bgUpdate('projects', project.id, {
      status: 'deleted', status_changed_by: user.id, status_changed_at: new Date().toISOString(), status_change_reason: 'Soft-deleted',
    }, { okMsg: 'Project deleted' })
    setBusy(false); if (!error) onClose()
  }

  return (
    <Modal open title={`Delete project · ${project.code}`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="danger" onClick={del} disabled={!ok || busy}>{busy ? 'Deleting…' : 'Delete project'}</Btn></>}>
      <div style={{ fontSize: 13, marginBottom: 12 }}>This soft-deletes the project — it disappears from the default list but is retained. Type <strong style={{ fontFamily: 'var(--mono)' }}>{project.code}</strong> to confirm.</div>
      <input lang="en" style={inputStyle} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={project.code} />
    </Modal>
  )
}

// ── Quick-assign project engineer from the Project Detail header (1.7) ──────
export function AssignEngineerModal({ project, onClose }) {
  const { rows: engineers } = useLiveQuery('profiles', (q) =>
    q.select('id,full_name,role').eq('role', 'proje').eq('archived', false).order('full_name'))
  const [engineerId, setEngineerId] = useState(project.engineer_id || '')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if ((engineerId || '') === (project.engineer_id || '')) { onClose(); return }
    setBusy(true)
    const { error } = await bgUpdate('projects', project.id, { engineer_id: engineerId || null }, { okMsg: 'Project engineer updated' })
    setBusy(false); if (!error) onClose()
  }

  return (
    <Modal open title={`Project engineer · ${project.code}`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Assign'}</Btn></>}>
      <Field label="Project engineer">
        <select style={inputStyle} value={engineerId} onChange={(e) => setEngineerId(e.target.value)}>
          <option value="">Unassigned</option>
          {engineers.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
      </Field>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>The change is recorded in the audit log with your name and the time.</div>
    </Modal>
  )
}

// ── Excel import (multi-sheet template → atomic RPC) ────────────────────────
const BSTATUSES = ['pending', 'in_progress', 'signed', 'on_hold', 'blocked']
const ESMS = ['ESM1', 'ESM2', 'ESM3']
const TEMPLATE_BUCKET_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/project-templates/IES-Project-Template.xlsx`
const TEMPLATE_STATIC_URL = `${import.meta.env.BASE_URL}templates/IES-Project-Template.xlsx`

const isExampleRow = (row) => Object.values(row).some((v) => String(v).trim() === 'DELETE-BEFORE-UPLOAD')
const sheetRows = (wb, name) => {
  const ws = wb.Sheets[name]
  if (!ws) return []
  return utils.sheet_to_json(ws, { defval: '' })
    .filter((r) => !isExampleRow(r))
    .filter((r) => Object.values(r).some((v) => String(v).trim() !== ''))
}
const s = (v) => (v == null ? '' : String(v).trim())
const isNum = (v) => v !== '' && !isNaN(Number(v))

export function ProjectImportModal({ onClose }) {
  const navigate = useNavigate()
  const [parsed, setParsed] = useState(null) // { project, buildings, scopes, materials }
  const [errors, setErrors] = useState([])
  const [busy, setBusy] = useState(false)

  const downloadTemplate = async () => {
    for (const url of [TEMPLATE_BUCKET_URL, TEMPLATE_STATIC_URL]) {
      try {
        const res = await fetch(url)
        if (!res.ok) continue
        const blob = await res.blob()
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = 'IES-Project-Template.xlsx'
        document.body.appendChild(a); a.click(); a.remove()
        URL.revokeObjectURL(a.href)
        return
      } catch { /* try next source */ }
    }
    toast("Couldn't fetch the template — check your connection", 'err')
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setErrors([]); setParsed(null)
    const wb = read(await file.arrayBuffer(), { cellDates: true })
    const pr = sheetRows(wb, 'Project')[0] || null
    const buildings = sheetRows(wb, 'Buildings')
    const scopes = sheetRows(wb, 'Building Scopes')
    const materials = sheetRows(wb, 'Materials')

    const errs = []
    if (!pr) errs.push('The Project sheet has no data row.')
    if (pr && !s(pr.code)) errs.push('Project: code is required.')
    if (pr && !s(pr.name)) errs.push('Project: name is required.')
    if (pr && s(pr.status) && !STATUSES.includes(s(pr.status))) errs.push(`Project: invalid status "${s(pr.status)}".`)

    const seen = new Set()
    buildings.forEach((b, i) => {
      const ln = `Buildings row ${i + 1}`
      if (!s(b.building_code)) errs.push(`${ln}: building_code is required.`)
      else if (seen.has(s(b.building_code))) errs.push(`${ln}: duplicate building_code "${s(b.building_code)}".`)
      else seen.add(s(b.building_code))
      if (pr && s(b.project_code) && s(b.project_code) !== s(pr.code)) errs.push(`${ln}: project_code "${s(b.project_code)}" ≠ Project code "${s(pr.code)}".`)
      if (s(b.lat) && (!isNum(b.lat) || Math.abs(Number(b.lat)) > 90)) errs.push(`${ln}: lat out of range.`)
      if (s(b.lng) && (!isNum(b.lng) || Math.abs(Number(b.lng)) > 180)) errs.push(`${ln}: lng out of range.`)
      if (s(b.status) && !BSTATUSES.includes(s(b.status))) errs.push(`${ln}: invalid status "${s(b.status)}".`)
    })
    scopes.forEach((c, i) => {
      const ln = `Scopes row ${i + 1}`
      if (!s(c.building_code)) errs.push(`${ln}: building_code is required.`)
      else if (!seen.has(s(c.building_code))) errs.push(`${ln}: building_code "${s(c.building_code)}" not found in Buildings.`)
      if (!ESMS.includes(s(c.esm).toUpperCase())) errs.push(`${ln}: esm must be ESM1/ESM2/ESM3.`)
      if (s(c.planned_qty) && !isNum(c.planned_qty)) errs.push(`${ln}: planned_qty must be a number.`)
    })
    materials.forEach((m, i) => {
      const ln = `Materials row ${i + 1}`
      if (!s(m.material_code)) errs.push(`${ln}: material_code is required.`)
      if (!ESMS.includes(s(m.esm).toUpperCase())) errs.push(`${ln}: esm must be ESM1/ESM2/ESM3.`)
    })

    setErrors(errs)
    setParsed({ project: pr, buildings, scopes, materials })
  }

  const toIso = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : s(v) || null)
  const doImport = async () => {
    if (!parsed?.project || errors.length) return
    setBusy(true)
    const p = parsed.project
    const payload = {
      project: {
        code: s(p.code), name: s(p.name), client: s(p.client), region: s(p.region), address: s(p.address),
        lat: s(p.lat), lng: s(p.lng), start_date: toIso(p.start_date), end_date: toIso(p.end_date),
        status: s(p.status), total_weeks: s(p.total_weeks), pm_email: s(p.pm_email), engineer_email: s(p.engineer_email),
        contractor_name: s(p.contractor_name), contractor_phone: s(p.contractor_phone), contractor_email: s(p.contractor_email),
      },
      buildings: parsed.buildings.map((b) => ({
        building_code: s(b.building_code), building_name: s(b.building_name), city: s(b.city), lat: s(b.lat), lng: s(b.lng),
        floors: s(b.floors), area_sqm: s(b.area_sqm), contractor_name: s(b.contractor_name), contractor_phone: s(b.contractor_phone),
        status: s(b.status), remarks: s(b.remarks),
      })),
      scopes: parsed.scopes.map((c) => ({
        building_code: s(c.building_code), esm: s(c.esm).toUpperCase(), material_code: s(c.material_code),
        sub_type: s(c.sub_type), planned_qty: s(c.planned_qty), unit: s(c.unit), notes: s(c.notes),
      })),
      materials: parsed.materials.map((m) => ({
        material_code: s(m.material_code), description: s(m.description), esm: s(m.esm).toUpperCase(),
        unit: s(m.unit), threshold: s(m.threshold), supplier: s(m.supplier),
      })),
    }
    const { data, error } = await supabase.rpc('import_project_bundle', { p: payload })
    setBusy(false)
    if (error) { toast(`Import failed — ${error.message}`, 'err'); return }
    toast(`Imported: 1 project, ${data.buildings} buildings, ${data.scopes} scopes, ${data.materials} materials`)
    onClose()
    if (data.project_id) navigate(`/projects/${data.project_id}`)
  }

  const counts = parsed && { p: parsed.project ? 1 : 0, b: parsed.buildings.length, c: parsed.scopes.length, m: parsed.materials.length }

  return (
    <Modal open width={620} title="Import a project from Excel" onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={doImport} disabled={!parsed?.project || !!errors.length || busy}>{busy ? 'Importing…' : 'Confirm import'}</Btn></>}>
      <div style={{ fontSize: 13, marginBottom: 12 }}>Step 1 — download the template. It has 5 sheets (Instructions, Project, Buildings, Building Scopes, Materials) with colors and per-field notes. Fill them, delete the example rows, then upload.</div>
      <Btn icon="upload" onClick={downloadTemplate} style={{ marginBottom: 14 }}>Download template (.xlsx)</Btn>
      <Field label="Step 2 — upload the filled template">
        <input lang="en" type="file" accept=".xlsx,.xls" onChange={onFile} style={{ fontSize: 13 }} />
      </Field>
      {errors.length > 0 && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 10, fontSize: 12, color: '#B91C1C', marginTop: 8 }}>
          {errors.slice(0, 10).map((e, i) => <div key={i}>{e}</div>)}
          {errors.length > 10 && <div>+{errors.length - 10} more…</div>}
        </div>
      )}
      {parsed && !errors.length && (
        <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: 12, fontSize: 13, color: '#065F46', marginTop: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Ready to import — please confirm:</div>
          <div><strong>{counts.p}</strong> project (<span style={{ fontFamily: 'var(--mono)' }}>{s(parsed.project.code)}</span>), <strong>{counts.b}</strong> buildings, <strong>{counts.c}</strong> scopes, <strong>{counts.m}</strong> materials will be created.</div>
          <div style={{ fontSize: 11.5, marginTop: 4, color: '#047857' }}>Everything is created in a single transaction — all or nothing.</div>
        </div>
      )}
    </Modal>
  )
}

function Row({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${children.length || 2}, 1fr)`, gap: 12 }}>{children}</div> }
function statusLabel(s) { return ({ active: 'Active', draft: 'Draft', on_hold: 'On-Hold', closed: 'Closed', deleted: 'Deleted' })[s] || s }
