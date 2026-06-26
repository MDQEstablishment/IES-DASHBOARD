import { useState, useRef } from 'react'
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
  const { rows: allEsms } = useLiveQuery('esms', (q) => q.select('code,name').order('code'))
  const init = (k, d = '') => (project?.[k] ?? d)
  const [f, setF] = useState({
    code: init('code'), name: init('name'), client: init('client'), region: init('region'),
    status: init('status', 'draft'), start_date: init('start_date'), end_date: init('end_date'),
    coc_layout: init('coc_layout', 'concatenated'),
    total_weeks: init('total_weeks'), pm_id: init('pm_id'), engineer_id: init('engineer_id'),
    location_address: init('location_address'), location_lat: init('location_lat'), location_lng: init('location_lng'),
    contractor_name: init('contractor_name'), contractor_phone: init('contractor_phone'), contractor_email: init('contractor_email'),
    project_reference_no: init('project_reference_no'), beneficiary_entity: init('beneficiary_entity'),
  })
  const [buildings, setBuildings] = useState([])
  const [items, setItems] = useState([]) // optional pair drafts captured at creation
  const [showItems, setShowItems] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const setItem = (i, k, v) => setItems((arr) => arr.map((x, j) => (j === i ? { ...x, [k]: v } : x)))

  const save = async () => {
    if (!f.code.trim() || !f.name.trim()) { toast('Code and name are required', 'err'); return }
    setBusy(true)
    const payload = {
      code: f.code.trim(), name: f.name.trim(), client: f.client || null, region: f.region || null,
      status: f.status, start_date: f.start_date || null, end_date: f.end_date || null,
      coc_layout: f.coc_layout || 'concatenated',
      total_weeks: num(f.total_weeks), pm_id: f.pm_id || null, engineer_id: f.engineer_id || null,
      location_address: f.location_address || null, location_lat: num(f.location_lat), location_lng: num(f.location_lng),
      contractor_name: f.contractor_name || null, contractor_phone: f.contractor_phone || null, contractor_email: f.contractor_email || null,
      project_reference_no: f.project_reference_no || null, beneficiary_entity: f.beneficiary_entity || null,
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
    // optional Items & Replacements captured at creation (fill-once)
    if (!error && data?.[0] && items.length) {
      const pid = data[0].id
      for (const it of items.filter((x) => x.esm_code && (x.iDesc || x.rDesc))) {
        let iId = null, rId = null
        if (it.iDesc || it.iQty) { const { data: di } = await bgInsert('project_installed_items', { project_id: pid, esm_code: it.esm_code, item_description: it.iDesc || null, model_code: it.iModel || null, capacity_value: num(it.iCap), capacity_unit: it.iCapU || 'kBTU', efficiency_value: num(it.iEff), efficiency_unit: it.iEffU || 'SEER', total_quantity: num(it.iQty) }); iId = di?.[0]?.id }
        if (it.rDesc || it.rQty) { const { data: dr } = await bgInsert('project_removed_items', { project_id: pid, esm_code: it.esm_code, item_description: it.rDesc || null, capacity_value: num(it.rCap), capacity_unit: it.rCapU || 'kBTU', efficiency_value: num(it.rEff), efficiency_unit: it.rEffU || 'SEER', total_quantity: num(it.rQty), returned_to_facility: it.rRet !== false }); rId = dr?.[0]?.id }
        if (iId && rId) await bgInsert('project_item_pairs', { project_id: pid, esm_code: it.esm_code, installed_item_id: iId, removed_item_id: rId, notes: it.note || null })
      }
    }
    setBusy(false)
    if (!error) { onClose(); if (data?.[0]) navigate(`/projects/${data[0].id}`) }
  }

  return (
    <Modal open width={640} title={mode === 'edit' ? `Edit project · ${project.code}` : 'Add project'} onClose={onClose}
      footer={<>
        {mode === 'edit' && <Btn variant="danger" onClick={() => setShowDelete(true)} style={{ marginRight: 'auto' }}>Delete project</Btn>}
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create project'}</Btn>
        {showDelete && <DeleteProjectModal project={project} onClose={() => { setShowDelete(false); onClose() }} />}
      </>}>
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
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', margin: '6px 0 8px' }}>DOCUMENT DEFAULTS (TARSHID FORMS)</div>
      <Row>
        <Field label="Project Reference No"><input lang="en" style={inputStyle} value={f.project_reference_no} onChange={(e) => set('project_reference_no', e.target.value)} placeholder="2022005" /></Field>
        <Field label="Beneficiary Entity"><input lang="en" style={inputStyle} value={f.beneficiary_entity} onChange={(e) => set('beneficiary_entity', e.target.value)} placeholder="Defaults to Client" /></Field>
      </Row>
      <div style={{ fontSize: 11, color: 'var(--text-3)', margin: '-4px 0 4px' }}>These auto-fill on every generated MIR / WIR / COC so they're entered once, not per document. Contractor comes from the Contractor section below.</div>
      <Field label="COC Layout">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[['concatenated', 'Concatenated', 'one site, single in-charge → project-wide COCs'], ['scattered', 'Scattered', 'buildings far apart, per-building managers → per-building COCs']].map(([v, lab, help]) => (
            <label key={v} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', border: '1px solid ' + (f.coc_layout === v ? 'var(--accent)' : 'var(--line)'), borderRadius: 8, padding: '8px 10px', background: f.coc_layout === v ? '#EFF6FF' : '#fff' }}>
              <input type="radio" name="coc_layout" checked={f.coc_layout === v} onChange={() => set('coc_layout', v)} style={{ marginTop: 2 }} />
              <span><span style={{ fontWeight: 700, fontSize: 13 }}>{lab}</span><span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-3)' }}>{help}</span></span>
            </label>
          ))}
        </div>
      </Field>
      {mode === 'edit' && <EsmBundles projectId={project.id} />}
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

      {mode === 'add' && (
        <div style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button type="button" onClick={() => setShowItems((s) => !s)} style={{ fontWeight: 700, fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>Items &amp; Replacements (optional) {showItems ? '▲' : '▼'}</button>
            {showItems && <button onClick={() => setItems((a) => [...a, { esm_code: allEsms[0]?.code || '', iCapU: 'kBTU', iEffU: 'SEER', rCapU: 'kBTU', rEffU: 'SEER', rRet: true }])} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>+ Add pair</button>}
          </div>
          {showItems && <>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 6 }}>Fill once at creation — installed ↔ removed pairs are persisted with the project. You can refine later in the Items &amp; Replacements tab.</div>
            {items.map((it, i) => (
              <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, marginBottom: 8, background: '#F8FAFC' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                  <select style={{ ...inputStyle, width: 130, padding: '6px 8px' }} value={it.esm_code} onChange={(e) => setItem(i, 'esm_code', e.target.value)}>{allEsms.map((e) => <option key={e.code} value={e.code}>{e.code}</option>)}</select>
                  <button onClick={() => setItems((a) => a.filter((_, j) => j !== i))} style={{ color: 'var(--bad)', fontSize: 11.5, fontWeight: 700 }}>Remove</button>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ok)', marginBottom: 3 }}>INSTALLED</div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 0.8fr', gap: 6, marginBottom: 6 }}>
                  <input lang="en" style={{ ...inputStyle, padding: '6px 8px' }} placeholder="Description" value={it.iDesc || ''} onChange={(e) => setItem(i, 'iDesc', e.target.value)} />
                  <input lang="en" style={{ ...inputStyle, padding: '6px 8px' }} placeholder="Model" value={it.iModel || ''} onChange={(e) => setItem(i, 'iModel', e.target.value)} />
                  <input lang="en" inputMode="numeric" style={{ ...inputStyle, padding: '6px 8px' }} placeholder="Cap (kBTU)" value={it.iCap || ''} onChange={(e) => setItem(i, 'iCap', e.target.value)} />
                  <input lang="en" inputMode="numeric" style={{ ...inputStyle, padding: '6px 8px' }} placeholder="SEER" value={it.iEff || ''} onChange={(e) => setItem(i, 'iEff', e.target.value)} />
                  <input lang="en" inputMode="numeric" style={{ ...inputStyle, padding: '6px 8px' }} placeholder="Qty" value={it.iQty || ''} onChange={(e) => setItem(i, 'iQty', e.target.value)} />
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--bad)', marginBottom: 3 }}>REMOVED</div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 0.8fr', gap: 6 }}>
                  <input lang="en" style={{ ...inputStyle, padding: '6px 8px' }} placeholder="Description" value={it.rDesc || ''} onChange={(e) => setItem(i, 'rDesc', e.target.value)} />
                  <input lang="en" inputMode="numeric" style={{ ...inputStyle, padding: '6px 8px' }} placeholder="Cap (kBTU)" value={it.rCap || ''} onChange={(e) => setItem(i, 'rCap', e.target.value)} />
                  <input lang="en" inputMode="numeric" style={{ ...inputStyle, padding: '6px 8px' }} placeholder="SEER" value={it.rEff || ''} onChange={(e) => setItem(i, 'rEff', e.target.value)} />
                  <input lang="en" inputMode="numeric" style={{ ...inputStyle, padding: '6px 8px' }} placeholder="Qty" value={it.rQty || ''} onChange={(e) => setItem(i, 'rQty', e.target.value)} />
                </div>
              </div>
            ))}
          </>}
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
  const [err, setErr] = useState('')
  const reasonRequired = status === 'on_hold' || status === 'closed'

  const save = async () => {
    if (status === project.status) { onClose(); return }
    if (reasonRequired && !reason.trim()) { toast('A reason is required for on-hold / closed', 'err'); return }
    setErr('')
    setBusy(true)
    console.log('[IES] status change', { project: project.code, from: project.status, to: status })
    const { data, error } = await bgUpdate('projects', project.id, {
      status, status_changed_by: user.id, status_changed_at: new Date().toISOString(), status_change_reason: reason || null,
    }, { okMsg: `Status → ${statusLabel(status)}` })
    setBusy(false)
    if (error) { setErr(error.message); return }
    // RLS can match 0 rows and return no error — that's a silent no-op, not success.
    if (!data || !data.length) {
      setErr('Status did not persist — you may not have permission to change this project (PMO only).')
      console.warn('[IES] status change affected 0 rows (RLS?)', project.id)
      return
    }
    onClose()
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
      {err && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 10, fontSize: 12.5, color: '#B91C1C', marginTop: 10 }}>{err}</div>}
    </Modal>
  )
}

// ── Delete (soft) — type-to-confirm, admin only ─────────────────────────────
export function DeleteProjectModal({ project, onClose }) {
  const { user } = useAuth()
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const ok = confirm.trim() === project.code

  const [err, setErr] = useState('')
  const navigate = useNavigate()

  const del = async () => {
    if (!ok) return
    setErr('')
    setBusy(true)
    console.log('[IES] delete project', project.code)
    const { data, error } = await bgUpdate('projects', project.id, {
      deleted_at: new Date().toISOString(), status_changed_by: user.id, status_changed_at: new Date().toISOString(), status_change_reason: 'Soft-deleted',
    }, { okMsg: 'Project deleted' })
    setBusy(false)
    if (error) { setErr(error.message); return }
    if (!data || !data.length) { setErr('Delete did not persist — you may not have permission (PMO only).'); return }
    onClose()
    navigate('/projects')
  }

  return (
    <Modal open title={`Delete project · ${project.code}`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="danger" onClick={del} disabled={!ok || busy}>{busy ? 'Deleting…' : 'Delete project'}</Btn></>}>
      <div style={{ fontSize: 13, marginBottom: 6 }}>This will delete the project and hide its buildings, scopes, items, deliveries, and documents from every list. It is soft-deleted and recoverable for 30 days.</div>
      <div style={{ fontSize: 13, marginBottom: 12 }}>Type <strong style={{ fontFamily: 'var(--mono)' }}>{project.code}</strong> to confirm.</div>
      <input lang="en" style={inputStyle} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={project.code} />
      {err && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 10, fontSize: 12.5, color: '#B91C1C', marginTop: 10 }}>{err}</div>}
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
  const [importErr, setImportErr] = useState('') // server-side failure surfaced inline
  const [fileName, setFileName] = useState('') // selected file (drives Confirm gate + label)
  const [dlState, setDlState] = useState('idle') // idle | busy | done — download feedback
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const downloadTemplate = async () => {
    setDlState('busy')
    // prefer the app-bundled template (versioned with the deploy) then bucket fallback
    for (const url of [TEMPLATE_STATIC_URL, TEMPLATE_BUCKET_URL]) {
      try {
        const res = await fetch(url)
        if (!res.ok) continue
        const blob = await res.blob()
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = 'IES-Project-Template.xlsx'
        document.body.appendChild(a); a.click(); a.remove()
        URL.revokeObjectURL(a.href)
        setDlState('done')
        setTimeout(() => setDlState('idle'), 3000)
        return
      } catch { /* try next source */ }
    }
    setDlState('idle')
    toast("Couldn't fetch the template — check your connection", 'err')
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setFileName(file.name)
    setErrors([]); setParsed(null); setImportErr('')
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
    // Visible on every click so a future dead-button report can be diagnosed from the console.
    console.log('[IES] import: Confirm clicked', { project: parsed?.project?.code, errors: errors.length, busy })
    if (!parsed?.project || errors.length) {
      setImportErr('Nothing to import — fix the validation errors above first.')
      return
    }
    setImportErr('')
    setBusy(true)
    const p = parsed.project
    const payload = {
      project: {
        code: s(p.code), name: s(p.name), client: s(p.client), region: s(p.region), address: s(p.address),
        lat: s(p.lat), lng: s(p.lng), start_date: toIso(p.start_date), end_date: toIso(p.end_date),
        status: s(p.status), total_weeks: s(p.total_weeks), pm_email: s(p.pm_email), engineer_email: s(p.engineer_email),
        contractor_name: s(p.contractor_name), contractor_phone: s(p.contractor_phone), contractor_email: s(p.contractor_email),
        project_reference_no: s(p.project_reference_no), beneficiary_entity: s(p.beneficiary_entity),
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
    let data, error
    try {
      ({ data, error } = await supabase.rpc('import_project_bundle', { p: payload }))
    } catch (ex) {
      error = ex
    }
    setBusy(false)
    if (error) {
      const msg = error.message || 'Unknown error'
      console.error('[IES] import_project_bundle failed', error)
      setImportErr(`Import failed — ${msg}`)
      toast(`Import failed — ${msg}`, 'err')
      return
    }
    toast(`✓ Project ${data.project_code || s(p.code)} created — ${data.buildings} buildings, ${data.scopes} scopes, ${data.materials} materials`)
    onClose()
    if (data.project_id) navigate(`/projects/${data.project_id}`)
  }

  const counts = parsed && { p: parsed.project ? 1 : 0, b: parsed.buildings.length, c: parsed.scopes.length, m: parsed.materials.length }

  return (
    <Modal open width={620} title="Import a project from Excel" onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={doImport} disabled={!fileName || !parsed?.project || !!errors.length || busy}
          title={!fileName ? 'Upload a filled template first' : undefined}>{busy ? 'Importing…' : 'Confirm import'}</Btn></>}>
      <div style={{ fontSize: 13, marginBottom: 12 }}>Step 1 — download the template. It has 5 sheets (Instructions, Project, Buildings, Building Scopes, Materials) with colors and per-field notes. Fill them, delete the example rows, then upload.</div>
      <Btn icon={dlState === 'done' ? 'check' : 'upload'} onClick={downloadTemplate} disabled={dlState === 'busy'} style={{ marginBottom: dlState === 'done' ? 6 : 14 }}>
        {dlState === 'busy' ? 'Downloading…' : dlState === 'done' ? 'Downloaded ✓' : 'Download template (.xlsx)'}
      </Btn>
      {dlState === 'done' && <div style={{ fontSize: 12, color: '#047857', marginBottom: 12 }}>Downloaded ✓ — fill it and upload below.</div>}
      <Field label="Step 2 — upload the filled template">
        <input ref={fileRef} lang="en" type="file" accept=".xlsx,.xls" onChange={onFile} style={{ display: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Btn icon="upload" onClick={() => fileRef.current?.click()}>{fileName ? 'Change file' : 'Choose Excel file'}</Btn>
          <span style={{ fontSize: 12.5, color: fileName ? 'var(--text)' : 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fileName}>
            {fileName || 'No file chosen'}
          </span>
        </div>
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
      {importErr && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 10, fontSize: 12.5, color: '#B91C1C', marginTop: 10 }}>
          {importErr}
        </div>
      )}
    </Modal>
  )
}

function Row({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${children.length || 2}, 1fr)`, gap: 12 }}>{children}</div> }

// ESM bundle-key editor (Edit Project). ESMs sharing a key group onto one COC.
function EsmBundles({ projectId }) {
  const { rows } = useLiveQuery('project_esms', (q) => q.select('id,coc_bundle_key,ordinal,esm:esms(code,name)').eq('project_id', projectId).order('ordinal'), [projectId])
  if (!rows.length) return null
  const suggest = (pe) => pe.coc_bundle_key ?? (/light/i.test(pe.esm?.name || '') ? 'lighting' : '')
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', margin: '6px 0 6px' }}>ESM BUNDLES</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 8 }}>ESMs sharing a bundle key go on one COC (e.g. ESM1+ESM2 = “lighting”). Empty = standalone.</div>
      {rows.map((pe) => (
        <div key={pe.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)', width: 48 }}>{pe.esm?.code}</span>
          <span style={{ flex: 1, fontSize: 12.5 }}>{pe.esm?.name}</span>
          <input lang="en" defaultValue={suggest(pe)} placeholder="bundle key"
            onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (pe.coc_bundle_key || null)) bgUpdate('project_esms', pe.id, { coc_bundle_key: v }) }}
            style={{ ...inputStyle, width: 140, padding: '6px 8px' }} />
        </div>
      ))}
    </div>
  )
}
function statusLabel(s) { return ({ active: 'Active', draft: 'Draft', on_hold: 'On-Hold', closed: 'Closed', deleted: 'Deleted' })[s] || s }
