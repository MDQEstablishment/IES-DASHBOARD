import { useState } from 'react'
import { Modal, Field, inputStyle, Btn } from './ui'
import { useLiveQuery, bgInsert, bgUpdate } from '../lib/db'
import { useAuth } from '../rbac'
import { toast } from '../lib/toast'

const numOrNull = (v) => (v === '' || v == null ? null : Number(v))

// ── Add / Edit a building under an existing project (complaint 1.2) ──────────
// Mirrors the contractor name into both `contractor` (Buildings table) and
// `contractor_name` (Map popup) so the new row shows everywhere immediately.
export function BuildingFormModal({ mode = 'add', projectId, building, projectRegion = '', onClose }) {
  const { rows: engineers } = useLiveQuery('profiles', (q) =>
    q.select('id,full_name,role').eq('role', 'proje').eq('archived', false).order('full_name'))
  const init = (k, d = '') => (building?.[k] ?? d)
  const [f, setF] = useState({
    code: init('code'), name: init('name'), region: init('region', projectRegion),
    location_lat: init('location_lat'), location_lng: init('location_lng'),
    contractor_name: init('contractor_name') || init('contractor'), contractor_phone: init('contractor_phone'),
    engineer_name: init('engineer_name'), floors: init('floors'), area_sqm: init('area_sqm'),
    remarks: init('remarks'),
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  const save = async () => {
    if (!f.code.trim() || !f.name.trim()) { toast('Code and name are required', 'err'); return }
    const lat = numOrNull(f.location_lat), lng = numOrNull(f.location_lng)
    if (lat != null && (lat < -90 || lat > 90)) { toast('Latitude must be between -90 and 90', 'err'); return }
    if (lng != null && (lng < -180 || lng > 180)) { toast('Longitude must be between -180 and 180', 'err'); return }
    setBusy(true)
    const payload = {
      code: f.code.trim(), name: f.name.trim(), region: f.region || null,
      location_lat: lat, location_lng: lng,
      contractor: f.contractor_name || null, contractor_name: f.contractor_name || null,
      contractor_phone: f.contractor_phone || null, engineer_name: f.engineer_name || null,
      floors: numOrNull(f.floors), area_sqm: numOrNull(f.area_sqm), remarks: f.remarks || null,
    }
    if (mode === 'edit') {
      const { error } = await bgUpdate('buildings', building.id, payload, { okMsg: 'Building updated' })
      setBusy(false); if (!error) onClose()
      return
    }
    const { error } = await bgInsert('buildings', { ...payload, project_id: projectId, status_override: 'pending' }, { okMsg: 'Building added' })
    setBusy(false); if (!error) onClose()
  }

  return (
    <Modal open width={620} title={mode === 'edit' ? `Edit building · ${building.code}` : 'Add building'} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Add building'}</Btn></>}>
      <Row>
        <Field label="Building code"><input lang="en" style={inputStyle} value={f.code} onChange={(e) => set('code', e.target.value)} placeholder="MOI-004" /></Field>
        <Field label="City / region"><input lang="en" style={inputStyle} value={f.region} onChange={(e) => set('region', e.target.value)} placeholder="Abha" /></Field>
      </Row>
      <Field label="Building name (English)"><input lang="en" style={inputStyle} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Police HQ — Abha" /></Field>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', margin: '6px 0 8px' }}>CONTRACTOR</div>
      <Row>
        <Field label="Contractor name"><input lang="en" style={inputStyle} value={f.contractor_name} onChange={(e) => set('contractor_name', e.target.value)} placeholder="Al-Faisal HVAC" /></Field>
        <Field label="Contractor phone"><input lang="en" style={inputStyle} value={f.contractor_phone} onChange={(e) => set('contractor_phone', e.target.value)} placeholder="+966 50 000 0000" /></Field>
      </Row>
      <Field label="Site engineer (optional)">
        <select style={inputStyle} value={f.engineer_name} onChange={(e) => set('engineer_name', e.target.value)}>
          <option value="">Unassigned</option>
          {engineers.map((p) => <option key={p.id} value={p.full_name}>{p.full_name}</option>)}
        </select>
      </Field>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', margin: '6px 0 8px' }}>LOCATION (FOR MAP)</div>
      <Row>
        <Field label="Latitude"><input lang="en" style={inputStyle} value={f.location_lat || ''} onChange={(e) => set('location_lat', e.target.value)} placeholder="18.2164" /></Field>
        <Field label="Longitude"><input lang="en" style={inputStyle} value={f.location_lng || ''} onChange={(e) => set('location_lng', e.target.value)} placeholder="42.5053" /></Field>
      </Row>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', margin: '6px 0 8px' }}>DETAILS (OPTIONAL)</div>
      <Row>
        <Field label="Floors"><input lang="en" style={inputStyle} type="text" inputMode="numeric" min="0" value={f.floors || ''} onChange={(e) => set('floors', e.target.value)} /></Field>
        <Field label="Area (m²)"><input lang="en" style={inputStyle} type="text" inputMode="numeric" min="0" value={f.area_sqm || ''} onChange={(e) => set('area_sqm', e.target.value)} /></Field>
      </Row>
      <Field label="Remarks"><input lang="en" style={inputStyle} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} /></Field>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Planned scopes (ESM quantities) can be added afterwards from the building's detail page.</div>
    </Modal>
  )
}

// ── Soft-delete (archive) a building — sets status_override='archived' ───────
export function ArchiveBuildingModal({ building, onClose }) {
  const { user } = useAuth()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const archive = async () => {
    setBusy(true)
    const { error } = await bgUpdate('buildings', building.id, {
      status_override: 'archived', status_override_reason: reason || 'Archived',
      status_override_by: user.id, status_override_at: new Date().toISOString(),
    }, { okMsg: 'Building archived' })
    setBusy(false); if (!error) onClose()
  }

  return (
    <Modal open title={`Archive building · ${building.code}`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="danger" onClick={archive} disabled={busy}>{busy ? 'Archiving…' : 'Archive building'}</Btn></>}>
      <div style={{ fontSize: 13, marginBottom: 12 }}>This removes <strong>{building.name}</strong> from the project's active buildings, map and rollups. It is retained (soft-delete), not permanently deleted.</div>
      <Field label="Reason (optional)">
        <input lang="en" style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Removed from scope by client" />
      </Field>
    </Modal>
  )
}

// ── Manual building-status override (complaint 1.8) ─────────────────────────
// `status_override` is the building's effective status. A manual change records
// who/why/when so the Buildings table and Recent Activity reflect the override.
const BSTATUS = [
  ['pending', 'Pending'], ['in_progress', 'In Progress'], ['blocked', 'Blocked'],
  ['on_hold', 'On-Hold'], ['signed', 'Complete (COC signed)'],
]
export function BuildingStatusModal({ building, onClose }) {
  const { user } = useAuth()
  const [status, setStatus] = useState(building.status_override || 'pending')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const changed = status !== (building.status_override || 'pending')

  const save = async () => {
    if (!changed) { onClose(); return }
    setBusy(true)
    const { error } = await bgUpdate('buildings', building.id, {
      status_override: status, status_override_reason: reason || null,
      status_override_by: user.id, status_override_at: new Date().toISOString(),
    }, { okMsg: 'Building status updated' })
    setBusy(false); if (!error) onClose()
  }

  return (
    <Modal open title={`Building status · ${building.code}`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Apply'}</Btn></>}>
      <Field label="Status">
        <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
          {BSTATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <Field label="Reason (optional)">
        <textarea style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is the status changing? e.g. Awaiting client access" />
      </Field>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Recorded with your name and the time; it appears in Recent Activity.</div>
    </Modal>
  )
}

function Row({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${children.length || 2}, 1fr)`, gap: 12 }}>{children}</div> }
