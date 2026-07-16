import { useState, useEffect } from 'react'
import { useLiveQuery, bgInsert, bgUpdate, bgDelete } from '../lib/db'
import { useAuth } from '../rbac'
import { Empty, Btn } from './ui'
import { toast } from '../lib/toast'
import { read, utils, writeFileXLSX } from 'xlsx'

const EDIT_ROLES = ['admin', 'pmo', 'projm', 'proje']
const CAP_UNITS = ['kBTU', 'kW', 'W', 'lm']
const EFF_UNITS = ['SEER', 'EER', 'COP', 'lm/W']
const numOrNull = (v) => (v === '' || v == null ? null : Number(v))
const cellInput = { width: '100%', padding: '5px 6px', border: '1px solid transparent', borderRadius: 5, fontSize: 11.5, background: 'transparent' }
const cellFocus = { border: '1px solid var(--accent)', background: '#fff' }

// Borderless cell that saves on blur (Sheets-like). select/toggle save on change.
function Cell({ value, onSave, type = 'text', options, placeholder, align }) {
  const [v, setV] = useState(value ?? '')
  const [foc, setFoc] = useState(false)
  useEffect(() => { setV(value ?? '') }, [value])
  if (options) return <select value={v ?? ''} onChange={(e) => { setV(e.target.value); onSave(e.target.value) }} style={{ ...cellInput, ...(foc ? cellFocus : {}) }} onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select>
  if (type === 'toggle') return <button onClick={() => onSave(!value)} style={{ ...cellInput, cursor: 'pointer', fontWeight: 700, color: value ? 'var(--ok)' : 'var(--text-3)', textAlign: 'center' }}>{value ? 'Yes' : 'No'}</button>
  return <input lang="en" inputMode={type === 'num' ? 'numeric' : undefined} value={v ?? ''} placeholder={placeholder}
    onChange={(e) => setV(e.target.value)} onFocus={() => setFoc(true)}
    onBlur={() => { setFoc(false); if ((v ?? '') !== (value ?? '')) onSave(v) }}
    style={{ ...cellInput, textAlign: align || 'left', ...(foc ? cellFocus : {}) }} />
}

export default function ProjectItems({ projectId, project }) {
  const { role } = useAuth()
  const canEdit = EDIT_ROLES.includes(role)
  const { rows: installed, refetch: refI } = useLiveQuery('project_installed_items', (q) => q.select('*').eq('project_id', projectId).order('created_at'), [projectId])
  const { rows: removed, refetch: refR } = useLiveQuery('project_removed_items', (q) => q.select('*').eq('project_id', projectId).order('created_at'), [projectId])
  const { rows: pairs, refetch: refP } = useLiveQuery('project_item_pairs', (q) => q.select('*').eq('project_id', projectId).order('created_at'), [projectId])
  const { rows: pEsms } = useLiveQuery('project_esms', (q) => q.select('custom_name,ordinal,esm:esms(code,name)').eq('project_id', projectId).order('ordinal'), [projectId])
  const esms = pEsms.filter((pe) => pe.esm).map((pe) => ({ code: pe.esm.code, name: pe.custom_name || pe.esm.name }))
  const [open, setOpen] = useState({})
  const [importErrors, setImportErrors] = useState([])
  const refreshAll = () => { refI(); refR(); refP() }

  const insById = Object.fromEntries(installed.map((r) => [r.id, r]))
  const remById = Object.fromEntries(removed.map((r) => [r.id, r]))
  const pairedI = new Set(pairs.map((p) => p.installed_item_id).filter(Boolean))
  const pairedR = new Set(pairs.map((p) => p.removed_item_id).filter(Boolean))
  // Orphans = items without a pair. EPC rule: a NEW (installed) item must always
  // be paired with an OLD (removed) one — so any unpaired item is flagged.
  const orphanCount = installed.filter((r) => !pairedI.has(r.id)).length + removed.filter((r) => !pairedR.has(r.id)).length

  const saveI = async (id, patch) => { const { error } = await bgUpdate('project_installed_items', id, patch); if (!error) refI() }
  const saveR = async (id, patch) => { const { error } = await bgUpdate('project_removed_items', id, patch); if (!error) refR() }
  const numGuard = (k, v) => (k === 'total_quantity' && v !== '' && !(Number(v) > 0) ? (toast('Quantity must be > 0', 'err'), false) : true)

  const addPair = async (esm) => {
    const { data: di } = await bgInsert('project_installed_items', { project_id: projectId, esm_code: esm, capacity_unit: 'kBTU', efficiency_unit: 'SEER', total_quantity: 1 })
    const { data: dr } = await bgInsert('project_removed_items', { project_id: projectId, esm_code: esm, capacity_unit: 'kBTU', efficiency_unit: 'SEER', total_quantity: 1, returned_to_facility: true })
    if (di?.[0] && dr?.[0]) await bgInsert('project_item_pairs', { project_id: projectId, esm_code: esm, installed_item_id: di[0].id, removed_item_id: dr[0].id })
    refreshAll()
  }
  // Fix an existing orphan by creating its missing side and linking the pair.
  const pairOrphan = async (row) => {
    const esm = row.inst?.esm_code || row.rem?.esm_code || null
    if (row.inst && !row.rem) {
      const { data: dr } = await bgInsert('project_removed_items', { project_id: projectId, esm_code: esm, capacity_unit: 'kBTU', efficiency_unit: 'SEER', total_quantity: 1, returned_to_facility: true })
      if (dr?.[0]) await bgInsert('project_item_pairs', { project_id: projectId, esm_code: esm, installed_item_id: row.inst.id, removed_item_id: dr[0].id })
    } else if (row.rem && !row.inst) {
      const { data: di } = await bgInsert('project_installed_items', { project_id: projectId, esm_code: esm, capacity_unit: 'kBTU', efficiency_unit: 'SEER', total_quantity: 1 })
      if (di?.[0]) await bgInsert('project_item_pairs', { project_id: projectId, esm_code: esm, installed_item_id: di[0].id, removed_item_id: row.rem.id })
    }
    refreshAll()
  }
  const delRow = async (row) => {
    if (row.pair) await bgDelete('project_item_pairs', row.pair.id)
    if (row.inst) await bgDelete('project_installed_items', row.inst.id)
    if (row.rem) await bgDelete('project_removed_items', row.rem.id)
    refreshAll()
  }

  // rows per ESM = pairs + unpaired installed + unpaired removed
  const rowsForEsm = (esm) => {
    const ps = pairs.filter((p) => (p.esm_code || '') === esm).map((p) => ({ key: 'p' + p.id, pair: p, inst: insById[p.installed_item_id], rem: remById[p.removed_item_id] }))
    const soI = installed.filter((r) => r.esm_code === esm && !pairedI.has(r.id)).map((r) => ({ key: 'i' + r.id, inst: r, rem: null }))
    const soR = removed.filter((r) => r.esm_code === esm && !pairedR.has(r.id)).map((r) => ({ key: 'r' + r.id, inst: null, rem: r }))
    return [...ps, ...soI, ...soR]
  }

  const exportCsv = () => {
    const out = []
    esms.forEach((e) => rowsForEsm(e.code).forEach((row) => out.push({
      esm_code: e.code,
      installed_description: row.inst?.item_description || '', installed_model: row.inst?.model_code || '',
      installed_capacity: row.inst?.capacity_value ?? '', installed_capacity_unit: row.inst?.capacity_unit || '',
      installed_efficiency: row.inst?.efficiency_value ?? '', installed_efficiency_unit: row.inst?.efficiency_unit || '', installed_qty: row.inst?.total_quantity ?? '',
      removed_description: row.rem?.item_description || '', removed_capacity: row.rem?.capacity_value ?? '', removed_capacity_unit: row.rem?.capacity_unit || '',
      removed_efficiency: row.rem?.efficiency_value ?? '', removed_efficiency_unit: row.rem?.efficiency_unit || '', removed_qty: row.rem?.total_quantity ?? '',
      removed_returned: row.rem ? (row.rem.returned_to_facility ? 'Yes' : 'No') : '', pair_note: row.pair?.notes || '',
    })))
    const ws = utils.json_to_sheet(out); const wb = utils.book_new(); utils.book_append_sheet(wb, ws, 'Pairs')
    writeFileXLSX(wb, 'project-item-pairs.csv', { bookType: 'csv' })
  }
  // Import enforces the pairing rule: every row must carry BOTH a new and an old
  // item. Single-sided rows are rejected with a row-level message; only complete
  // pairs are inserted (so import can never introduce an orphan).
  const importCsv = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setImportErrors([])
    const wb = read(await file.arrayBuffer()); const data = utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
    const errs = []; let n = 0
    for (let idx = 0; idx < data.length; idx++) {
      const r = data[idx]; const rowNo = idx + 2 // +1 header, +1 to 1-base
      const esm = r.esm_code || null
      const hasI = !!(r.installed_description || r.installed_qty), hasR = !!(r.removed_description || r.removed_qty)
      if (!hasI && !hasR) continue // blank row
      if (!esm) { errs.push(`Row ${rowNo}: missing esm_code`); continue }
      if (hasI && !hasR) { errs.push(`Row ${rowNo}: missing Old item — pair every new item with the one it replaces`); continue }
      if (hasR && !hasI) { errs.push(`Row ${rowNo}: missing New item — every removed item needs its replacement`); continue }
      const { data: di } = await bgInsert('project_installed_items', { project_id: projectId, esm_code: esm, item_description: r.installed_description || null, model_code: r.installed_model || null, capacity_value: numOrNull(r.installed_capacity), capacity_unit: r.installed_capacity_unit || 'kBTU', efficiency_value: numOrNull(r.installed_efficiency), efficiency_unit: r.installed_efficiency_unit || 'SEER', total_quantity: numOrNull(r.installed_qty) })
      const { data: dr } = await bgInsert('project_removed_items', { project_id: projectId, esm_code: esm, item_description: r.removed_description || null, capacity_value: numOrNull(r.removed_capacity), capacity_unit: r.removed_capacity_unit || 'kBTU', efficiency_value: numOrNull(r.removed_efficiency), efficiency_unit: r.removed_efficiency_unit || 'SEER', total_quantity: numOrNull(r.removed_qty), returned_to_facility: ['yes', 'true', '1'].includes(String(r.removed_returned).toLowerCase()) })
      if (di?.[0] && dr?.[0]) { await bgInsert('project_item_pairs', { project_id: projectId, esm_code: esm, installed_item_id: di[0].id, removed_item_id: dr[0].id, notes: r.pair_note || null }); n++ }
    }
    e.target.value = ''; refreshAll(); setImportErrors(errs)
    toast(`Imported ${n} pair${n === 1 ? '' : 's'}${errs.length ? ` · ${errs.length} row(s) rejected` : ''}`, errs.length ? 'err' : undefined)
  }

  // Well-formatted .xlsx template: example pairs per ESM kind + a README sheet.
  const downloadTemplate = () => {
    const row = (esm, id, im, ic, icu, ie, ieu, iq, rd, rc, rcu, re, reu, rq) => ({
      esm_code: esm, installed_description: id, installed_model: im, installed_capacity: ic, installed_capacity_unit: icu, installed_efficiency: ie, installed_efficiency_unit: ieu, installed_qty: iq,
      removed_description: rd, removed_capacity: rc, removed_capacity_unit: rcu, removed_efficiency: re, removed_efficiency_unit: reu, removed_qty: rq, removed_returned: 'Yes', pair_note: '',
    })
    const rows = [
      row('ESM1', 'LED Panel 40W', 'LP-40', 40, 'W', 125, 'lm/W', 120, 'Fluorescent Troffer 72W', 72, 'W', 60, 'lm/W', 120),
      row('ESM1', 'LED Downlight 12W', 'DL-12', 12, 'W', 110, 'lm/W', 80, 'Halogen Downlight 50W', 50, 'W', 18, 'lm/W', 80),
      row('ESM2', 'PIR Occupancy Sensor', 'PIR-360', '', 'W', '', 'lm/W', 60, 'Manual Wall Switch', '', 'W', '', 'lm/W', 60),
      row('ESM2', 'Daylight Dimming Controller', 'DDC-1', '', 'W', '', 'lm/W', 24, 'Fixed On/Off Switch', '', 'W', '', 'lm/W', 24),
      row('ESM3', 'Split Wall-Mounted Unit 18kBTU', 'WM-1.5TR', 18, 'kBTU', 16, 'SEER', 12, 'Window AC 24kBTU', 24, 'kBTU', 9, 'SEER', 12),
      row('ESM3', 'Cassette Unit 36kBTU', 'CAS-3TR', 36, 'kBTU', 15, 'SEER', 6, 'Old Split 36kBTU', 36, 'kBTU', 8, 'SEER', 6),
    ]
    const ws = utils.json_to_sheet(rows)
    ws['!cols'] = Object.keys(rows[0]).map((k) => ({ wch: Math.max(12, k.length + 2) }))
    const readme = utils.aoa_to_sheet([
      ['Items & Replacements — Import Template'],
      [''],
      ['PAIRING RULE: every NEW (installed) item MUST be paired with an OLD (removed) item.'],
      ['Rows that have only one side are rejected on import with a row-level message.'],
      [''],
      ['Column', 'Meaning', 'Required'],
      ['esm_code', 'ESM code already on the project (ESM1, ESM2, ESM3, …)', 'Yes'],
      ['installed_description', 'New item name/description', 'Yes'],
      ['installed_model', 'New item model/part code', 'No'],
      ['installed_capacity', 'New item capacity value (number)', 'No'],
      ['installed_capacity_unit', 'kBTU / kW / W / lm', 'No'],
      ['installed_efficiency', 'New item efficiency value (number)', 'No'],
      ['installed_efficiency_unit', 'SEER / EER / COP / lm/W', 'No'],
      ['installed_qty', 'New item quantity (> 0)', 'Yes'],
      ['removed_description', 'Old item name/description', 'Yes'],
      ['removed_capacity', 'Old item capacity value (number)', 'No'],
      ['removed_capacity_unit', 'kBTU / kW / W / lm', 'No'],
      ['removed_efficiency', 'Old item efficiency value (number)', 'No'],
      ['removed_efficiency_unit', 'SEER / EER / COP / lm/W', 'No'],
      ['removed_qty', 'Old item quantity (> 0)', 'Yes'],
      ['removed_returned', 'Was the old item returned to the facility? Yes / No', 'No'],
      ['pair_note', 'Optional note about this replacement', 'No'],
    ])
    readme['!cols'] = [{ wch: 26 }, { wch: 60 }, { wch: 10 }]
    const wb = utils.book_new()
    utils.book_append_sheet(wb, readme, 'README')
    utils.book_append_sheet(wb, ws, 'Pairs')
    writeFileXLSX(wb, 'items-replacements-template.xlsx')
  }

  if (esms.length === 0) return <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}><Empty icon="materials">Add ESMs to capture installed & removed items.</Empty></div>

  const th = (t) => <th style={{ padding: '6px 7px', fontWeight: 600, fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{t}</th>
  const layout = project?.coc_layout

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Items &amp; Replacements</div>
          {layout && <span title={layout === 'scattered' ? 'Scattered: buildings far apart → per-building COCs' : 'Concatenated: one site → project-wide COCs'} style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, color: 'var(--accent)', background: '#F5EEDF', cursor: 'help' }}>Layout: {layout === 'scattered' ? 'Scattered' : 'Concatenated'} ⓘ</span>}
        </div>
        {canEdit && <div style={{ display: 'flex', gap: 8 }}>
          <Btn style={{ padding: '6px 10px', fontSize: 12 }} onClick={downloadTemplate}>Download template</Btn>
          <Btn style={{ padding: '6px 10px', fontSize: 12 }} onClick={exportCsv}>Export</Btn>
          <label className="ies-hover" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Import<input type="file" accept=".csv,.xlsx" onChange={importCsv} style={{ display: 'none' }} /></label>
        </div>}
      </div>
      {orphanCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F9ECEA', border: '1px solid #EBCFC9', color: '#96271E', borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 10 }}>
          <strong>{orphanCount}</strong> item(s) without a pair. Every new item must be paired with the old item it replaces — use <strong>↔ Pair</strong> on each flagged row, or delete it.
        </div>
      )}
      {importErrors.length > 0 && (
        <div style={{ background: '#F9ECEA', border: '1px solid #EBCFC9', borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#96271E', fontWeight: 700, marginBottom: 4 }}><span>{importErrors.length} import row(s) rejected</span><button onClick={() => setImportErrors([])} style={{ color: '#96271E', fontWeight: 700 }}>Dismiss</button></div>
          <ul style={{ margin: 0, paddingLeft: 16, color: '#96271E' }}>{importErrors.slice(0, 12).map((m, i) => <li key={i}>{m}</li>)}{importErrors.length > 12 && <li>…and {importErrors.length - 12} more</li>}</ul>
        </div>
      )}
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>Each row is a replacement pair: installed (new) ↔ removed (old). Click any cell to edit — changes save automatically.</div>
      {esms.map((e) => {
        const rows = rowsForEsm(e.code)
        const isOpen = open[e.code] ?? (esms.length <= 2)
        return (
          <div key={e.code} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <button onClick={() => setOpen((o) => ({ ...o, [e.code]: !isOpen }))} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', marginBottom: isOpen ? 10 : 0 }}>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{e.code}</span><span style={{ fontWeight: 600 }}>{e.name}</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>{rows.length} pairs/items · {isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && <>
              {canEdit && <div style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'center' }}>
                <button onClick={() => addPair(e.code)} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>+ Add Pair</button>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Each row pairs a new (installed) item with the old (removed) item it replaces.</span>
              </div>}
              <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
                <thead><tr style={{ textAlign: 'left' }}>
                  {th('INSTALLED — DESC')}{th('MODEL')}{th('CAP')}{th('U')}{th('EFF')}{th('U')}{th('QTY')}
                  {th('↔ NOTE')}
                  {th('REMOVED — DESC')}{th('CAP')}{th('U')}{th('EFF')}{th('U')}{th('QTY')}{th('RET')}{canEdit && th('')}
                </tr></thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={16} style={{ padding: 10, color: 'var(--text-3)', fontSize: 12 }}>No items yet.</td></tr>}
                  {rows.map((row) => {
                    const orphan = !(row.inst && row.rem)
                    return (
                    <tr key={row.key} title={orphan ? 'Unpaired item — pair it with its replacement or delete it' : undefined} style={{ borderTop: '1px solid var(--line)', background: orphan ? '#FBF1EF' : '#fff', boxShadow: orphan ? 'inset 3px 0 0 #B3362B' : 'none' }}>
                      {/* installed side */}
                      <td style={{ padding: 2, minWidth: 140 }}>{row.inst ? <Cell value={row.inst.item_description} onSave={(v) => saveI(row.inst.id, { item_description: v || null })} placeholder="Installed item" /> : <span style={{ color: 'var(--text-3)', fontSize: 11, paddingLeft: 6 }}>—</span>}</td>
                      <td style={{ padding: 2 }}>{row.inst && <Cell value={row.inst.model_code} onSave={(v) => saveI(row.inst.id, { model_code: v || null })} placeholder="Model" />}</td>
                      <td style={{ padding: 2, width: 60 }}>{row.inst && <Cell value={row.inst.capacity_value} type="num" align="right" onSave={(v) => saveI(row.inst.id, { capacity_value: numOrNull(v) })} />}</td>
                      <td style={{ padding: 2, width: 60 }}>{row.inst && <Cell value={row.inst.capacity_unit} options={CAP_UNITS} onSave={(v) => saveI(row.inst.id, { capacity_unit: v })} />}</td>
                      <td style={{ padding: 2, width: 56 }}>{row.inst && <Cell value={row.inst.efficiency_value} type="num" align="right" onSave={(v) => saveI(row.inst.id, { efficiency_value: numOrNull(v) })} />}</td>
                      <td style={{ padding: 2, width: 64 }}>{row.inst && <Cell value={row.inst.efficiency_unit} options={EFF_UNITS} onSave={(v) => saveI(row.inst.id, { efficiency_unit: v })} />}</td>
                      <td style={{ padding: 2, width: 50 }}>{row.inst && <Cell value={row.inst.total_quantity} type="num" align="right" onSave={(v) => numGuard('total_quantity', v) && saveI(row.inst.id, { total_quantity: numOrNull(v) })} />}</td>
                      {/* pair note */}
                      <td style={{ padding: 2, minWidth: 90, borderLeft: '1px solid var(--line)', borderRight: '1px solid var(--line)' }}>{row.pair && <Cell value={row.pair.notes} onSave={(v) => { bgUpdate('project_item_pairs', row.pair.id, { notes: v || null }).then(refP) }} placeholder="↔" />}</td>
                      {/* removed side */}
                      <td style={{ padding: 2, minWidth: 140 }}>{row.rem ? <Cell value={row.rem.item_description} onSave={(v) => saveR(row.rem.id, { item_description: v || null })} placeholder="Removed item" /> : <span style={{ color: 'var(--text-3)', fontSize: 11, paddingLeft: 6 }}>—</span>}</td>
                      <td style={{ padding: 2, width: 60 }}>{row.rem && <Cell value={row.rem.capacity_value} type="num" align="right" onSave={(v) => saveR(row.rem.id, { capacity_value: numOrNull(v) })} />}</td>
                      <td style={{ padding: 2, width: 60 }}>{row.rem && <Cell value={row.rem.capacity_unit} options={CAP_UNITS} onSave={(v) => saveR(row.rem.id, { capacity_unit: v })} />}</td>
                      <td style={{ padding: 2, width: 56 }}>{row.rem && <Cell value={row.rem.efficiency_value} type="num" align="right" onSave={(v) => saveR(row.rem.id, { efficiency_value: numOrNull(v) })} />}</td>
                      <td style={{ padding: 2, width: 64 }}>{row.rem && <Cell value={row.rem.efficiency_unit} options={EFF_UNITS} onSave={(v) => saveR(row.rem.id, { efficiency_unit: v })} />}</td>
                      <td style={{ padding: 2, width: 50 }}>{row.rem && <Cell value={row.rem.total_quantity} type="num" align="right" onSave={(v) => numGuard('total_quantity', v) && saveR(row.rem.id, { total_quantity: numOrNull(v) })} />}</td>
                      <td style={{ padding: 2, width: 50 }}>{row.rem && <Cell value={row.rem.returned_to_facility} type="toggle" onSave={(v) => saveR(row.rem.id, { returned_to_facility: v })} />}</td>
                      {canEdit && <td style={{ padding: 2, width: 60, textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {orphan && <button title="Create the missing side and pair them" onClick={() => pairOrphan(row)} style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 11, marginRight: 6 }}>↔ Pair</button>}
                        <button title="Delete" onClick={() => delRow(row)} style={{ color: 'var(--bad)' }}>🗑</button>
                      </td>}
                    </tr>
                  )})}
                </tbody>
              </table></div>
            </>}
          </div>
        )
      })}
    </div>
  )
}
