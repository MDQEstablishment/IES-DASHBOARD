import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useLiveQuery, uploadToBucket, signedUrlFor } from '../../lib/db'
import { fetchAllRows } from '../../lib/tarshidImport'
import { m2PerTon } from '../../lib/savingSheet'
import { num, roomKey, toLatin } from '../../lib/format'
import { compressImage } from '../../lib/image'
import { Modal, Btn, Field, inputStyle } from '../ui'
import { toast } from '../../lib/toast'
import { SURVEY_CATEGORIES } from '../../lib/constants'
import FileDropZone from '../FileDropZone'

const PHOTO_BUCKET = 'daily-progress-photos'
const control = { ...inputStyle, boxSizing: 'border-box', width: '100%', maxWidth: '100%' }

// Latin-digit enforcement (same rule as 9A-fix): map Arabic-Indic/Persian -> Latin, strip the rest.
const numFilter = (s) => toLatin(s).replace(/[^\d.-]/g, '')
const ROOM_TYPES = ['Office', 'Corridor', 'Toilet', 'Meeting Room', 'Lobby', 'Reception', 'Ward', 'Clinic', 'Laboratory', 'Warehouse', 'Kitchen', 'Electrical Room', 'Staircase', 'Parking', 'Outdoor']

// numeric field keys and the int field
const NUMF = ['room_width', 'room_height', 'room_area', 'tr', 'wattage', 'age_years']

// 9D-6 — the old-model registry, fetched ONCE per session and shared by every
// modal open. ~2.5k slim rows is a single round trip and buys instant local
// search on a phone; re-fetching per open would not.
let registryPromise = null
function loadRegistry() {
  if (!registryPromise) {
    registryPromise = fetchAllRows('old_model_registry',
      'id,equipment_type,make,model_no,size_category,tr,t1_btu,t1_eer,equivalent_seer,compressor_type,surveyed_unit_description,retired')
      .then((r) => (r.rows || []).filter((x) => !x.retired))
      .catch(() => [])
  }
  return registryPromise
}

export default function SurveyEntryForm({ project, buildings, row, onClose, onSaved }) {
  const isNew = !row?.id
  const blank = () => ({
    building_id: row?.building_id || (buildings[0]?.id ?? ''), floor: row?.floor || '', room_name: row?.room_name || '',
    room_type: row?.room_type || '', room_width: row?.room_width ?? '', room_height: row?.room_height ?? '', room_area: row?.room_area ?? '',
    category: row?.category || 'lighting', catalog_item_id: row?.catalog_item_id || '',
    // the SURVEYED unit's link into old_model_registry (9D-6)
    registry_id: row?.registry_id || '', match_source: row?.match_source || '', match_confidence: row?.match_confidence ?? '',
    equipment_type: row?.equipment_type || '', make: row?.make || '', model: row?.model || '',
    size_category: row?.size_category || '', tr: row?.tr ?? '', wattage: row?.wattage ?? '', qty: row?.qty ?? 1,
    inverter: row?.inverter ?? false, age_years: row?.age_years ?? '', remarks: row?.remarks || '',
    photo_room_path: row?.photo_room_path || '', photo_indoor_path: row?.photo_indoor_path || '', photo_nameplate_path: row?.photo_nameplate_path || '',
  })
  const [form, setForm] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [areaTouched, setAreaTouched] = useState(!!row?.room_area)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  // auto room_area = width * height unless the user typed area directly
  useEffect(() => {
    if (areaTouched) return
    const w = parseFloat(form.room_width), h = parseFloat(form.room_height)
    if (!isNaN(w) && !isNaN(h)) set('room_area', String(Math.round(w * h * 100) / 100))
  }, [form.room_width, form.room_height]) // eslint-disable-line

  // 9D-5 — rooms already known for this building. The engineer keeps typing
  // whatever is on the door (free text is the field reality), but seeing the
  // existing names is what makes two teams converge on ONE room instead of
  // "Room 101" and "غرفة 101". The saved name is matched server-side by the
  // same rule roomKey() mirrors, so the hint below is what will actually happen.
  const NO_BUILDING = '00000000-0000-0000-0000-000000000000'
  const { rows: buildingRooms } = useLiveQuery('rooms', (q) =>
    q.select('id,name,floor').eq('building_id', form.building_id || NO_BUILDING).order('name'), [form.building_id])
  const roomMatch = useMemo(() => {
    const k = roomKey(form.room_name)
    if (!k) return null
    return buildingRooms.find((r) => roomKey(r.name) === k) || null
  }, [form.room_name, buildingRooms])

  const isAc = form.category === 'ac'
  const isLight = form.category === 'lighting'

  // 9D-6 — the registry is only needed for AC, so a lighting survey never pays
  // for the fetch. null = still loading.
  const [registry, setRegistry] = useState(null)
  useEffect(() => {
    if (!isAc) return
    let live = true
    loadRegistry().then((rs) => { if (live) setRegistry(rs) })
    return () => { live = false }
  }, [isAc])
  const matched = useMemo(() => (form.registry_id && registry ? registry.find((r) => r.id === form.registry_id) || null : null),
    [form.registry_id, registry])

  // Capacity comes from the matched nameplate (T1 BTU, else its tonnage) and
  // only otherwise from what was typed. m²/ton mirrors the workbook's column L.
  const derivedBtu = useMemo(() => {
    const trTyped = parseFloat(toLatin(String(form.tr ?? '')))
    if (matched) {
      const b = Number(matched.t1_btu), t = Number(matched.tr)
      if (Number.isFinite(b) && b > 0) return b
      if (Number.isFinite(t) && t > 0) return t * 12000
    }
    return Number.isFinite(trTyped) && trTyped > 0 ? trTyped * 12000 : null
  }, [matched, form.tr])
  const m2ton = isAc ? m2PerTon({ room_area: parseFloat(toLatin(String(form.room_area ?? ''))), btu: derivedBtu, qty: parseInt(form.qty, 10) || 1 }) : null

  // Fallback path: an unidentified unit is only useful later if it was
  // photographed. Legacy rows that never had a nameplate photo stay editable —
  // we block creating new blind spots, not maintaining old ones.
  const needsPhoto = (isAc || isLight) && !form.registry_id && !form.photo_nameplate_path && (isNew || !!row?.photo_nameplate_path)

  const payload = () => {
    const p = { project_id: project.id, building_id: form.building_id, floor: form.floor || null, room_name: form.room_name || null,
      room_type: form.room_type || null, category: form.category,
      // The approved REPLACEMENT is a project-level decision (Saving Sheet →
      // Project Unit Selection) — the field form no longer sets it, but a row
      // that already carries one keeps it untouched.
      catalog_item_id: (isAc || isLight) && form.catalog_item_id ? form.catalog_item_id : null,
      // the SURVEYED unit's registry link
      registry_id: isAc && form.registry_id ? form.registry_id : null,
      match_source: isAc && form.registry_id ? (form.match_source || 'human') : null,
      match_confidence: isAc && form.registry_id ? (form.match_confidence === '' || form.match_confidence == null ? 1 : Number(form.match_confidence)) : null,
      equipment_type: form.equipment_type || null, make: form.make || null,
      model: form.model || null, size_category: form.size_category || null, remarks: form.remarks || null,
      inverter: isAc ? !!form.inverter : null, qty: form.qty === '' || form.qty == null ? 1 : parseInt(form.qty, 10),
      photo_room_path: form.photo_room_path || null, photo_indoor_path: form.photo_indoor_path || null, photo_nameplate_path: form.photo_nameplate_path || null }
    NUMF.forEach((k) => { p[k] = form[k] === '' || form[k] == null ? null : parseFloat(form[k]) })
    if (!isAc) p.tr = null
    if (!isLight) p.wattage = null
    return p
  }

  const save = async (again) => {
    if (!form.building_id) { toast('Pick a building', 'err'); return }
    if (needsPhoto) { toast('This unit is not matched to the registry — add the nameplate photo so it can be identified', 'err'); return }
    if (isLight && (form.wattage === '' || form.wattage == null)) { toast('Enter the fitting wattage', 'err'); return }
    setBusy(true)
    if (isNew) {
      const { error } = await supabase.from('survey_entries').insert(payload())
      if (error) { setBusy(false); toast("Couldn't save — " + error.message, 'err'); return }
      toast('Entry added')
    } else {
      // .select() so an RLS/no-row no-op is detectable: with two field teams
      // writing live, this row may have been deleted since the modal opened —
      // a bare .update() would return no error and we'd toast a false success.
      const { data, error } = await supabase.from('survey_entries').update(payload()).eq('id', row.id).select('id')
      if (error) { setBusy(false); toast("Couldn't save — " + error.message, 'err'); return }
      if (!data || data.length === 0) { setBusy(false); toast("Couldn't save — this entry no longer exists or isn't yours to edit", 'err'); return }
      toast('Entry updated')
    }
    setBusy(false)
    if (again) {
      // keep the location block, reset the unit block for fast same-room repeat
      setForm((p) => ({ ...p, catalog_item_id: '', registry_id: '', match_source: '', match_confidence: '',
        equipment_type: '', make: '', model: '', size_category: '', tr: '', wattage: '', qty: 1, inverter: false, age_years: '', remarks: '', photo_nameplate_path: '', photo_indoor_path: '' }))
      onSaved?.(false)
    } else { onSaved?.(true) }
  }

  return (
    <Modal open width={640} title={isNew ? 'Add survey entry' : 'Edit survey entry'} onClose={onClose}
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        {isNew && <Btn disabled={busy} onClick={() => save(true)}>{busy ? '…' : 'Save & add another'}</Btn>}
        <Btn variant="primary" disabled={busy} onClick={() => save(false)}>{busy ? 'Saving…' : isNew ? 'Save entry' : 'Save changes'}</Btn>
      </>}>
      {/* LOCATION */}
      <SectionLabel>Location</SectionLabel>
      <div style={grid}>
        <Field label="Building *">
          <select style={control} value={form.building_id} onChange={(e) => set('building_id', e.target.value)}>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
          </select>
        </Field>
        <Field label="Floor"><input style={control} lang="en" value={form.floor} onChange={(e) => set('floor', e.target.value)} /></Field>
        <Field label="Room name">
          <input style={control} list="survey-room-names" value={form.room_name} autoComplete="off"
            placeholder={buildingRooms.length ? 'Type or pick an existing room' : undefined}
            onChange={(e) => set('room_name', e.target.value)} />
          <datalist id="survey-room-names">
            {buildingRooms.map((r) => <option key={r.id} value={r.name}>{r.floor ? `Floor ${r.floor}` : ''}</option>)}
          </datalist>
          {roomKey(form.room_name) !== '' && (
            roomMatch
              ? <div style={{ fontSize: 10.5, color: 'var(--ok)', marginTop: 3 }}>Links to existing room “{roomMatch.name}”</div>
              : <div style={{ fontSize: 10.5, color: '#B45309', marginTop: 3 }}>New room — will be created in this building</div>
          )}
        </Field>
        <Field label="Room type">
          <input style={control} list="survey-room-types" value={form.room_type} onChange={(e) => set('room_type', e.target.value)} />
          <datalist id="survey-room-types">{ROOM_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
        <NumField label="Width (m)" v={form.room_width} on={(v) => set('room_width', v)} />
        <NumField label="Height (m)" v={form.room_height} on={(v) => set('room_height', v)} />
        <NumField label="Area (m²)" v={form.room_area} on={(v) => { setAreaTouched(true); set('room_area', v) }} help={!areaTouched ? 'auto = W × H' : undefined} />
        {isAc && (
          <Field label="m² / Ton">
            <input lang="en" dir="ltr" style={{ ...control, background: 'var(--bg)' }} value={m2ton == null ? '—' : num(m2ton)} readOnly />
            <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-3)', marginTop: 4 }}>
              {m2ton != null ? 'area ÷ (BTU ÷ 12,000) ÷ qty'
                : !form.room_area ? 'needs the room area'
                  : derivedBtu ? 'needs the quantity'
                    : 'needs the capacity — match the old unit or enter TR'}
            </span>
          </Field>
        )}
      </div>

      {/* OLD UNIT — what is actually standing in the room. The approved
          replacement is NOT chosen here: it is a project-level commercial
          decision (Saving Sheet → Project Unit Selection). */}
      <SectionLabel>Old unit — what is installed now</SectionLabel>
      <div style={grid}>
        <Field label="Category *">
          {/* switching category invalidates both links (they are per-category) */}
          <select style={control} value={form.category}
            onChange={(e) => setForm((p) => ({ ...p, category: e.target.value, catalog_item_id: '', registry_id: '', match_source: '', match_confidence: '' }))}>
            {SURVEY_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        {isAc && (
          <div style={{ minWidth: 0, gridColumn: '1 / -1' }}>
            <OldUnitPicker registry={registry} matched={matched} value={form.registry_id} refValue={form.tr}
              matchSource={form.match_source} matchConfidence={form.match_confidence}
              onPick={(reg) => setForm((p) => ({ ...p,
                registry_id: reg.id, match_source: 'human', match_confidence: 1,
                equipment_type: reg.equipment_type || p.equipment_type,
                make: reg.make || p.make,
                model: reg.model_no || p.model,
                size_category: reg.size_category || p.size_category,
                tr: reg.tr != null ? String(reg.tr) : p.tr,
                // the registry knows the compressor; the technician can still
                // override what they see on the plate
                inverter: reg.compressor_type ? /inverter/i.test(reg.compressor_type) : p.inverter,
              }))}
              onClear={() => setForm((p) => ({ ...p, registry_id: '', match_source: '', match_confidence: '' }))} />
          </div>
        )}
        {/* matched: derived, read-only. unmatched: free text, and the nameplate
            photo becomes mandatory so AI job #1 has something to work from. */}
        <Field label="Equipment type"><input style={{ ...control, ...(matched ? ro : null) }} value={form.equipment_type} readOnly={!!matched} onChange={(e) => set('equipment_type', e.target.value)} /></Field>
        <Field label="Make"><input style={{ ...control, ...(matched ? ro : null) }} value={form.make} readOnly={!!matched} onChange={(e) => set('make', e.target.value)} /></Field>
        <Field label="Model"><input style={{ ...control, ...(matched ? ro : null) }} value={form.model} readOnly={!!matched} onChange={(e) => set('model', e.target.value)} /></Field>
        <Field label="Size category"><input style={{ ...control, ...(matched ? ro : null) }} value={form.size_category} readOnly={!!matched} onChange={(e) => set('size_category', e.target.value)} /></Field>
        {isAc && (matched
          ? <Field label="TR (tonnage)"><input lang="en" dir="ltr" style={{ ...control, ...ro }} value={form.tr === '' || form.tr == null ? '—' : num(form.tr)} readOnly /></Field>
          : <NumField label="TR (tonnage)" v={form.tr} on={(v) => set('tr', v)} />)}
        {isLight && <NumField label="Wattage (W) *" v={form.wattage} on={(v) => set('wattage', v)} help="of the existing fitting" />}
        <NumField label="Qty" v={form.qty} on={(v) => set('qty', v)} />
        <NumField label="Age (years)" v={form.age_years} on={(v) => set('age_years', v)} />
        {isAc && (
          <div style={{ minWidth: 0, gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!form.inverter} onChange={(e) => set('inverter', e.target.checked)} /> Inverter unit
            </label>
            <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginBottom: 14 }}>
              {matched && matched.compressor_type
                ? `Registry compressor type: ${matched.compressor_type} — change it if the nameplate says otherwise.`
                : 'Inverter units are out of replacement scope.'}
            </div>
          </div>
        )}
        {isAc && <div style={{ minWidth: 0, gridColumn: '1 / -1' }}><DerivedEquivalent matched={matched} btu={derivedBtu} loading={registry === null} linked={!!form.registry_id} /></div>}
        {needsPhoto && (
          <div style={{ minWidth: 0, gridColumn: '1 / -1', marginBottom: 14, border: '1px solid #EBDCB2', background: '#FAF3E3', borderRadius: 8, padding: '8px 11px', fontSize: 11.5, color: '#854D0E' }}>
            <b>Nameplate photo required.</b> {isAc
              ? 'This unit is not matched to the registry, so the photo is the only record of what it is — the assistant reads these to identify the model later.'
              : 'There is no approved registry for existing fittings, so the photo plus the wattage is the record of what was there.'}
          </div>
        )}
        <div style={{ minWidth: 0, gridColumn: '1 / -1' }}>
          <Field label="Remarks"><textarea style={{ ...control, minHeight: 52, resize: 'vertical' }} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} /></Field>
        </div>
      </div>

      {/* PHOTOS */}
      <SectionLabel>Photos</SectionLabel>
      <div style={grid}>
        <PhotoSlot label="Room photo" path={form.photo_room_path} buildingId={form.building_id} onPath={(p) => set('photo_room_path', p)} />
        <PhotoSlot label="Indoor unit" path={form.photo_indoor_path} buildingId={form.building_id} onPath={(p) => set('photo_indoor_path', p)} />
        <PhotoSlot label={needsPhoto ? 'Nameplate *' : 'Nameplate'} required={needsPhoto} path={form.photo_nameplate_path} buildingId={form.building_id} onPath={(p) => set('photo_nameplate_path', p)} />
      </div>
    </Modal>
  )
}

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0 14px' }
// derived-from-the-registry fields are shown, never typed
const ro = { background: 'var(--bg)', color: 'var(--text-2)' }
const SectionLabel = ({ children }) => <div style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-3)', margin: '4px 0 8px' }}>{children}</div>

// 9D-6 — searchable picker over OLD_MODEL_REGISTRY: the unit standing in the
// room, not its replacement. Picking one stores registry_id (+ match_source
// 'human', confidence 1) and is what makes the workbook's R/S/T/U/V columns
// derive from the real nameplate instead of the assumed-efficiency factor.
// Search is TOKENIZED and numeric-aware: '2 TR' / '2TR' / '2' match rows whose
// tonnage (or T1 BTU / EER / equivalent SEER) is within ±10% — the same
// tolerance TARSHID uses — because the stored strings don't contain '2 TR'
// verbatim. Default list ranks by proximity to the tonnage already typed, or
// shows a representative sample across size categories, never import order.
const UNIT_WORDS = new Set(['tr', 'w', 'watt', 'watts', 'seer', 'eer', 'btu', 'ton', 'tons', 'hrs'])
function OldUnitPicker({ registry, matched, value, refValue, matchSource, matchConfidence, onPick, onClear }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const rows = registry || []
  const loading = registry === null

  const labelOf = (r) => [r.equipment_type, r.make, r.model_no,
    r.tr != null ? `${num(r.tr)} TR` : null,
    r.equivalent_seer != null ? `SEER ${num(r.equivalent_seer)}` : null].filter(Boolean).join(' · ')
  const titleOf = (r) => [r.size_category, r.surveyed_unit_description].filter(Boolean).join(' — ')

  const matches = useMemo(() => {
    const norm = (s) => toLatin(String(s ?? '')).toLowerCase()
    const hayOf = (r) => norm([r.model_no, r.make, r.equipment_type, r.size_category, r.surveyed_unit_description].filter(Boolean).join(' '))
    const numsOf = (r) => [r.tr, r.t1_btu, r.t1_eer, r.equivalent_seer].filter((v) => v != null).map(Number)
    // tokens: split, strip standalone unit words, peel unit suffixes ('2tr' -> '2')
    const tokens = norm(q).split(/\s+/).filter(Boolean)
      .filter((t) => !UNIT_WORDS.has(t))
      .map((t) => { const m = /^(\d+(?:\.\d+)?)(tr|w|watts?|seer|eer|btu|tons?)$/.exec(t); return m ? m[1] : t })
    const tokenHit = (r, t) => {
      if (hayOf(r).includes(t)) return true
      const n = /^\d+(?:\.\d+)?$/.test(t) ? parseFloat(t) : NaN
      if (Number.isNaN(n)) return false
      return numsOf(r).some((v) => v >= n * 0.9 && v <= n * 1.1)   // ±10% (TARSHID tolerance)
    }
    let list = tokens.length ? rows.filter((r) => tokens.every((t) => tokenHit(r, t))) : [...rows]
    const ref = refValue != null && String(refValue).trim() !== '' ? parseFloat(toLatin(String(refValue))) : NaN
    if (!Number.isNaN(ref)) {
      list.sort((a, b) => {
        const va = a.tr == null ? null : Number(a.tr), vb = b.tr == null ? null : Number(b.tr)
        const da = va == null ? Infinity : Math.abs(va - ref), db = vb == null ? Infinity : Math.abs(vb - ref)
        const ba = da <= ref * 0.1 ? 0 : 1, bb = db <= ref * 0.1 ? 0 : 1
        return ba - bb || da - db || String(a.model_no || '').localeCompare(String(b.model_no || ''))
      })
    } else if (!tokens.length) {
      // representative default: round-robin one row per size category, so the
      // list never looks like "only 1.5 TR exists"
      const groups = new Map()
      list.forEach((r) => {
        const k = r.size_category || ''
        if (!groups.has(k)) groups.set(k, [])
        groups.get(k).push(r)
      })
      const rr = []
      const buckets = [...groups.values()]
      for (let i = 0; rr.length < Math.min(10, list.length); i++) {
        const b = buckets[i % buckets.length]
        const item = b[Math.floor(i / buckets.length)]
        if (item) rr.push(item)
        if (i > buckets.length * 10) break
      }
      list = rr
    }
    return list.slice(0, 10)
  }, [rows, q, refValue])

  const byAi = value && matchSource === 'ai'
  return (
    <div style={{ minWidth: 0, marginBottom: 14 }}>
      <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>
        Old unit — registry model{' '}
        <span style={{ color: value ? 'var(--ok)' : '#B45309', textTransform: 'none', letterSpacing: 0 }}>
          {value ? (byAi ? `· matched by the assistant${matchConfidence ? ` (${num(Math.round(Number(matchConfidence) * 100))}%)` : ''}` : '· matched') : '· needs matching'}
        </span>
      </span>
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--line)', borderRadius: 8, padding: '7px 10px', background: '#E9F3EE' }} title={matched ? titleOf(matched) : ''}>
          <span lang="en" dir="ltr" style={{ fontSize: 12.5, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {matched ? labelOf(matched) : loading ? 'Loading the registry…' : 'Linked model is no longer in the registry'}
          </span>
          <button type="button" onClick={() => { onClear(); setQ('') }} style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: 'var(--bad)', background: 'none', flex: 'none' }}>Change</button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <input lang="en" style={control} value={q} disabled={loading}
            placeholder={loading ? 'Loading the registry…' : rows.length ? 'Search make, model or tonnage — e.g. Gree, GWC, 2 TR…' : 'The old-model registry is empty — import it in Settings'}
            onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
          {open && !loading && (matches.length > 0 || q.trim() !== '') && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 4, background: '#fff', border: '1px solid var(--line)', borderRadius: 8, boxShadow: '0 10px 28px rgba(16,26,36,.14)', overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
              {matches.length > 0 ? matches.map((r) => (
                <button key={r.id} type="button" title={titleOf(r)} onMouseDown={(e) => { e.preventDefault(); onPick(r); setOpen(false); setQ('') }}
                  className="ies-row-hover" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', fontSize: 12, background: 'none', cursor: 'pointer' }}>
                  <span lang="en" dir="ltr">{labelOf(r)}</span>
                </button>
              )) : (
                <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-3)' }}>
                  Not in the registry — leave it unmatched, type the make and model, and photograph the nameplate.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// What the platform concluded from the match — shown, never typed. These are
// the workbook's T/U/V columns (T1 BTU, T1 EER, Equivalent SEER); saying WHERE
// the baseline came from is the whole point, because an unmatched row silently
// using the assumed factor is what made every savings number wrong.
function DerivedEquivalent({ matched, btu, loading, linked }) {
  const cells = [
    ['Equivalent SEER', matched?.equivalent_seer],
    ['T1 BTU', btu],
    ['T1 EER', matched?.t1_eer],
  ]
  return (
    <div style={{ marginBottom: 14, border: '1px solid var(--line)', borderRadius: 8, padding: '9px 11px', background: matched ? '#F7FAF8' : 'var(--bg)' }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {cells.map(([l, v]) => (
          <div key={l} style={{ minWidth: 84 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--text-3)' }}>{l}</div>
            <div lang="en" dir="ltr" style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700 }}>{v == null ? '—' : num(v)}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10.5, marginTop: 5, color: matched ? '#1D6A49' : '#B45309' }}>
        {loading && linked ? 'Reading the registry…'
          : matched ? 'Derived from the registry match — the baseline uses this real nameplate efficiency.'
            : 'No registry match: the baseline will fall back to the assumed old-efficiency factor and the row stays flagged until it is matched.'}
      </div>
    </div>
  )
}

function NumField({ label, v, on, help }) {
  return (
    <div style={{ minWidth: 0 }}>
      <Field label={label}>
        <input style={control} type="text" inputMode="decimal" lang="en" dir="ltr" value={v ?? ''} onChange={(e) => on(numFilter(e.target.value))} />
        {help && <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-3)', marginTop: 4 }}>{help}</span>}
      </Field>
    </div>
  )
}

function PhotoSlot({ label, path, buildingId, onPath, required }) {
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState('')
  const cur = useRef(path)
  cur.current = path
  useEffect(() => { let live = true; if (path) signedUrlFor('daily-progress-photos', path).then((u) => { if (live) setUrl(u || '') }); else setUrl(''); return () => { live = false } }, [path])

  const onFiles = async (file) => {
    if (!file) return
    if (!buildingId) { toast('Pick a building first', 'err'); return }
    setBusy(true)
    const blob = await compressImage(file, { maxBytes: 500000 }).catch(() => file)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const key = `survey/${buildingId}/${crypto.randomUUID()}.${ext}`
    const { path: p, error } = await uploadToBucket(PHOTO_BUCKET, blob, { userId: undefined, key })
    setBusy(false)
    if (error || !p) { toast("Photo upload failed" + (error ? ' — ' + error.message : ''), 'err'); return }
    onPath(p)
  }

  return (
    <div style={{ minWidth: 0, marginBottom: 14 }}>
      <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase', color: required && !path ? '#B45309' : 'var(--text-3)', marginBottom: 6 }}>{label}</span>
      {path ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {url ? <img src={url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }} /> : <span style={{ fontSize: 11, color: 'var(--text-3)' }}>attached</span>}
          <button onClick={() => onPath('')} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--bad)', background: 'none' }}>Remove</button>
        </div>
      ) : (
        <FileDropZone compact accept="image/*" maxSizeMb={25} label={busy ? 'Uploading…' : 'Add photo'} onFiles={onFiles} />
      )}
    </div>
  )
}
