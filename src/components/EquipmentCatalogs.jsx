import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../rbac'
import { useLiveQuery } from '../lib/db'
import { Btn, Modal, Field, inputStyle, Loading, Empty } from './ui'
import Icon from './Icon'
import { toast } from '../lib/toast'
import { toLatin } from '../lib/format'
import { fetchAllRows } from '../lib/tarshidImport'
import TarshidImportModal from './TarshidImportModal'

// Sprint 9A — TARSHID-approved equipment catalogs (from an approved TARSHID
// equipment-catalogue workbook; the client-identifying source name was removed
// under Constraints #7 — see migrations 0090 and 0137).
// Three global reference tables surfaced as a Settings panel. Everyone reads;
// only admin/pmo write (enforced server-side; the write UI is gated to match).
// The survey pickers consume these rows by id — retire is soft
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
      { key: 'lamp_type', label: 'Lamp Type', bold: true, max: 180 },
      { key: 'model', label: 'Model', max: 130 },
      { key: 'brand', label: 'Brand', max: 110 },
      { key: 'shape_size_base', label: 'Shape/Size/Base', max: 150 },
      { key: 'dimensions', label: 'Dimensions', max: 110 },
      { key: 'wattage_w', label: 'W', mono: true, num: true, tight: true },
      { key: 'lumens_lm', label: 'Lumens', mono: true, num: true, tight: true },
      { key: 'cct_k', label: 'CCT', mono: true, tight: true },
      { key: 'life_hours', label: 'Life (H)', mono: true, num: true, tight: true },
      { key: 'operating_v', label: 'V', mono: true, tight: true, hideIfEmpty: true },
      { key: 'unit_cost', label: 'Cost', mono: true, num: true, tight: true, hideIfEmpty: true },
      { key: 'labor_cost', label: 'Labor', mono: true, num: true, tight: true, hideIfEmpty: true },
      { key: 'mandatory', label: 'MAND.', chip: true },
      { key: 'local', label: 'Local', chip: true },
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
      { key: 'unit_cost', label: 'Unit cost (SAR)', num: true },
      { key: 'labor_cost', label: 'Labor cost (SAR)', num: true },
      { key: 'saso_cert_ref', label: 'SASO certificate ref' },
      { key: 'datasheet_ref', label: 'Datasheet ref' },
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
      { key: 'description', label: 'Description', bold: true, max: 200 },
      { key: 'equipment_type', label: 'Type' },
      { key: 'model', label: 'Model (ID/OD)', max: 140 },
      { key: 'make', label: 'Make', max: 100 },
      { key: 'size_category', label: 'Size Category', max: 150 },
      { key: 'capacity_btu', label: 'BTU', mono: true, num: true, tight: true },
      { key: 'capacity_tr', label: 'TR', mono: true, num: true, tight: true },
      { key: 'seer', label: 'SEER', mono: true, num: true, tight: true },
      { key: 'ieer', label: 'IEER', mono: true, num: true, tight: true, hideIfEmpty: true },
      { key: 'voltage_class', label: 'Voltage', tight: true, hideIfEmpty: true },
      { key: 'ch_mode', label: 'C&H', render: (v) => v === 'cooling_heating' ? 'C&H' : v === 'cooling_only' ? 'Cooling' : '—' },
      { key: 'unit_cost', label: 'Cost', mono: true, num: true, tight: true, hideIfEmpty: true },
      { key: 'labor_cost', label: 'Labor', mono: true, num: true, tight: true, hideIfEmpty: true },
      { key: 'mandatory', label: 'MAND.', chip: true },
      { key: 'local', label: 'Local', chip: true },
    ],
    importKind: 'costs',
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
      { key: 'unit_cost', label: 'Unit cost (SAR)', num: true },
      { key: 'labor_cost', label: 'Labor cost (SAR)', num: true },
      { key: 'saso_cert_ref', label: 'SASO certificate ref' },
      { key: 'datasheet_ref', label: 'Datasheet ref' },
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
      { key: 'item', label: 'Item', bold: true },
      { key: 'unit', label: 'Unit', mono: true },
      { key: 'default_qty_rule', label: 'Default QTY Rule' },
      { key: 'notes', label: 'Notes' },
    ],
    fields: [
      { key: 'item', label: 'Item', required: true },
      { key: 'unit', label: 'Unit', required: true },
      { key: 'default_qty_rule', label: 'Default qty rule', help: 'e.g. "2% from each type". Actual quantities live in the project BOQ.' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  // 9D-1 — TARSHID saving-sheet reference data. flag:'retired' (these tables
  // store a retired boolean instead of is_active); big:true fetches past the
  // 1000-row PostgREST page cap (~2,505 registry rows).
  oldreg: {
    label: 'Old Model Registry',
    table: 'old_model_registry',
    flag: 'retired',
    big: true,
    importKind: 'oldreg',
    search: (r) => [r.equipment_type, r.make, r.model_no, r.size_category, r.surveyed_unit_description, r.equivalent_ac_model_description].filter(Boolean).join(' ').toLowerCase(),
    filters: [
      { key: 'equipment_type', label: 'Equipment type', distinct: true },
      { key: 'make', label: 'Make', distinct: true },
      { key: 'compressor_type', label: 'Compressor', distinct: true },
    ],
    columns: [
      { key: 'equipment_type', label: 'Equipment Type', bold: true, max: 140 },
      { key: 'make', label: 'Make', max: 100 },
      { key: 'model_no', label: 'Model (ID/OD)', max: 160 },
      { key: 'compressor_type', label: 'Compressor', max: 100 },
      { key: 'size_category', label: 'Size Category', max: 140, hideIfEmpty: true },
      { key: 'tr', label: 'TR', mono: true, num: true, tight: true },
      { key: 't1_btu', label: 'T1 BTU', mono: true, num: true, tight: true },
      { key: 't1_eer', label: 'T1 EER', mono: true, num: true, tight: true },
      { key: 't3_btu', label: 'T3 BTU', mono: true, num: true, tight: true, hideIfEmpty: true },
      { key: 't3_eer', label: 'T3 EER', mono: true, num: true, tight: true, hideIfEmpty: true },
      { key: 'equivalent_seer', label: 'Eq SEER', mono: true, num: true, tight: true },
    ],
    fields: [
      { key: 'equipment_type', label: 'Equipment type', required: true },
      { key: 'make', label: 'Make' },
      { key: 'model_no', label: 'Model No (ID/OD)', required: true },
      { key: 'compressor_type', label: 'Compressor type', help: 'Inverter / Non-Inverter' },
      { key: 'size_category', label: 'Size category' },
      { key: 'tr', label: 'TR', num: true },
      { key: 't1_btu', label: 'T1 (Btu/h)', int: true },
      { key: 't1_w', label: 'T1 (W)', int: true },
      { key: 't1_eer', label: 'T1 EER', num: true },
      { key: 't3_btu', label: 'T3 (Btu/h)', int: true },
      { key: 't3_w', label: 'T3 (W)', int: true },
      { key: 't3_eer', label: 'T3 EER', num: true },
      { key: 'equivalent_seer', label: 'Equivalent SEER', num: true },
      { key: 'surveyed_unit_description', label: 'Surveyed unit description' },
      { key: 'equivalent_ac_model_description', label: 'Equivalent AC model description' },
    ],
  },
  baseline: {
    label: 'Baseline Units',
    table: 'approved_baseline_units',
    flag: 'retired',
    big: true,
    importKind: 'baseline',
    search: (r) => [r.description, r.equipment_type, r.make, r.model_no].filter(Boolean).join(' ').toLowerCase(),
    filters: [
      { key: 'equipment_type', label: 'Equipment type', distinct: true },
      { key: 'make', label: 'Make', distinct: true },
    ],
    columns: [
      { key: 'description', label: 'Description', bold: true, max: 200 },
      { key: 'equipment_type', label: 'Equipment Type', max: 120 },
      { key: 'make', label: 'Make', max: 100 },
      { key: 'model_no', label: 'Model (ID/OD)', max: 160 },
      { key: 't1_btu', label: 'T1 BTU', mono: true, num: true, tight: true },
      { key: 't1_eer', label: 'T1 EER', mono: true, num: true, tight: true },
      { key: 't3_btu', label: 'T3 BTU', mono: true, num: true, tight: true, hideIfEmpty: true },
      { key: 't3_eer', label: 'T3 EER', mono: true, num: true, tight: true, hideIfEmpty: true },
      { key: 'equivalent_seer', label: 'Eq SEER', mono: true, num: true, tight: true },
      { key: 'nameplate_ref', label: 'Nameplate', max: 110, hideIfEmpty: true },
      { key: 'datasheet_ref', label: 'Datasheet', max: 110, hideIfEmpty: true },
    ],
    fields: [
      { key: 'description', label: 'Description', required: true },
      { key: 'equipment_type', label: 'Equipment type', required: true },
      { key: 'make', label: 'Make' },
      { key: 'model_no', label: 'Model No (ID/OD)', required: true },
      { key: 't1_btu', label: 'T1 BTU', int: true },
      { key: 't1_w', label: 'T1 W', int: true },
      { key: 't1_eer', label: 'T1 EER', num: true },
      { key: 't3_btu', label: 'T3 BTU', int: true },
      { key: 't3_w', label: 'T3 W', int: true },
      { key: 't3_eer', label: 'T3 EER', num: true },
      { key: 'equivalent_seer', label: 'Equivalent SEER', num: true },
      { key: 'nameplate_ref', label: 'Reference nameplate photo' },
      { key: 'datasheet_ref', label: 'Reference datasheet' },
    ],
  },
}

// active/retired adapter: 9A catalogs carry is_active, 9D-1 reference tables a
// retired boolean — one accessor so the shared UI reads both.
const rowActive = (cfg, r) => cfg.flag === 'retired' ? !r.retired : !!r.is_active

// Chunked whole-table fetch (PostgREST caps a request at 1000 rows). No
// realtime channel — reference data changes via import/edit, which refetch.
function useBigTable(table) {
  const [state, setState] = useState({ rows: [], loading: true })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    ;(async () => {
      const { rows, error } = await fetchAllRows(table)
      if (!alive) return
      if (error) toast(`Couldn't load ${table.replace(/_/g, ' ')} — ${error.message}`, 'err')
      rows.sort((a, b) => (a.equipment_type || '').localeCompare(b.equipment_type || '') || (a.model_no || '').localeCompare(b.model_no || ''))
      setState({ rows, loading: false })
    })()
    return () => { alive = false }
  }, [table, tick])
  const refetch = () => setTick((t) => t + 1)
  return { rows: state.rows, loading: state.loading, refetch }
}

// Form control that never exceeds its grid cell (border-box + full width).
const fieldControl = { ...inputStyle, boxSizing: 'border-box', width: '100%', maxWidth: '100%' }

const chipStyle = (on) => ({ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-s)',
  color: on ? 'var(--accent)' : 'var(--text-faint)', background: on ? 'var(--accent-tint)' : 'var(--line-soft)' })

// Latin/Western digits are mandatory in these catalogs (9A-fix). Number inputs
// and toLocaleString() otherwise render Arabic-Indic numerals on ar-locale OS —
// same class of bug the 8X DateInput fix solved. Pin en-US for display, and
// coerce any Arabic-Indic/Persian digits the user types back to Latin.
// Deliberately local, not format.js num(): here an EMPTY cell must read '—'
// (an unpriced catalog row), where the canonical helper would print '0'.
const num = (v) => v == null || v === '' || isNaN(v) ? '—' : Number(v).toLocaleString('en-US')
const numFilter = (s) => toLatin(s).replace(/[^\d.-]/g, '')

export default function EquipmentCatalogs({ role }) {
  const canWrite = ['admin', 'pmo'].includes(role)
  const [tab, setTab] = useState('lighting')

  const lighting = useLiveQuery('lighting_catalog', (q) => q.select('*').order('sr_no', { nullsFirst: false }))
  const ac = useLiveQuery('ac_catalog', (q) => q.select('*').order('sr_no', { nullsFirst: false }))
  const misc = useLiveQuery('misc_catalog', (q) => q.select('*').order('sr_no', { nullsFirst: false }))
  const oldreg = useBigTable('old_model_registry')
  const baseline = useBigTable('approved_baseline_units')
  const data = { lighting, ac, misc, oldreg, baseline }

  const cfg = CATALOGS[tab]
  const active = data[tab]
  const activeCount = (key) => data[key].rows.filter((r) => rowActive(CATALOGS[key], r)).length

  return (
    // overflow:hidden — the card is the hard clip boundary; the table's own
    // .ies-table-wrap scrolls inside it (visible scrollbar via index.css).
    <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16, overflow: 'hidden' }}>
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
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 'var(--radius-s)', fontSize: 12.5, fontWeight: 700,
              border: '1px solid ' + (on ? 'var(--accent)' : 'var(--line)'), background: on ? 'var(--accent-tint)' : 'var(--surface-1)', color: on ? 'var(--accent)' : 'var(--text-3)',
            }}>
              {c.label}
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: on ? 'var(--warn-bg)' : 'var(--bg)', color: on ? 'var(--accent)' : 'var(--text-3)' }}>
                {data[key].loading ? '·' : activeCount(key)}
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
  const [importing, setImporting] = useState(false) // 9D-1 workbook import

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
      if (!showRetired && !rowActive(cfg, r)) return false
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
        {canWrite && cfg.importKind && <Btn icon="upload" onClick={() => setImporting(true)}>Import from workbook</Btn>}
        {canWrite && <Btn variant="primary" icon="plus" onClick={() => setEditing({})}>Add item</Btn>}
      </div>

      {loading ? <Loading /> : filtered.length === 0 ? (
        <Empty icon="box">{rows.length === 0 ? `No ${cfg.label.toLowerCase()} items yet.` : 'No items match these filters.'}</Empty>
      ) : (
        <>
          <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 640 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
              {visCols.map((c) => <th key={c.key} style={{ padding: c.tight ? '8px 5px' : '8px 7px', fontWeight: 600, whiteSpace: 'nowrap', textAlign: c.num ? 'right' : 'left' }}>{c.label}</th>)}
              {canWrite && <th style={{ padding: '8px 7px', fontWeight: 600, textAlign: 'right' }}>Actions</th>}
            </tr></thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--line)', opacity: rowActive(cfg, r) ? 1 : 0.5 }}>
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
                        style={{ padding: 5, borderRadius: 'var(--radius-s)', color: 'var(--text-3)' }}><Icon name="edit" size={14} /></button>
                      <button className="ies-hover" onClick={() => setRetiring(r)} title={rowActive(cfg, r) ? 'Retire' : 'Restore'}
                        style={{ padding: '4px 8px', borderRadius: 'var(--radius-s)', fontSize: 11, fontWeight: 600, color: rowActive(cfg, r) ? 'var(--bad)' : 'var(--good, var(--ok-deep))' }}>
                        {rowActive(cfg, r) ? 'Retire' : 'Restore'}</button>
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
      {importing && <TarshidImportModal kind={cfg.importKind} onClose={() => setImporting(false)} onDone={refetch} />}
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
  const retiring = rowActive(cfg, row)
  const name = row.item || row.description || row.lamp_type || row.model_no || 'this item'

  const go = async () => {
    setBusy(true)
    const patch = cfg.flag === 'retired' ? { retired: retiring } : { is_active: !retiring, updated_at: new Date().toISOString() }
    const { data, error } = await supabase.from(cfg.table).update(patch).eq('id', row.id).select('id')
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
