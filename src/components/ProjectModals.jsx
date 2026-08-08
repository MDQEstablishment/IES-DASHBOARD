import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal, Field, inputStyle, Btn } from './ui'
import DateInput from './DateInput'
import FileDropZone from './FileDropZone'
import PhotoFocalPicker from './PhotoFocalPicker'
import { useLiveQuery, bgInsert, bgUpdate, uploadToBucket, signedUrlFor, downloadBlob } from '../lib/db'
import { compressImage } from '../lib/image'
import { supabase } from '../lib/supabase'
import { useAuth } from '../rbac'
import { toast } from '../lib/toast'
import { localDayKey } from '../lib/format'
import { read, utils } from 'xlsx'
import { BUCKETS } from '../lib/buckets'

// A3(18) — the project-status, building-status and ESM lists are no longer
// held here. They came from `public.v_form_options` (migration 0139), a view
// over the real pg_enum labels plus the `esms` table, and the SAME view feeds
// scripts/generate-project-template.js — so the app's validation and the Excel
// template's dropdowns cannot drift apart, which is exactly what they had done.
// The view withholds `project_status.deleted` and `building_status.archived`:
// both are legal column values reached only through their own controls, and
// offering "deleted" in a dropdown would soft-delete a project with no
// confirmation and no reason recorded.
const num = (v) => (v === '' || v == null ? null : Number(v))

// ── The project schedule is the contract pair ───────────────────────────────
// From this sprint on `projects.start_date`, `projects.end_date` and
// `projects.total_weeks` are DERIVED COPIES of contract_sign_date /
// works_end_date — populated, but no longer authoritative. The form neither
// shows nor accepts them; save writes them through from the contract pair so
// the frozen readers (lib/progressReport.js estimated completion + report
// meta, lib/cocPdf.js date fallbacks, ProjectDetail's timeline, the Projects
// list sort) keep producing correct output with zero generator edits.
// Whether the columns are ever dropped is a separate later decision, and it
// is contingent on there being no independent writer left. One is known
// TODAY: the Excel bundle import RPC `import_project_bundle` (migration 0060)
// writes all three from template columns. That path is out of scope here and
// must be reconciled in the import sprint before any drop is considered.
// Dates are ISO day keys, so UTC parsing is exact — no DST drift.
const weeksBetween = (from, to) => {
  if (!from || !to) return null
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  return Number.isFinite(ms) ? Math.round(ms / (7 * 86400000)) : null
}

// ── Add / Edit project ──────────────────────────────────────────────────────
export function ProjectFormModal({ mode = 'add', project, onClose }) {
  const navigate = useNavigate()
  const { rows: people } = useLiveQuery('profiles', (q) => q.select('id,full_name,role').eq('archived', false).order('full_name'))
  // A3(18) — the selectable project statuses, from the database (see the note
  // above statusLabel's former neighbours). statusLabel() still supplies the
  // WORDING so this dropdown keeps reading the same as the status chips
  // everywhere else; only the SET of values now comes from the enum.
  const { rows: formOptions } = useLiveQuery('v_form_options', (q) => q.select('domain,value,label,ordinal').order('ordinal'))
  const projectStatuses = formOptions.filter((o) => o.domain === 'project_status').map((o) => o.value)
  const init = (k, d = '') => (project?.[k] ?? d)
  const [f, setF] = useState({
    code: init('code'), name: init('name'), client: init('client'), region: init('region'),
    status: init('status', 'draft'),
    contract_sign_date: init('contract_sign_date'), works_end_date: init('works_end_date'),
    pm_id: init('pm_id'), engineer_id: init('engineer_id'),
    location_address: init('location_address'), location_lat: init('location_lat'), location_lng: init('location_lng'),
    contractor_name: init('contractor_name'), contractor_phone: init('contractor_phone'), contractor_email: init('contractor_email'),
    project_reference_no: init('project_reference_no'), beneficiary_entity: init('beneficiary_entity'),
    // 9D-1 TARSHID Info (saving-sheet Project_Info tab). lat/lng NOT duplicated
    // here — the Location section below already owns location_lat/lng.
    entity_name_ar: init('entity_name_ar'),
    entity_poc_name: init('entity_poc_name'), entity_poc_position: init('entity_poc_position'),
    entity_poc_mobile: init('entity_poc_mobile'), entity_poc_email: init('entity_poc_email'),
    tarshid_poc_name: init('tarshid_poc_name'), tarshid_poc_position: init('tarshid_poc_position'),
    tarshid_poc_mobile: init('tarshid_poc_mobile'), tarshid_poc_email: init('tarshid_poc_email'),
    // where the cover photo sits in the card frame. Defaults are today's
    // behaviour, so an untouched project renders exactly as it does now.
    photo_pos_x: init('photo_pos_x', 50), photo_pos_y: init('photo_pos_y', 50),
    photo_zoom: init('photo_zoom', 100),
  })
  // object URL for a freshly chosen file, so the picker previews the image the
  // person is about to commit rather than the one already stored
  const [pendingUrl, setPendingUrl] = useState(null)
  const setPending = (file) => {
    setPendingUrl((old) => { if (old) URL.revokeObjectURL(old); return file ? URL.createObjectURL(file) : null })
  }
  const clearPending = () => setPendingUrl((old) => { if (old) URL.revokeObjectURL(old); return null })
  // a newly chosen file wins over the stored one, so the picker always shows
  // the image that is about to be saved
  const photoSrc = pendingUrl || (!replacing && mode === 'edit' && project?.photo_url ? curPhoto : null)
  const [showDelete, setShowDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  // Project cover photo (edit mode). photoFile = new selection; removePhoto = drop
  // the existing one on save; replacing = user chose to swap the current photo.
  const [photoFile, setPhotoFile] = useState(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [curPhoto, setCurPhoto] = useState(null) // signed URL of the existing photo
  useEffect(() => {
    let cancelled = false
    if (project?.photo_url) signedUrlFor(BUCKETS.PROJECT_PHOTOS, project.photo_url).then((u) => { if (!cancelled) setCurPhoto(u) })
    return () => { cancelled = true }
  }, [project?.photo_url])
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  // Read-only on the form; also written through to the derived triple at save.
  const derivedWeeks = weeksBetween(f.contract_sign_date, f.works_end_date)

  const save = async () => {
    if (!f.code.trim() || !f.name.trim()) { toast('Code and name are required', 'err'); return }
    setBusy(true)
    const payload = {
      code: f.code.trim(), name: f.name.trim(), client: f.client || null, region: f.region || null,
      status: f.status,
      contract_sign_date: f.contract_sign_date || null, works_end_date: f.works_end_date || null,
      // Write-through: the contract pair is the source of truth, these three
      // are its derived copies (see the note at the top of this file). Both
      // save paths re-derive them, so an edit can never leave a stale triple.
      start_date: f.contract_sign_date || null, end_date: f.works_end_date || null,
      total_weeks: derivedWeeks,
      pm_id: f.pm_id || null, engineer_id: f.engineer_id || null,
      location_address: f.location_address || null, location_lat: num(f.location_lat), location_lng: num(f.location_lng),
      contractor_name: f.contractor_name || null, contractor_phone: f.contractor_phone || null, contractor_email: f.contractor_email || null,
      project_reference_no: f.project_reference_no || null, beneficiary_entity: f.beneficiary_entity || null,
      entity_name_ar: f.entity_name_ar || null,
      entity_poc_name: f.entity_poc_name || null, entity_poc_position: f.entity_poc_position || null,
      entity_poc_mobile: f.entity_poc_mobile || null, entity_poc_email: f.entity_poc_email || null,
      tarshid_poc_name: f.tarshid_poc_name || null, tarshid_poc_position: f.tarshid_poc_position || null,
      tarshid_poc_mobile: f.tarshid_poc_mobile || null, tarshid_poc_email: f.tarshid_poc_email || null,
      photo_pos_x: f.photo_pos_x, photo_pos_y: f.photo_pos_y, photo_zoom: f.photo_zoom,
    }
    if (mode === 'edit') {
      // Resolve the cover photo before the row update so photo_url lands atomically.
      if (photoFile) {
        let f = photoFile
        if (f.size > 800 * 1024) { try { f = await compressImage(f, { maxBytes: 800000, maxDim: 1600 }) } catch { /* keep original */ } }
        const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
        const path = `${project.id}/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await uploadToBucket(BUCKETS.PROJECT_PHOTOS, f, { key: path, maxBytes: 5 * 1024 * 1024 })
        if (upErr) { setBusy(false); return } // uploadToBucket already toasted
        payload.photo_url = path
        if (project.photo_url && project.photo_url !== path) supabase.storage.from(BUCKETS.PROJECT_PHOTOS).remove([project.photo_url])
      } else if (removePhoto && project.photo_url) {
        await supabase.storage.from(BUCKETS.PROJECT_PHOTOS).remove([project.photo_url])
        payload.photo_url = null
      }
      const { error } = await bgUpdate('projects', project.id, payload, { okMsg: 'Project updated' })
      setBusy(false); if (!error) onClose()
      return
    }
    // Creation writes the `projects` row and nothing else. Buildings arrive
    // with the TARSHID file after the card exists; item pairs are scope, and
    // scope is decided by the survey — neither is captured here any more, so
    // there are no child inserts left to fail after the row lands.
    const { data, error } = await bgInsert('projects', payload, { okMsg: 'Project created' })
    if (!error && data?.[0] && photoFile) {
      // The row has to exist before the photo, because the storage path is keyed
      // on the project id. The focal point already went in with the row above,
      // so the card is correct the first time it renders.
      const id = data[0].id
      let pf = photoFile
      if (pf.size > 800 * 1024) { try { pf = await compressImage(pf, { maxBytes: 800000, maxDim: 1600 }) } catch { /* keep original */ } }
      const ext = (pf.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
      const path = `${id}/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await uploadToBucket(BUCKETS.PROJECT_PHOTOS, pf, { key: path, maxBytes: 5 * 1024 * 1024 })
      if (!upErr) await bgUpdate('projects', id, { photo_url: path }, { silent: true })
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
      {/* Cover photo AND where it sits. Both live here, in Add project and Edit
          project — the card is a read surface everywhere else, so its appearance
          is configured where the project is configured (owner's ruling). */}
      <div style={{ marginBottom: 16 }}>
        {photoSrc && !removePhoto ? (
          <>
            <PhotoFocalPicker url={photoSrc} value={f}
              onChange={(v) => setF((p2) => ({ ...p2, ...v }))} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <Btn onClick={() => { setReplacing(true); setPhotoFile(null); clearPending() }}>Replace</Btn>
              {mode === 'edit' && project.photo_url && (
                <Btn variant="danger" onClick={() => { setRemovePhoto(true); setPhotoFile(null); clearPending(); setReplacing(false) }}>Remove</Btn>
              )}
            </div>
          </>
        ) : (
          <>
            <FileDropZone compact accept="image/*" maxSizeMb={5} label="Upload project photo"
              onFiles={(file) => { setPhotoFile(file); setRemovePhoto(false); setReplacing(false); setPending(file) }} />
            {removePhoto && project?.photo_url && (
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>
                Current photo will be removed on save. <button type="button" onClick={() => setRemovePhoto(false)} style={{ color: 'var(--accent)', fontWeight: 700 }}>Undo</button>
              </div>
            )}
          </>
        )}
      </div>
      <Group first>
        <Row>
          <Field label="Project code"><input lang="en" style={inputStyle} value={f.code} onChange={(e) => set('code', e.target.value)} placeholder="ABC-REGION" /></Field>
          <Field label="Status"><select style={inputStyle} value={f.status} onChange={(e) => set('status', e.target.value)}>{projectStatuses.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></Field>
        </Row>
        <Field label="Project name"><input lang="en" style={inputStyle} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Client — Region name" /></Field>
      </Group>
      {/* Client is the PAYING party, Beneficiary Entity is whose buildings are
          retrofitted — two concepts, not duplicates. Neither derives from the
          other and neither falls back to the other at save. The sentence that
          used to say so is gone: the distinction now lives in the label
          ("paying party") and in the beneficiary's placeholder, because a
          field that needs a sentence under it is a field not named well
          enough. The client placeholder is Tarshid — the party that actually
          pays, and the value MIR / WIR fall back to when this is blank.
          "Entity A" was there before and was simply wrong: that
          is the beneficiary. */}
      <Group>
        <Row>
          <Field label="Client"><input lang="en" style={inputStyle} value={f.client} onChange={(e) => set('client', e.target.value)} placeholder="Tarshid" /></Field>
          <Field label="Region"><input lang="en" style={inputStyle} value={f.region} onChange={(e) => set('region', e.target.value)} placeholder="Region name" /></Field>
        </Row>
        <Row>
          <Field label="Project Reference No"><input lang="en" style={inputStyle} value={f.project_reference_no} onChange={(e) => set('project_reference_no', e.target.value)} placeholder="2022005" /></Field>
          <Field label="Beneficiary Entity"><input lang="en" style={inputStyle} value={f.beneficiary_entity} onChange={(e) => set('beneficiary_entity', e.target.value)} placeholder="Entity whose buildings are retrofitted" /></Field>
        </Row>
      </Group>
      {/* The TARSHID / saving-sheet block is not edited here — it is its own
          workstream, and its ten columns are still written back untouched on
          every save. The COC layout setting is gone entirely: migration 0132
          dropped the column, because the builder is the layout decision now. */}
      {/* 8T/8U — contract + works-completion dates print in the COC project-info
          box. The COC signing date is NOT set here: signing happens later by
          TARSHID, on paper, and the approval date cell is left blank.
          These two are also THE project schedule: the clock starts at
          signature, when the contractor may mobilise for the survey. */}
      {/* "(computed)" in the label replaces the sentence that used to sit under
          this row. The rest of what it said — that the field cannot be typed
          and stays empty until both dates are set — is already carried by the
          control: it is readOnly, greyed and out of the tab order. */}
      <Group>
        <Row>
          <Field label="Contract signature date"><DateInput style={inputStyle} value={f.contract_sign_date || ''} onChange={(e) => set('contract_sign_date', e.target.value)} /></Field>
          <Field label="Works completion date"><DateInput style={inputStyle} value={f.works_end_date || ''} onChange={(e) => set('works_end_date', e.target.value)} /></Field>
          <Field label="Total weeks"><input lang="en" readOnly tabIndex={-1} aria-readonly="true" style={{ ...inputStyle, background: 'var(--hover)', color: 'var(--text-3)', cursor: 'default' }} value={derivedWeeks == null ? '' : String(derivedWeeks)} /></Field>
        </Row>
      </Group>
      <Group>
        <Row>
          <Field label="Project manager"><select style={inputStyle} value={f.pm_id || ''} onChange={(e) => set('pm_id', e.target.value)}><option value="">Unassigned</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>
          <Field label="Project engineer"><select style={inputStyle} value={f.engineer_id || ''} onChange={(e) => set('engineer_id', e.target.value)}><option value="">Unassigned</option>{people.filter((p) => p.role === 'proje').map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>
        </Row>
      </Group>
      {/* The phone field is named in full because it no longer sits under a
          CONTRACTOR caption — a bare "Phone" beside a project manager and a
          project engineer would read as theirs. */}
      <Group>
        <Row>
          <Field label="Contractor name"><input lang="en" style={inputStyle} value={f.contractor_name} onChange={(e) => set('contractor_name', e.target.value)} /></Field>
          <Field label="Contractor phone"><input lang="en" style={inputStyle} value={f.contractor_phone} onChange={(e) => set('contractor_phone', e.target.value)} placeholder="+966 50 000 0000" /></Field>
        </Row>
        <Field label="Contractor email"><input lang="en" style={inputStyle} value={f.contractor_email} onChange={(e) => set('contractor_email', e.target.value)} /></Field>
      </Group>
      {/* 9D-1 — TARSHID Info: fills the saving sheet's Project_Info tab at
          generation time. Buildings count / lat-lng / entity EN stay derived or
          owned by their existing fields (zero double work). Edit-mode only:
          the saving sheet is parked, the ten columns stay in the DB and stay
          editable here, but they are not asked for when the card is created. */}
      <Group>
        <Row>
          <Field label="Address"><input lang="en" style={inputStyle} value={f.location_address} onChange={(e) => set('location_address', e.target.value)} /></Field>
          <Field label="Latitude"><input lang="en" style={inputStyle} value={f.location_lat || ''} onChange={(e) => set('location_lat', e.target.value)} /></Field>
          <Field label="Longitude"><input lang="en" style={inputStyle} value={f.location_lng || ''} onChange={(e) => set('location_lng', e.target.value)} /></Field>
        </Row>
      </Group>
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
    const { data, error } = await bgUpdate('projects', project.id, {
      deleted_at: new Date().toISOString(), status_changed_by: user.id, status_changed_at: new Date().toISOString(), status_change_reason: 'Soft-deleted',
    }, { okMsg: 'Project deleted' })
    setBusy(false)
    if (error) { setErr(error.message); return }
    if (!data || !data.length) { setErr('Delete did not persist — deleting a project needs Admin, CEO or PMO authority.'); return }
    onClose()
    navigate('/projects')
  }

  return (
    <Modal open title={`Delete project · ${project.code}`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="danger" onClick={del} disabled={!ok || busy}>{busy ? 'Deleting…' : 'Delete project'}</Btn></>}>
      <div style={{ fontSize: 13, marginBottom: 6 }}>This will delete the project and hide its buildings, scopes, items, deliveries, and documents from every list. It is soft-deleted and recoverable for 30 days.</div>
      <div style={{ fontSize: 13, marginBottom: 12 }}>Type <strong style={{ fontFamily: 'var(--mono)' }}>{project.code}</strong> to confirm.</div>
      <input lang="en" style={inputStyle} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={project.code} />
      {err && <div style={{ background: 'var(--bad-bg)', border: '1px solid var(--bad-bg)', borderRadius: 'var(--radius-s)', padding: 10, fontSize: 12.5, color: 'var(--bad-deep)', marginTop: 10 }}>{err}</div>}
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
const TEMPLATE_BUCKET_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${BUCKETS.PROJECT_TEMPLATES}/IES-Project-Template-v3.xlsx`
const TEMPLATE_STATIC_URL = `${import.meta.env.BASE_URL}templates/IES-Project-Template-v3.xlsx`

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
  // A3(13)(18) — the three lists the importer validates against. They used to
  // be literals here, which meant a fourth ESM could not be imported without a
  // deploy: `!ESMS.includes(...)` rejected the row and the file with it.
  const { rows: formOptions } = useLiveQuery('v_form_options', (q) => q.select('domain,value,label,ordinal').order('ordinal'))
  const optionValues = (domain) => formOptions.filter((o) => o.domain === domain).map((o) => o.value)
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
        downloadBlob(blob, 'IES-Project-Template-v3.xlsx')
        setDlState('done')
        setTimeout(() => setDlState('idle'), 3000)
        return
      } catch { /* try next source */ }
    }
    setDlState('idle')
    toast("Couldn't fetch the template — check your connection", 'err')
  }

  const onFile = async (e) => {
    const PSTATUSES = optionValues('project_status')
    const BSTATUSES = optionValues('building_status')
    const ESMS = optionValues('esm')
    const file = e.target.files?.[0]; if (!file) return
    setFileName(file.name)
    setErrors([]); setParsed(null); setImportErr('')
    const wb = read(await file.arrayBuffer(), { cellDates: true })
    const pr = sheetRows(wb, 'Project')[0] || null
    const buildings = sheetRows(wb, 'Buildings')
    const scopes = sheetRows(wb, 'Building Scopes')
    const materials = sheetRows(wb, 'Materials')
    const items = sheetRows(wb, 'Items')

    const errs = []
    if (!pr) errs.push('The Project sheet has no data row.')
    if (pr && !s(pr.code)) errs.push('Project: code is required.')
    if (pr && !s(pr.name)) errs.push('Project: name is required.')
    // The lists are read from the database. If that read has not landed the
    // file is NOT waved through — an unvalidated import is worse than a
    // retry, because the RPC would then create real rows from unchecked values.
    if (PSTATUSES.length === 0 || BSTATUSES.length === 0 || ESMS.length === 0) {
      errs.push('The status and ESM lists could not be read from the database, so this file cannot be checked. Reload the page and try again.')
    }
    if (pr && s(pr.status) && PSTATUSES.length > 0 && !PSTATUSES.includes(s(pr.status))) errs.push(`Project: invalid status "${s(pr.status)}" — expected one of ${PSTATUSES.join(', ')}.`)

    const seen = new Set()
    buildings.forEach((b, i) => {
      const ln = `Buildings row ${i + 1}`
      if (!s(b.building_code)) errs.push(`${ln}: building_code is required.`)
      else if (seen.has(s(b.building_code))) errs.push(`${ln}: duplicate building_code "${s(b.building_code)}".`)
      else seen.add(s(b.building_code))
      if (pr && s(b.project_code) && s(b.project_code) !== s(pr.code)) errs.push(`${ln}: project_code "${s(b.project_code)}" ≠ Project code "${s(pr.code)}".`)
      if (s(b.lat) && (!isNum(b.lat) || Math.abs(Number(b.lat)) > 90)) errs.push(`${ln}: lat out of range.`)
      if (s(b.lng) && (!isNum(b.lng) || Math.abs(Number(b.lng)) > 180)) errs.push(`${ln}: lng out of range.`)
      if (s(b.status) && BSTATUSES.length > 0 && !BSTATUSES.includes(s(b.status))) errs.push(`${ln}: invalid status "${s(b.status)}" — expected one of ${BSTATUSES.join(', ')}.`)
      if (s(b.operating_hours) && !isNum(b.operating_hours)) errs.push(`${ln}: operating_hours must be a number.`)
    })
    scopes.forEach((c, i) => {
      const ln = `Scopes row ${i + 1}`
      if (!s(c.building_code)) errs.push(`${ln}: building_code is required.`)
      else if (!seen.has(s(c.building_code))) errs.push(`${ln}: building_code "${s(c.building_code)}" not found in Buildings.`)
      if (ESMS.length > 0 && !ESMS.includes(s(c.esm).toUpperCase())) errs.push(`${ln}: esm must be one of ${ESMS.join('/')}.`)
      if (s(c.planned_qty) && !isNum(c.planned_qty)) errs.push(`${ln}: planned_qty must be a number.`)
    })
    materials.forEach((m, i) => {
      const ln = `Materials row ${i + 1}`
      if (!s(m.material_code)) errs.push(`${ln}: material_code is required.`)
      if (ESMS.length > 0 && !ESMS.includes(s(m.esm).toUpperCase())) errs.push(`${ln}: esm must be one of ${ESMS.join('/')}.`)
    })
    items.forEach((it, i) => {
      const ln = `Items row ${i + 1}`
      if (ESMS.length > 0 && !ESMS.includes(s(it.esm).toUpperCase())) errs.push(`${ln}: esm must be one of ${ESMS.join('/')}.`)
      if (s(it.old_qty) && !isNum(it.old_qty)) errs.push(`${ln}: old_qty must be a number.`)
      if (s(it.new_qty) && !isNum(it.new_qty)) errs.push(`${ln}: new_qty must be a number.`)
    })

    setErrors(errs)
    setParsed({ project: pr, buildings, scopes, materials, items })
  }

  // SheetJS cellDates gives local-midnight Dates; toISOString() shifts them to
  // UTC and loses a day east of Greenwich — format from local components.
  const toIso = (v) => (v instanceof Date ? localDayKey(v) : s(v) || null)
  const doImport = async () => {
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
        doc_rev: s(p.doc_rev), contract_sign_date: toIso(p.contract_sign_date), works_end_date: toIso(p.works_end_date),
        energy_services_company: s(p.energy_services_company), subcontractor: s(p.subcontractor),
        pm_name: s(p.pm_name), engineer_name: s(p.engineer_name), coc_bundle_key: s(p.coc_bundle_key),
      },
      buildings: parsed.buildings.map((b) => ({
        building_code: s(b.building_code), building_name: s(b.building_name), city: s(b.city), lat: s(b.lat), lng: s(b.lng),
        floors: s(b.floors), area_sqm: s(b.area_sqm), contractor_name: s(b.contractor_name), contractor_phone: s(b.contractor_phone),
        status: s(b.status), remarks: s(b.remarks),
        assigned_engineer_email: s(b.assigned_engineer_email), arabic_name: s(b.arabic_name),
        building_type: s(b.building_type), elec_meter_no: s(b.elec_meter_no), elec_subscription_no: s(b.elec_subscription_no),
        elec_account_no: s(b.elec_account_no), responsible_person_name: s(b.responsible_person_name),
        responsible_person_phone: s(b.responsible_person_phone), operating_hours: s(b.operating_hours),
      })),
      scopes: parsed.scopes.map((c) => ({
        building_code: s(c.building_code), esm: s(c.esm).toUpperCase(), material_code: s(c.material_code),
        sub_type: s(c.sub_type), planned_qty: s(c.planned_qty), unit: s(c.unit), notes: s(c.notes),
      })),
      materials: parsed.materials.map((m) => ({
        material_code: s(m.material_code), description: s(m.description), esm: s(m.esm).toUpperCase(),
        unit: s(m.unit), threshold: s(m.threshold), supplier: s(m.supplier),
      })),
      items: (parsed.items || []).map((it) => ({
        building_code: s(it.building_code), esm: s(it.esm).toUpperCase(),
        old_code: s(it.old_code), old_description: s(it.old_description), old_qty: s(it.old_qty),
        new_code: s(it.new_code), new_description: s(it.new_description), new_qty: s(it.new_qty),
        unit: s(it.unit), notes: s(it.notes),
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
    toast(`✓ Project ${data.project_code || s(p.code)} created — ${data.buildings} buildings, ${data.scopes} scopes, ${data.materials} materials${data.pairs ? `, ${data.pairs} item pairs` : ''}`)
    onClose()
    if (data.project_id) navigate(`/projects/${data.project_id}`)
  }

  const counts = parsed && { p: parsed.project ? 1 : 0, b: parsed.buildings.length, c: parsed.scopes.length, m: parsed.materials.length, i: (parsed.items || []).length }

  return (
    <Modal open width={620} title="Import a project from Excel" onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={doImport} disabled={!fileName || !parsed?.project || !!errors.length || busy}
          title={!fileName ? 'Upload a filled template first' : undefined}>{busy ? 'Importing…' : 'Confirm import'}</Btn></>}>
      <div style={{ fontSize: 13, marginBottom: 12 }}>Step 1 — download the template. It has 6 sheets (Instructions, Project, Buildings, Building Scopes, Materials, Items) with colors and per-field notes. Fill them, delete the example rows, then upload.</div>
      <Btn icon={dlState === 'done' ? 'check' : 'upload'} onClick={downloadTemplate} disabled={dlState === 'busy'} style={{ marginBottom: dlState === 'done' ? 6 : 14 }}>
        {dlState === 'busy' ? 'Downloading…' : dlState === 'done' ? 'Downloaded ✓' : 'Download template (.xlsx)'}
      </Btn>
      {dlState === 'done' && <div style={{ fontSize: 12, color: 'var(--ok-deep)', marginBottom: 12 }}>Downloaded ✓ — fill it and upload below.</div>}
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
        <div style={{ background: 'var(--bad-bg)', border: '1px solid var(--bad-bg)', borderRadius: 'var(--radius-s)', padding: 10, fontSize: 12, color: 'var(--bad-deep)', marginTop: 8 }}>
          {errors.slice(0, 10).map((e, i) => <div key={i}>{e}</div>)}
          {errors.length > 10 && <div>+{errors.length - 10} more…</div>}
        </div>
      )}
      {parsed && !errors.length && (
        <div style={{ background: 'var(--ok-bg)', border: '1px solid var(--ok-bg)', borderRadius: 'var(--radius-s)', padding: 12, fontSize: 13, color: 'var(--ok-deep)', marginTop: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Ready to import — please confirm:</div>
          <div><strong>{counts.p}</strong> project (<span style={{ fontFamily: 'var(--mono)' }}>{s(parsed.project.code)}</span>), <strong>{counts.b}</strong> buildings, <strong>{counts.c}</strong> scopes, <strong>{counts.m}</strong> materials{counts.i > 0 && <>, <strong>{counts.i}</strong> item pairs</>} will be created.</div>
          <div style={{ fontSize: 11.5, marginTop: 4, color: 'var(--ok-deep)' }}>Everything is created in a single transaction — all or nothing.</div>
        </div>
      )}
      {importErr && (
        <div style={{ background: 'var(--bad-bg)', border: '1px solid var(--bad-bg)', borderRadius: 'var(--radius-s)', padding: 10, fontSize: 12.5, color: 'var(--bad-deep)', marginTop: 10 }}>
          {importErr}
        </div>
      )}
    </Modal>
  )
}

function Row({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${children.length || 2}, 1fr)`, gap: 12 }}>{children}</div> }

// Grouping for the project form, said structurally instead of in words. The
// grey section captions (DOCUMENT DEFAULTS / SCHEDULE / CONTRACTOR / LOCATION)
// and their explanatory notes were removed on the owner's instruction; the
// blocks they marked are real and still need separating, so each one is a
// Group: a hairline plus breathing room. Dropping the captions without this
// is what turns the card into the flat wall the owner complained about.
// `first` suppresses the rule on the opening group so the card doesn't start
// with a line under the modal header.
function Group({ first, children }) {
  return (
    <div style={first ? undefined : { borderTop: '1px solid var(--line)', marginTop: 4, paddingTop: 18 }}>{children}</div>
  )
}

function statusLabel(s) { return ({ active: 'Active', draft: 'Draft', on_hold: 'On-Hold', closed: 'Closed', deleted: 'Deleted' })[s] || s }
