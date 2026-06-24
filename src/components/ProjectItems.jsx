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
  const refreshAll = () => { refI(); refR(); refP() }

  const insById = Object.fromEntries(installed.map((r) => [r.id, r]))
  const remById = Object.fromEntries(removed.map((r) => [r.id, r]))
  const pairedI = new Set(pairs.map((p) => p.installed_item_id).filter(Boolean))
  const pairedR = new Set(pairs.map((p) => p.removed_item_id).filter(Boolean))

  const saveI = async (id, patch) => { const { error } = await bgUpdate('project_installed_items', id, patch); if (!error) refI() }
  const saveR = async (id, patch) => { const { error } = await bgUpdate('project_removed_items', id, patch); if (!error) refR() }
  const numGuard = (k, v) => (k === 'total_quantity' && v !== '' && !(Number(v) > 0) ? (toast('Quantity must be > 0', 'err'), false) : true)

  const addPair = async (esm) => {
    const { data: di } = await bgInsert('project_installed_items', { project_id: projectId, esm_code: esm, capacity_unit: 'kBTU', efficiency_unit: 'SEER', total_quantity: 1 })
    const { data: dr } = await bgInsert('project_removed_items', { project_id: projectId, esm_code: esm, capacity_unit: 'kBTU', efficiency_unit: 'SEER', total_quantity: 1, returned_to_facility: true })
    if (di?.[0] && dr?.[0]) await bgInsert('project_item_pairs', { project_id: projectId, esm_code: esm, installed_item_id: di[0].id, removed_item_id: dr[0].id })
    refreshAll()
  }
  const addStandalone = async (esm, side) => {
    if (side === 'installed') await bgInsert('project_installed_items', { project_id: projectId, esm_code: esm, capacity_unit: 'kBTU', efficiency_unit: 'SEER', total_quantity: 1 })
    else await bgInsert('project_removed_items', { project_id: projectId, esm_code: esm, capacity_unit: 'kBTU', efficiency_unit: 'SEER', total_quantity: 1, returned_to_facility: true })
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
  const importCsv = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const wb = read(await file.arrayBuffer()); const data = utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
    let n = 0
    for (const r of data) {
      const esm = r.esm_code || null
      const hasI = r.installed_description || r.installed_qty, hasR = r.removed_description || r.removed_qty
      let iId = null, rId = null
      if (hasI) { const { data: d } = await bgInsert('project_installed_items', { project_id: projectId, esm_code: esm, item_description: r.installed_description || null, model_code: r.installed_model || null, capacity_value: numOrNull(r.installed_capacity), capacity_unit: r.installed_capacity_unit || 'kBTU', efficiency_value: numOrNull(r.installed_efficiency), efficiency_unit: r.installed_efficiency_unit || 'SEER', total_quantity: numOrNull(r.installed_qty) }); iId = d?.[0]?.id }
      if (hasR) { const { data: d } = await bgInsert('project_removed_items', { project_id: projectId, esm_code: esm, item_description: r.removed_description || null, capacity_value: numOrNull(r.removed_capacity), capacity_unit: r.removed_capacity_unit || 'kBTU', efficiency_value: numOrNull(r.removed_efficiency), efficiency_unit: r.removed_efficiency_unit || 'SEER', total_quantity: numOrNull(r.removed_qty), returned_to_facility: ['yes', 'true', '1'].includes(String(r.removed_returned).toLowerCase()) }); rId = d?.[0]?.id }
      if (iId && rId) await bgInsert('project_item_pairs', { project_id: projectId, esm_code: esm, installed_item_id: iId, removed_item_id: rId, notes: r.pair_note || null })
      if (hasI || hasR) n++
    }
    e.target.value = ''; refreshAll(); toast(`Imported ${n} row${n === 1 ? '' : 's'}`)
  }

  if (esms.length === 0) return <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}><Empty icon="materials">Add ESMs to capture installed & removed items.</Empty></div>

  const th = (t) => <th style={{ padding: '6px 7px', fontWeight: 600, fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{t}</th>
  const layout = project?.coc_layout

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Items &amp; Replacements</div>
          {layout && <span title={layout === 'scattered' ? 'Scattered: buildings far apart → per-building COCs' : 'Concatenated: one site → project-wide COCs'} style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, color: 'var(--accent)', background: '#EFF6FF', cursor: 'help' }}>Layout: {layout === 'scattered' ? 'Scattered' : 'Concatenated'} ⓘ</span>}
        </div>
        {canEdit && <div style={{ display: 'flex', gap: 8 }}>
          <Btn style={{ padding: '6px 10px', fontSize: 12 }} onClick={exportCsv}>Export CSV</Btn>
          <label className="ies-hover" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Import CSV<input type="file" accept=".csv,.xlsx" onChange={importCsv} style={{ display: 'none' }} /></label>
        </div>}
      </div>
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
              {canEdit && <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <button onClick={() => addPair(e.code)} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>+ Add Pair</button>
                <button onClick={() => addStandalone(e.code, 'installed')} style={{ fontSize: 12, fontWeight: 700, color: 'var(--ok)' }}>+ Standalone Installed</button>
                <button onClick={() => addStandalone(e.code, 'removed')} style={{ fontSize: 12, fontWeight: 700, color: 'var(--bad)' }}>+ Standalone Removed</button>
              </div>}
              <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
                <thead><tr style={{ textAlign: 'left' }}>
                  {th('INSTALLED — DESC')}{th('MODEL')}{th('CAP')}{th('U')}{th('EFF')}{th('U')}{th('QTY')}
                  {th('↔ NOTE')}
                  {th('REMOVED — DESC')}{th('CAP')}{th('U')}{th('EFF')}{th('U')}{th('QTY')}{th('RET')}{canEdit && th('')}
                </tr></thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={16} style={{ padding: 10, color: 'var(--text-3)', fontSize: 12 }}>No items yet.</td></tr>}
                  {rows.map((row) => (
                    <tr key={row.key} style={{ borderTop: '1px solid var(--line)', background: row.inst && row.rem ? '#fff' : '#FCFCFD' }}>
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
                      {canEdit && <td style={{ padding: 2, width: 28, textAlign: 'center' }}><button title="Delete" onClick={() => delRow(row)} style={{ color: 'var(--bad)' }}>🗑</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </>}
          </div>
        )
      })}
    </div>
  )
}
