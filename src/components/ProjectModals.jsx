import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal, Field, inputStyle, Btn } from './ui'
import { useLiveQuery, bgInsert, bgUpdate } from '../lib/db'
import { useAuth } from '../rbac'
import { toast } from '../lib/toast'
import { read, utils, writeFileXLSX } from 'xlsx'

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
        <Field label="Project code"><input style={inputStyle} value={f.code} onChange={(e) => set('code', e.target.value)} placeholder="MOI-ASIR" /></Field>
        <Field label="Status"><select style={inputStyle} value={f.status} onChange={(e) => set('status', e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></Field>
      </Row>
      <Field label="Project name"><input style={inputStyle} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="MOI — Asir Region" /></Field>
      <Row>
        <Field label="Client"><input style={inputStyle} value={f.client} onChange={(e) => set('client', e.target.value)} placeholder="Ministry of Interior" /></Field>
        <Field label="Region"><input style={inputStyle} value={f.region} onChange={(e) => set('region', e.target.value)} placeholder="Asir" /></Field>
      </Row>
      <Row>
        <Field label="Start date"><input style={inputStyle} type="date" value={f.start_date || ''} onChange={(e) => set('start_date', e.target.value)} /></Field>
        <Field label="End date"><input style={inputStyle} type="date" value={f.end_date || ''} onChange={(e) => set('end_date', e.target.value)} /></Field>
        <Field label="Total weeks"><input style={inputStyle} type="number" min="1" value={f.total_weeks || ''} onChange={(e) => set('total_weeks', e.target.value)} /></Field>
      </Row>
      <Row>
        <Field label="Project manager"><select style={inputStyle} value={f.pm_id || ''} onChange={(e) => set('pm_id', e.target.value)}><option value="">Unassigned</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>
        <Field label="Project engineer"><select style={inputStyle} value={f.engineer_id || ''} onChange={(e) => set('engineer_id', e.target.value)}><option value="">Unassigned</option>{people.filter((p) => p.role === 'proje').map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>
      </Row>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', margin: '6px 0 8px' }}>CONTRACTOR</div>
      <Row>
        <Field label="Contractor name"><input style={inputStyle} value={f.contractor_name} onChange={(e) => set('contractor_name', e.target.value)} /></Field>
        <Field label="Phone"><input style={inputStyle} value={f.contractor_phone} onChange={(e) => set('contractor_phone', e.target.value)} placeholder="+966 50 000 0000" /></Field>
      </Row>
      <Field label="Contractor email"><input style={inputStyle} value={f.contractor_email} onChange={(e) => set('contractor_email', e.target.value)} /></Field>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', margin: '6px 0 8px' }}>LOCATION (FOR MAP)</div>
      <Row>
        <Field label="Address"><input style={inputStyle} value={f.location_address} onChange={(e) => set('location_address', e.target.value)} /></Field>
        <Field label="Latitude"><input style={inputStyle} value={f.location_lat || ''} onChange={(e) => set('location_lat', e.target.value)} placeholder="18.2164" /></Field>
        <Field label="Longitude"><input style={inputStyle} value={f.location_lng || ''} onChange={(e) => set('location_lng', e.target.value)} placeholder="42.5053" /></Field>
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
                  <input style={inputStyle} value={b.code} placeholder="Code (MOI-004)" onChange={(e) => upd('code', e.target.value)} />
                  <input style={inputStyle} value={b.name} placeholder="Building name (English)" onChange={(e) => upd('name', e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <input style={inputStyle} value={b.location_lat} placeholder="Latitude" onChange={(e) => upd('location_lat', e.target.value)} />
                  <input style={inputStyle} value={b.location_lng} placeholder="Longitude" onChange={(e) => upd('location_lng', e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input style={inputStyle} value={b.contractor_name} placeholder="Contractor name" onChange={(e) => upd('contractor_name', e.target.value)} />
                  <input style={inputStyle} value={b.contractor_phone} placeholder="Contractor phone" onChange={(e) => upd('contractor_phone', e.target.value)} />
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
      <input style={inputStyle} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={project.code} />
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

// ── Excel import (SheetJS) ──────────────────────────────────────────────────
const TEMPLATE_COLS = ['code', 'name', 'client', 'region', 'status', 'start_date', 'total_weeks', 'contractor_name', 'contractor_phone', 'building_code', 'building_name', 'building_region']
export function ProjectImportModal({ onClose }) {
  const [rows, setRows] = useState(null)
  const [errors, setErrors] = useState([])
  const [busy, setBusy] = useState(false)

  const downloadTemplate = () => {
    const ws = utils.aoa_to_sheet([TEMPLATE_COLS, ['MOI-ASIR', 'MOI — Asir Region', 'Ministry of Interior', 'Asir', 'active', '2025-09-01', '64', 'Al-Faisal HVAC', '+966 50 000 0000', 'MOI-001', 'Police HQ — Abha', 'Abha']])
    const wb = utils.book_new(); utils.book_append_sheet(wb, ws, 'Projects')
    writeFileXLSX(wb, 'IES-Project-Template.xlsx')
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const buf = await file.arrayBuffer()
    const wb = read(buf)
    const data = utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
    const errs = []
    data.forEach((r, i) => {
      if (!r.code) errs.push(`Row ${i + 2}: missing code`)
      if (!r.name) errs.push(`Row ${i + 2}: missing name`)
      if (r.status && !STATUSES.includes(String(r.status))) errs.push(`Row ${i + 2}: invalid status "${r.status}"`)
    })
    setErrors(errs); setRows(data)
  }

  const doImport = async () => {
    if (!rows?.length || errors.length) return
    setBusy(true)
    // group rows by project code → one project + N buildings
    const byCode = {}
    rows.forEach((r) => {
      byCode[r.code] = byCode[r.code] || { proj: { code: r.code, name: r.name, client: r.client || null, region: r.region || null, status: r.status || 'draft', start_date: r.start_date || null, total_weeks: r.total_weeks ? Number(r.total_weeks) : null, contractor_name: r.contractor_name || null, contractor_phone: r.contractor_phone || null }, blds: [] }
      if (r.building_code) byCode[r.code].blds.push({ code: r.building_code, name: r.building_name || r.building_code, region: r.building_region || r.region || null })
    })
    let made = 0
    for (const { proj, blds } of Object.values(byCode)) {
      const { data, error } = await bgInsert('projects', proj)
      if (error) continue
      made++
      if (data?.[0] && blds.length) await bgInsert('buildings', blds.map((b) => ({ ...b, project_id: data[0].id })))
    }
    setBusy(false)
    toast(`Imported ${made} project${made === 1 ? '' : 's'}`)
    onClose()
  }

  return (
    <Modal open width={620} title="Import projects from Excel" onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={doImport} disabled={!rows?.length || !!errors.length || busy}>{busy ? 'Importing…' : `Import ${rows?.length || 0} row(s)`}</Btn></>}>
      <div style={{ fontSize: 13, marginBottom: 12 }}>Step 1 — download the template, fill one row per building (repeat the project columns for each building of the same project), then upload it.</div>
      <Btn icon="upload" onClick={downloadTemplate} style={{ marginBottom: 14 }}>Download template (.xlsx)</Btn>
      <Field label="Step 2 — upload filled template">
        <input type="file" accept=".xlsx,.xls" onChange={onFile} style={{ fontSize: 13 }} />
      </Field>
      {errors.length > 0 && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 10, fontSize: 12, color: '#B91C1C', marginTop: 8 }}>
          {errors.slice(0, 8).map((e, i) => <div key={i}>{e}</div>)}
          {errors.length > 8 && <div>+{errors.length - 8} more…</div>}
        </div>
      )}
      {rows && !errors.length && <div style={{ fontSize: 12.5, color: 'var(--ok)', marginTop: 8 }}>✓ {rows.length} row(s) parsed, no errors. Ready to import.</div>}
    </Modal>
  )
}

function Row({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${children.length || 2}, 1fr)`, gap: 12 }}>{children}</div> }
function statusLabel(s) { return ({ active: 'Active', draft: 'Draft', on_hold: 'On-Hold', closed: 'Closed', deleted: 'Deleted' })[s] || s }
