import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useLiveQuery, uploadToBucket, signedUrlFor } from '../../lib/db'
import { num } from '../../lib/format'
import { compressImage } from '../../lib/image'
import { Modal, Btn, Field, inputStyle } from '../ui'
import { toast } from '../../lib/toast'
import { SURVEY_CATEGORIES } from '../../lib/constants'
import FileDropZone from '../FileDropZone'

const PHOTO_BUCKET = 'daily-progress-photos'
const control = { ...inputStyle, boxSizing: 'border-box', width: '100%', maxWidth: '100%' }

// Latin-digit enforcement (same rule as 9A-fix): map Arabic-Indic/Persian -> Latin, strip the rest.
const toLatin = (s) => String(s).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660).replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06F0)
const numFilter = (s) => toLatin(s).replace(/[^\d.-]/g, '')
const ROOM_TYPES = ['Office', 'Corridor', 'Toilet', 'Meeting Room', 'Lobby', 'Reception', 'Ward', 'Clinic', 'Laboratory', 'Warehouse', 'Kitchen', 'Electrical Room', 'Staircase', 'Parking', 'Outdoor']

// numeric field keys and the int field
const NUMF = ['room_width', 'room_height', 'room_area', 'tr', 'wattage', 'age_years']

export default function SurveyEntryForm({ project, buildings, row, onClose, onSaved }) {
  const isNew = !row?.id
  const blank = () => ({
    building_id: row?.building_id || (buildings[0]?.id ?? ''), floor: row?.floor || '', room_name: row?.room_name || '',
    room_type: row?.room_type || '', room_width: row?.room_width ?? '', room_height: row?.room_height ?? '', room_area: row?.room_area ?? '',
    category: row?.category || 'lighting', catalog_item_id: row?.catalog_item_id || '',
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

  const isAc = form.category === 'ac'
  const isLight = form.category === 'lighting'
  const m2ton = isAc && form.room_area && form.tr && form.qty ? Math.round((parseFloat(form.room_area) / (parseFloat(form.tr) * parseInt(form.qty, 10))) * 100) / 100 : null

  const payload = () => {
    const p = { project_id: project.id, building_id: form.building_id, floor: form.floor || null, room_name: form.room_name || null,
      room_type: form.room_type || null, category: form.category,
      // catalog link = the approved REPLACEMENT; only lighting/ac catalogs exist (DB-enforced)
      catalog_item_id: (isAc || isLight) && form.catalog_item_id ? form.catalog_item_id : null,
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
      setForm((p) => ({ ...p, catalog_item_id: '', equipment_type: '', make: '', model: '', size_category: '', tr: '', wattage: '', qty: 1, inverter: false, age_years: '', remarks: '', photo_nameplate_path: '', photo_indoor_path: '' }))
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
        <Field label="Room name"><input style={control} value={form.room_name} onChange={(e) => set('room_name', e.target.value)} /></Field>
        <Field label="Room type">
          <input style={control} list="survey-room-types" value={form.room_type} onChange={(e) => set('room_type', e.target.value)} />
          <datalist id="survey-room-types">{ROOM_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
        <NumField label="Width (m)" v={form.room_width} on={(v) => set('room_width', v)} />
        <NumField label="Height (m)" v={form.room_height} on={(v) => set('room_height', v)} />
        <NumField label="Area (m²)" v={form.room_area} on={(v) => { setAreaTouched(true); set('room_area', v) }} help={!areaTouched ? 'auto = W × H' : undefined} />
        {isAc && <Field label="m² / Ton"><input style={{ ...control, background: 'var(--bg)' }} value={m2ton ?? '—'} readOnly /></Field>}
      </div>

      {/* OLD UNIT */}
      <SectionLabel>Old unit</SectionLabel>
      <div style={grid}>
        <Field label="Category *">
          {/* switching category invalidates the catalog link (per-category catalogs) */}
          <select style={control} value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value, catalog_item_id: '' }))}>
            {SURVEY_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        {(isAc || isLight) && (
          <div style={{ minWidth: 0, gridColumn: '1 / -1' }}>
            <CatalogPicker category={form.category} value={form.catalog_item_id} onChange={(id) => set('catalog_item_id', id)} />
          </div>
        )}
        <Field label="Equipment type"><input style={control} value={form.equipment_type} onChange={(e) => set('equipment_type', e.target.value)} /></Field>
        <Field label="Make"><input style={control} value={form.make} onChange={(e) => set('make', e.target.value)} /></Field>
        <Field label="Model"><input style={control} value={form.model} onChange={(e) => set('model', e.target.value)} /></Field>
        <Field label="Size category"><input style={control} value={form.size_category} onChange={(e) => set('size_category', e.target.value)} /></Field>
        {isAc && <NumField label="TR (tonnage)" v={form.tr} on={(v) => set('tr', v)} />}
        {isLight && <NumField label="Wattage (W)" v={form.wattage} on={(v) => set('wattage', v)} />}
        <NumField label="Qty" v={form.qty} on={(v) => set('qty', v)} />
        <NumField label="Age (years)" v={form.age_years} on={(v) => set('age_years', v)} />
        {isAc && (
          <div style={{ minWidth: 0, gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!form.inverter} onChange={(e) => set('inverter', e.target.checked)} /> Inverter unit
            </label>
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
        <PhotoSlot label="Nameplate" path={form.photo_nameplate_path} buildingId={form.building_id} onPath={(p) => set('photo_nameplate_path', p)} />
      </div>
    </Modal>
  )
}

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0 14px' }
const SectionLabel = ({ children }) => <div style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-3)', margin: '4px 0 8px' }}>{children}</div>

// Searchable, category-filtered picker over the TARSHID-approved catalogs.
// Stores the catalog row id (the approved REPLACEMENT unit — 9C savings
// engine input); free-text make/model below stay as the fallback description.
function CatalogPicker({ category, value, onChange }) {
  const table = category === 'ac' ? 'ac_catalog' : 'lighting_catalog'
  const { rows } = useLiveQuery(table, (q) => q.select('*').eq('is_active', true).order('sr_no', { nullsFirst: false }), [table])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)

  const labelOf = (r) => category === 'ac'
    ? [r.size_category, r.make, r.model, r.capacity_tr != null ? `${num(r.capacity_tr)} TR` : null, r.seer != null ? `SEER ${num(r.seer)}` : r.ieer != null ? `IEER ${num(r.ieer)}` : null].filter(Boolean).join(' · ')
    : [r.lamp_type, r.model, r.brand, r.wattage_w != null ? `${num(r.wattage_w)} W` : null].filter(Boolean).join(' · ')
  const hayOf = (r) => (category === 'ac'
    ? [r.description, r.model, r.make, r.size_category, r.equipment_type]
    : [r.lamp_type, r.model, r.brand, r.shape_size_base]).filter(Boolean).join(' ').toLowerCase()

  const chosen = value ? rows.find((r) => r.id === value) : null
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = s ? rows.filter((r) => hayOf(r).includes(s)) : rows
    return list.slice(0, 8)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, category])

  return (
    <div style={{ minWidth: 0, marginBottom: 14 }}>
      <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>
        Approved replacement (catalog){' '}
        <span style={{ color: value ? 'var(--ok)' : '#B45309', textTransform: 'none', letterSpacing: 0 }}>{value ? '· linked' : '· needed for savings estimate'}</span>
      </span>
      {chosen ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--line)', borderRadius: 8, padding: '7px 10px', background: '#F5EEDF' }}>
          <span lang="en" dir="ltr" style={{ fontSize: 12.5, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelOf(chosen)}</span>
          <button type="button" onClick={() => { onChange(''); setQ('') }} style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: 'var(--bad)', background: 'none', flex: 'none' }}>Remove</button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <input lang="en" style={control} value={q} placeholder={`Search the approved ${category === 'ac' ? 'AC & Package' : 'lighting'} catalog…`}
            onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
          {open && matches.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 4, background: '#fff', border: '1px solid var(--line)', borderRadius: 8, boxShadow: '0 10px 28px rgba(16,26,36,.14)', overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
              {matches.map((r) => (
                <button key={r.id} type="button" onMouseDown={(e) => { e.preventDefault(); onChange(r.id); setOpen(false) }}
                  className="ies-row-hover" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', fontSize: 12, background: 'none', cursor: 'pointer' }}>
                  <span lang="en" dir="ltr">{labelOf(r)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
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

function PhotoSlot({ label, path, buildingId, onPath }) {
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
      <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>{label}</span>
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
