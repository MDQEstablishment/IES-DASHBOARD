import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useLiveQuery, uploadToBucket, signedUrlFor } from '../../lib/db'
import { num, roomKey } from '../../lib/format'
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
            <CatalogPicker category={form.category} value={form.catalog_item_id} onChange={(id) => set('catalog_item_id', id)}
              refValue={isAc ? form.tr : form.wattage} />
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
// Stores the catalog row id (the approved REPLACEMENT unit — savings engine
// input); free-text make/model below stay as the fallback description.
// Search is TOKENIZED and numeric-aware: '2 TR' / '2TR' / '2' match items
// whose TR (lighting: wattage) is within ±10% — the same tolerance TARSHID
// uses — because the stored sheet strings don't contain '2 TR' verbatim.
// Default list ranks by proximity to the entry's own TR/wattage, or shows a
// representative sample across size categories, never raw import order.
const UNIT_WORDS = new Set(['tr', 'w', 'watt', 'watts', 'seer', 'ton', 'tons', 'hrs'])
function CatalogPicker({ category, value, onChange, refValue }) {
  const table = category === 'ac' ? 'ac_catalog' : 'lighting_catalog'
  const { rows } = useLiveQuery(table, (q) => q.select('*').eq('is_active', true).order('sr_no', { nullsFirst: false }), [table])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)

  const labelOf = (r) => category === 'ac'
    ? [r.equipment_type, r.capacity_tr != null ? `${num(r.capacity_tr)} TR` : null, r.make, r.model,
       r.seer != null ? `SEER ${num(r.seer)}` : r.ieer != null ? `IEER ${num(r.ieer)}` : null].filter(Boolean).join(' · ')
    : [r.lamp_type, r.wattage_w != null ? `${num(r.wattage_w)} W` : null, r.brand, r.model].filter(Boolean).join(' · ')
  const titleOf = (r) => category === 'ac'
    ? [r.size_category, r.description].filter(Boolean).join(' — ')
    : [r.shape_size_base, r.dimensions].filter(Boolean).join(' — ')

  const chosen = value ? rows.find((r) => r.id === value) : null

  const matches = useMemo(() => {
    const norm = (s) => toLatin(String(s ?? '')).toLowerCase()
    const hayOf = (r) => norm((category === 'ac'
      ? [r.description, r.model, r.make, r.size_category, r.equipment_type]
      : [r.lamp_type, r.model, r.brand, r.shape_size_base]).filter(Boolean).join(' '))
    const numsOf = (r) => (category === 'ac' ? [r.capacity_tr, r.seer, r.ieer] : [r.wattage_w])
      .filter((v) => v != null).map(Number)
    // tokens: split, strip standalone unit words, peel unit suffixes ('2tr' -> '2')
    const tokens = norm(q).split(/\s+/).filter(Boolean)
      .filter((t) => !UNIT_WORDS.has(t))
      .map((t) => { const m = /^(\d+(?:\.\d+)?)(tr|w|watts?|seer|tons?)$/.exec(t); return m ? m[1] : t })
    const tokenHit = (r, t) => {
      if (hayOf(r).includes(t)) return true
      const n = /^\d+(?:\.\d+)?$/.test(t) ? parseFloat(t) : NaN
      if (Number.isNaN(n)) return false
      return numsOf(r).some((v) => v >= n * 0.9 && v <= n * 1.1)   // ±10% (TARSHID tolerance)
    }
    let list = tokens.length ? rows.filter((r) => tokens.every((t) => tokenHit(r, t))) : [...rows]
    // rank by proximity to the entry's own TR / wattage when it's filled
    const ref = refValue != null && String(refValue).trim() !== '' ? parseFloat(toLatin(String(refValue))) : NaN
    const sizeOf = (r) => (category === 'ac' ? r.capacity_tr : r.wattage_w)
    if (!Number.isNaN(ref)) {
      list.sort((a, b) => {
        const va = sizeOf(a), vb = sizeOf(b)
        const da = va == null ? Infinity : Math.abs(va - ref), db = vb == null ? Infinity : Math.abs(vb - ref)
        const ba = da <= ref * 0.1 ? 0 : 1, bb = db <= ref * 0.1 ? 0 : 1
        return ba - bb || da - db || (a.sr_no || 0) - (b.sr_no || 0)
      })
    } else if (!tokens.length) {
      // representative default: round-robin one item per size category / lamp
      // type, so the list never looks like "only 1.5 TR exists"
      const groups = new Map()
      list.forEach((r) => {
        const k = category === 'ac' ? (r.size_category || '') : (r.lamp_type || '')
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, category, refValue])

  return (
    <div style={{ minWidth: 0, marginBottom: 14 }}>
      <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>
        Approved replacement (catalog){' '}
        <span style={{ color: value ? 'var(--ok)' : '#B45309', textTransform: 'none', letterSpacing: 0 }}>{value ? '· linked' : '· needed for savings estimate'}</span>
      </span>
      {chosen ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--line)', borderRadius: 8, padding: '7px 10px', background: '#F5EEDF' }} title={titleOf(chosen)}>
          <span lang="en" dir="ltr" style={{ fontSize: 12.5, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelOf(chosen)}</span>
          <button type="button" onClick={() => { onChange(''); setQ('') }} style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: 'var(--bad)', background: 'none', flex: 'none' }}>Remove</button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <input lang="en" style={control} value={q} placeholder={category === 'ac' ? 'Search make, model or tonnage — e.g. Split, Zamil, 2 TR…' : 'Search type, brand or wattage — e.g. LED, Philips, 18…'}
            onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
          {open && (matches.length > 0 || q.trim() !== '') && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 4, background: '#fff', border: '1px solid var(--line)', borderRadius: 8, boxShadow: '0 10px 28px rgba(16,26,36,.14)', overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
              {matches.length > 0 ? matches.map((r) => (
                <button key={r.id} type="button" title={titleOf(r)} onMouseDown={(e) => { e.preventDefault(); onChange(r.id); setOpen(false) }}
                  className="ies-row-hover" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', fontSize: 12, background: 'none', cursor: 'pointer' }}>
                  <span lang="en" dir="ltr">{labelOf(r)}</span>
                </button>
              )) : (
                <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-3)' }}>
                  No match — try make, model, or {category === 'ac' ? 'tonnage (e.g. Split, Zamil, 2)' : 'wattage (e.g. LED, Philips, 18)'}.
                </div>
              )}
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
