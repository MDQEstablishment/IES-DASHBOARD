import { useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../rbac'
import { useLiveQuery } from '../lib/db'
import { Btn, Modal, Field, inputStyle, Loading, Empty } from './ui'
import Icon from './Icon'
import { toast } from '../lib/toast'

// Sprint 9A — TARSHID-approved equipment catalogs (from the MOH-H DIP TDS).
// Three global reference tables surfaced as a Settings panel. Everyone reads;
// only admin/pmo write (enforced server-side; the write UI is gated to match).
// The Saving Sheet (9C) will consume these rows by id — retire is soft
// (is_active=false), never hard delete, so those references stay valid.

const PAGE_SIZE = 100

const YESNO = [['all', 'All'], ['yes', 'Yes'], ['no', 'No']]
const CH_OPTS = [['cooling_only', 'Cooling only'], ['cooling_heating', 'Cooling & heating']]

// Each catalog is fully described by config: how to search it, filter it, which
// columns the dense table shows, and which fields the add/edit modal renders.
const CATALOGS = {
  lighting: {
    label: 'Lighting',
    table: 'lighting_catalog',
    search: (r) => [r.lamp_type, r.model, r.brand, r.shape_size_base].filter(Boolean).join(' ').toLowerCase(),
    filters: [
      { key: 'lamp_type', label: 'Lamp type', distinct: true },
      { key: 'brand', label: 'Brand', distinct: true },
      { key: 'mandatory', label: 'Mandatory', bool: true },
      { key: 'local', label: 'Local', bool: true },
    ],
    // Column diet (post-9C overflow fix, measured): `max` caps a text column
    // with ellipsis + title tooltip, `tight` narrows numeric padding,
    // `hideIfEmpty` drops the column when no row on the page has a value.
    columns: [
      { key: 'sr_no', label: 'SR', mono: true, tight: true },
      { key: 'lamp_type', label: 'LAMP TYPE', bold: true, max: 180 },
      { key: 'model', label: 'MODEL', max: 130 },
      { key: 'brand', label: 'BRAND', max: 110 },
      { key: 'shape_size_base', label: 'SHAPE/SIZE/BASE', max: 150 },
      { key: 'dimensions', label: 'DIMENSIONS', max: 110 },
      { key: 'wattage_w', label: 'W', mono: true, num: true, tight: true },
      { key: 'lumens_lm', label: 'LUMENS', mono: true, num: true, tight: true },
      { key: 'cct_k', label: 'CCT', mono: true, tight: true },
      { key: 'life_hours', label: 'LIFE (H)', mono: true, num: true, tight: true },
      { key: 'operating_v', label: 'V', mono: true, tight: true, hideIfEmpty: true },
      { key: 'mandatory', label: 'MAND.', chip: true },
      { key: 'local', label: 'LOCAL', chip: true },
    ],
    fields: [
      { key: 'lamp_type', label: 'Lamp type', required: true },
      { key: 'model', label: 'Model' },
      { key: 'brand', label: 'Brand' },
      { key: 'shape_size_base', label: 'Shape / size / base' },
      { key: 'dimensions', label: 'Dimensions (L/W/Dia)' },
      { key: 'wattage_w', label: 'Wattage (W)', num: true },
      { key: 'lumens_lm', label: 'Lumens (lm)', num: true },
      { key: 'cct_k', label: 'CCT (K)' },
      { key: 'life_hours', label: 'Life hours', int: true },
      { key: 'operating_v', label: 'Operating V' },
      { key: 'mandatory', label: 'On mandatory list', bool: true },
      { key: 'local', label: 'Local', bool: true },
    ],
  },
  ac: {
    label: 'AC & Package',
    table: 'ac_catalog',
    search: (r) => [r.description, r.model, r.make, r.equipment_type].filter(Boolean).join(' ').toLowerCase(),
    filters: [
      { key: 'size_category', label: 'Size category', distinct: true },
      { key: 'make', label: 'Make', distinct: true },
      { key: 'ch_mode', label: 'C&H', options: CH_OPTS },
      { key: 'mandatory', label: 'Mandatory', bool: true },
      { key: 'local', label: 'Local', bool: true },
    ],
    // Measured blowout drivers were SIZE CATEGORY (332px — 51-char repeated
    // strings) and MODEL (288px): both now ellipsized with tooltips. IEER +
    // VOLTAGE hide when the visible page has none (all window/split pages).
    columns: [
      { key: 'sr_no', label: 'SR', mono: true, tight: true },
      { key: 'description', label: 'DESCRIPTION', bold: true, max: 200 },
      { key: 'equipment_type', label: 'TYPE' },
      { key: 'model', label: 'MODEL (ID/OD)', max: 140 },
      { key: 'make', label: 'MAKE', max: 100 },
      { key: 'size_category', label: 'SIZE CATEGORY', max: 150 },
      { key: 'capacity_btu', label: 'BTU', mono: true, num: true, tight: true },
      { key: 'capacity_tr', label: 'TR', mono: true, num: true, tight: true },
      { key: 'seer', label: 'SEER', mono: true, num: true, tight: true },
      { key: 'ieer', label: 'IEER', mono: true, num: true, tight: true, hideIfEmpty: true },
      { key: 'voltage_class', label: 'VOLTAGE', tight: true, hideIfEmpty: true },
      { key: 'ch_mode', label: 'C&H', render: (v) => v === 'cooling_heating' ? 'C&H' : v === 'cooling_only' ? 'Cooling' : '—' },
      { key: 'mandatory', label: 'MAND.', chip: true },
      { key: 'local', label: 'LOCAL', chip: true },
    ],
    fields: [
      { key: 'description', label: 'Description', required: true, help: 'The TDS description — kept verbatim for the saving sheet.' },
      { key: 'equipment_type', label: 'Equipment type' },
      { key: 'model', label: 'Model (ID/OD)' },
      { key: 'make', label: 'Make' },
      { key: 'size_category', label: 'Size category', required: true, help: 'e.g. "1.5 TR Split-Wall" or "Package Unit".' },
      { key: 'capacity_btu', label: 'Capacity (BTU)', int: true },
      { key: 'capacity_tr', label: 'Capacity (TR)', num: true },
      { key: 'seer', label: 'SEER', num: true },
      { key: 'ieer', label: 'IEER (package units)', num: true },
      { key: 'voltage_class', label: 'Voltage class' },
      { key: 'ch_mode', label: 'Cooling / heating', select: CH_OPTS },
      { key: 'mandatory', label: 'On mandatory list', bool: true },
      { key: 'local', label: 'Local', bool: true },
    ],
    // A row must carry SEER or IEER (matches the DB check constraint).
    validate: (v) => (v.seer == null && v.ieer == null) ? 'Enter SEER or IEER (at least one is required).' : null,
  },
  // Misc = physical consumables/accessories only. NOTE: the TDS "Lights Live
  // Stock / 2% from each type" entry is a spare-stock RULE, not a material, so it
  // is intentionally excluded here — that stocking rule belongs to warehouse/BOQ
  // logic in a later sprint, not this catalog. (9A-fix)
  misc: {
    label: 'Misc',
    table: 'misc_catalog',
    search: (r) => [r.item, r.notes, r.unit].filter(Boolean).join(' ').toLowerCase(),
    filters: [],
    columns: [
      { key: 'sr_no', label: 'SR', mono: true },
      { key: 'item', label: 'ITEM', bold: true },
      { key: 'unit', label: 'UNIT', mono: true },
      { key: 'default_qty_rule', label: 'DEFAULT QTY RULE' },
      { key: 'notes', label: 'NOTES' },
    ],
    fields: [
      { key: 'item', label: 'Item', required: true },
      { key: 'unit', label: 'Unit', required: true },
      { key: 'default_qty_rule', label: 'Default qty rule', help: 'e.g. "2% from each type". Actual quantities live in the project BOQ.' },
      { key: 'notes', label: 'Notes' },
    ],
  },
}

// Form control that never exceeds its grid cell (border-box + full width).
const fieldControl = { ...inputStyle, boxSizing: 'border-box', width: '100%', maxWidth: '100%' }

const chipStyle = (on) => ({ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
  color: on ? '#A0762B' : '#A39D8E', background: on ? '#F5EEDF' : '#F0EDE4' })

// Latin/Western digits are mandatory in these catalogs (9A-fix). Number inputs
// and toLocaleString() otherwise render Arabic-Indic numerals on ar-locale OS —
// same class of bug the 8X DateInput fix solved. Pin en-US for display, and
// coerce any Arabic-Indic/Persian digits the user types back to Latin.
const num = (v) => v == null || v === '' ? '—' : Number(v).toLocaleString('en-US')
const toLatinDigits = (s) => String(s)
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
const numFilter = (s) => toLatinDigits(s).replace(/[^\d.-]/g, '')

export default function EquipmentCatalogs({ role }) {
  const canWrite = ['admin', 'pmo'].includes(role)
  const [tab, setTab] = useState('lighting')

  const lighting = useLiveQuery('lighting_catalog', (q) => q.select('*').order('sr_no', { nullsFirst: false }))
  const ac = useLiveQuery('ac_catalog', (q) => q.select('*').order('sr_no', { nullsFirst: false }))
  const misc = useLiveQuery('misc_catalog', (q) => q.select('*').order('sr_no', { nullsFirst: false }))
  const data = { lighting, ac, misc }

  const cfg = CATALOGS[tab]
  const active = data[tab]
  const activeCount = (d) => d.rows.filter((r) => r.is_active).length

  return (
    // overflow:hidden — the card is the hard clip boundary; the table's own
    // .ies-table-wrap scrolls inside it (visible scrollbar via index.css).
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16, overflow: 'hidden' }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Approved Equipment</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>
        TARSHID-approved equipment from the technical data sheet. These catalogs feed the saving sheet — retiring an item hides it from new selections without breaking past references.{!canWrite && ' Editing is limited to PMO and admins.'}
      </div>

      {/* Sub-tab chips with live active counts */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {Object.entries(CATALOGS).map(([key, c]) => {
          const on = tab === key
          return (
            <button key={key} onClick={() => setTab(key)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 8, fontSize: 12.5, fontWeight: 700,
              border: '1px solid ' + (on ? 'var(--accent)' : 'var(--line)'), background: on ? '#F5EEDF' : '#fff', color: on ? 'var(--accent)' : 'var(--text-3)',
            }}>
              {c.label}
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: on ? '#EFE3C8' : 'var(--bg)', color: on ? '#A0762B' : 'var(--text-3)' }}>
                {data[key].loading ? '·' : activeCount(data[key])}
              </span>
            </button>
          )
        })}
      </div>

      <CatalogTab key={tab} cfg={cfg} state={active} canWrite={canWrite} />
    </div>
  )
}

function CatalogTab({ cfg, state, canWrite }) {
  const { user } = useAuth()
  const { rows, loading, refetch } = state
  const [search, setSearch] = useState('')
  const [showRetired, setShowRetired] = useState(false)
  const [filters, setFilters] = useState({})
  const [page, setPage] = useState(0)
  const [editing, setEditing] = useState(null)     // row object, or {} for a new item
  const [retiring, setRetiring] = useState(null)

  // Distinct values for select filters, from the currently loaded rows.
  const distinct = useMemo(() => {
    const out = {}
    cfg.filters.filter((f) => f.distinct).forEach((f) => {
      out[f.key] = [...new Set(rows.map((r) => r[f.key]).filter(Boolean))].sort()
    })
    return out
  }, [rows, cfg])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (!showRetired && !r.is_active) return false
      if (s && !cfg.search(r).includes(s)) return false
      for (const f of cfg.filters) {
        const val = filters[f.key]
        if (!val || val === 'all') continue
        if (f.bool) { if ((val === 'yes') !== !!r[f.key]) return false }
        else if (r[f.key] !== val) return false
      }
      return true
    })
  }, [rows, search, showRetired, filters, cfg])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, pageCount - 1)
  const pageRows = filtered.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE)
  // hideIfEmpty columns (IEER/VOLTAGE/V) drop when no row on the CURRENT page
  // has a value — they were all dashes and pure width on most pages.
  const visCols = cfg.columns.filter((c) => !c.hideIfEmpty || pageRows.some((r) => r[c.key] != null && String(r[c.key]).trim() !== ''))

  const resetPage = (fn) => (...a) => { fn(...a); setPage(0) }

  return (
    <div>
      {/* Toolbar: search + filters + show-retired + add */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }}><Icon name="search" size={15} /></span>
          <input value={search} onChange={resetPage((e) => setSearch(e.target.value))} placeholder={`Search ${cfg.label.toLowerCase()}…`}
            style={{ ...inputStyle, paddingLeft: 32 }} />
        </div>
        {cfg.filters.map((f) => (
          <select key={f.key} value={filters[f.key] || 'all'} onChange={resetPage((e) => setFilters((p) => ({ ...p, [f.key]: e.target.value })))}
            style={{ ...inputStyle, width: 'auto', minWidth: 130, flex: '0 0 auto' }}>
            {f.bool ? YESNO.map(([v, l]) => <option key={v} value={v}>{v === 'all' ? `${f.label}: all` : l}</option>)
              : <>
                  <option value="all">{f.label}: all</option>
                  {(f.options || (distinct[f.key] || []).map((v) => [v, v])).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </>}
          </select>
        ))}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap', cursor: 'pointer' }}>
          <input type="checkbox" checked={showRetired} onChange={resetPage((e) => setShowRetired(e.target.checked))} />
          Show retired
        </label>
        {canWrite && <Btn variant="primary" icon="plus" onClick={() => setEditing({})}>Add item</Btn>}
      </div>

      {loading ? <Loading /> : filtered.length === 0 ? (
        <Empty icon="box">{rows.length === 0 ? `No ${cfg.label.toLowerCase()} items yet.` : 'No items match these filters.'}</Empty>
      ) : (
        <>
          <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 640 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
              {visCols.map((c) => <th key={c.key} style={{ padding: c.tight ? '8px 5px' : '8px 7px', fontWeight: 600, whiteSpace: 'nowrap', textAlign: c.num ? 'right' : 'left' }}>{c.label}</th>)}
              {canWrite && <th style={{ padding: '8px 7px', fontWeight: 600, textAlign: 'right' }}>ACTIONS</th>}
            </tr></thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--line)', opacity: r.is_active ? 1 : 0.5 }}>
                  {visCols.map((c) => (
                    <td key={c.key} title={c.max && r[c.key] ? String(r[c.key]) : undefined}
                      style={{ padding: c.tight ? '8px 5px' : '8px 7px', textAlign: c.num ? 'right' : 'left', fontFamily: c.mono ? 'var(--mono)' : undefined,
                        fontSize: c.mono ? 11 : 12.5, fontWeight: c.bold ? 600 : undefined, color: c.bold ? 'var(--text)' : 'var(--text-2)',
                        whiteSpace: c.bold ? 'normal' : 'nowrap',
                        ...(c.max ? { maxWidth: c.max, overflow: 'hidden', textOverflow: 'ellipsis' } : {}) }}>
                      {c.chip ? <span style={chipStyle(!!r[c.key])}>{r[c.key] ? 'Yes' : 'No'}</span>
                        : c.render ? c.render(r[c.key], r)
                        : c.num ? num(r[c.key])
                        : (r[c.key] ?? '—') || '—'}
                    </td>
                  ))}
                  {canWrite && (
                    <td style={{ padding: '8px 7px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="ies-hover" onClick={() => setEditing(r)} title="Edit"
                        style={{ padding: 5, borderRadius: 6, color: 'var(--text-3)' }}><Icon name="edit" size={14} /></button>
                      <button className="ies-hover" onClick={() => setRetiring(r)} title={r.is_active ? 'Retire' : 'Restore'}
                        style={{ padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, color: r.is_active ? 'var(--bad)' : 'var(--good, #1D6A49)' }}>
                        {r.is_active ? 'Retire' : 'Restore'}</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table></div>

          {/* Count + pagination footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>
              {filtered.length} item{filtered.length === 1 ? '' : 's'}{showRetired ? ' (incl. retired)' : ''} · showing {pageSafe * PAGE_SIZE + 1}–{Math.min(filtered.length, (pageSafe + 1) * PAGE_SIZE)}
            </span>
            {pageCount > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Btn variant="ghost" disabled={pageSafe === 0} onClick={() => setPage(pageSafe - 1)}>Prev</Btn>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>{pageSafe + 1} / {pageCount}</span>
                <Btn variant="ghost" disabled={pageSafe >= pageCount - 1} onClick={() => setPage(pageSafe + 1)}>Next</Btn>
              </div>
            )}
          </div>
        </>
      )}

      {editing && <CatalogFormModal cfg={cfg} row={editing} userId={user?.id} onClose={() => setEditing(null)} onDone={() => { setEditing(null); refetch() }} />}
      {retiring && <RetireModal cfg={cfg} row={retiring} onClose={() => setRetiring(null)} onDone={() => { setRetiring(null); refetch() }} />}
    </div>
  )
}

function CatalogFormModal({ cfg, row, userId, onClose, onDone }) {
  const isNew = !row.id
  const [form, setForm] = useState(() => {
    const init = {}
    cfg.fields.forEach((f) => { init[f.key] = row[f.key] ?? (f.bool ? false : '') })
    return init
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const save = async () => {
    // Required fields
    for (const f of cfg.fields) {
      if (f.required && !String(form[f.key] ?? '').trim()) { toast(`${f.label} is required`, 'err'); return }
    }
    // Coerce numeric/int fields; empty -> null
    const payload = {}
    cfg.fields.forEach((f) => {
      let v = form[f.key]
      if (f.bool) v = !!v
      else if (f.num || f.int) v = v === '' || v == null ? null : (f.int ? parseInt(v, 10) : parseFloat(v))
      else v = v === '' ? null : v
      payload[f.key] = v
    })
    const err = cfg.validate?.(payload)
    if (err) { toast(err, 'err'); return }

    setBusy(true)
    if (isNew) {
      const { error } = await supabase.from(cfg.table).insert({ ...payload, created_by: userId })
      if (error) { setBusy(false); toast("Couldn't add — " + error.message, 'err'); return }
      toast(`${cfg.label} item added`)
    } else {
      // .select() so an RLS/no-row no-op errors instead of a false "Changes saved".
      const { data, error } = await supabase.from(cfg.table).update({ ...payload, updated_at: new Date().toISOString() }).eq('id', row.id).select('id')
      if (error) { setBusy(false); toast("Couldn't save — " + error.message, 'err'); return }
      if (!data || data.length === 0) { setBusy(false); toast("Couldn't save — item not found or no permission (admin/PMO only)", 'err'); return }
      toast('Changes saved')
    }
    setBusy(false)
    onDone()
  }

  return (
    <Modal open width={560} title={`${isNew ? 'Add' : 'Edit'} ${cfg.label} item`} onClose={onClose}
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : isNew ? 'Add item' : 'Save changes'}</Btn>
      </>}>
      {/* Responsive two-up grid. minWidth:0 stops long values/labels from blowing
          out their track (grid children default to min-width:auto and spill past
          the field box); box-sizing keeps width:100% inputs inside the cell. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0 14px' }}>
        {cfg.fields.map((f) => {
          const numeric = f.num || f.int
          return (
          <div key={f.key} style={{ minWidth: 0, gridColumn: f.bool || f.help ? '1 / -1' : 'auto' }}>
            {f.bool ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!form[f.key]} onChange={(e) => set(f.key, e.target.checked)} />
                {f.label}
              </label>
            ) : (
              <Field label={f.label + (f.required ? ' *' : '')}>
                {f.select ? (
                  <select style={fieldControl} value={form[f.key] || ''} onChange={(e) => set(f.key, e.target.value)}>
                    <option value="">—</option>
                    {f.select.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ) : (
                  // type=text (not number) + digit coercion => always Latin numerals.
                  <input style={fieldControl} type="text" lang="en" dir="ltr"
                    inputMode={numeric ? 'decimal' : undefined}
                    value={form[f.key] ?? ''}
                    onChange={(e) => set(f.key, numeric ? numFilter(e.target.value) : e.target.value)} />
                )}
                {f.help && <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.35 }}>{f.help}</span>}
              </Field>
            )}
          </div>
          )
        })}
      </div>
    </Modal>
  )
}

function RetireModal({ cfg, row, onClose, onDone }) {
  const [busy, setBusy] = useState(false)
  const retiring = row.is_active
  const name = row.item || row.description || row.lamp_type || 'this item'

  const go = async () => {
    setBusy(true)
    const { data, error } = await supabase.from(cfg.table).update({ is_active: !retiring, updated_at: new Date().toISOString() }).eq('id', row.id).select('id')
    setBusy(false)
    if (error) { toast("Couldn't update — " + error.message, 'err'); return }
    if (!data || data.length === 0) { toast("Couldn't update — item not found or no permission (admin/PMO only)", 'err'); return }
    toast(retiring ? 'Item retired' : 'Item restored')
    onDone()
  }

  return (
    <Modal open width={440} title={retiring ? 'Retire item?' : 'Restore item?'} onClose={onClose}
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant={retiring ? 'danger' : 'primary'} disabled={busy} onClick={go}>{busy ? 'Working…' : retiring ? 'Retire' : 'Restore'}</Btn>
      </>}>
      <div style={{ fontSize: 13, lineHeight: 1.55 }}>
        {retiring
          ? <>Retiring <b>{name}</b> hides it from new saving-sheet selections. Past references stay intact, and you can restore it any time from the retired view.</>
          : <>Restore <b>{name}</b> so it can be selected again.</>}
      </div>
    </Modal>
  )
}
