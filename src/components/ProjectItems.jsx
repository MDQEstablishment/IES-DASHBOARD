import { useState } from 'react'
import { useLiveQuery, bgInsert, bgUpdate, bgDelete } from '../lib/db'
import { useAuth } from '../rbac'
import { Empty, Btn } from './ui'
import { toast } from '../lib/toast'
import { read, utils, writeFileXLSX } from 'xlsx'

const EDIT_ROLES = ['admin', 'pmo', 'projm', 'proje']
const CAP_UNITS = ['kBTU', 'kW', 'W', 'lm']
const EFF_UNITS = ['SEER', 'EER', 'COP', 'lm/W']
const inp = { padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, background: '#fff', width: '100%' }
const numOrNull = (v) => (v === '' || v == null ? null : Number(v))
const blankInstalled = (esm) => ({ esm_code: esm, item_description: '', model_code: '', capacity_value: '', capacity_unit: 'kBTU', efficiency_value: '', efficiency_unit: 'SEER', total_quantity: '', notes: '' })
const blankRemoved = (esm) => ({ esm_code: esm, item_description: '', capacity_value: '', capacity_unit: 'kBTU', efficiency_value: '', efficiency_unit: 'SEER', total_quantity: '', returned_to_facility: true, notes: '' })

export default function ProjectItems({ projectId }) {
  const { role } = useAuth()
  const canEdit = EDIT_ROLES.includes(role)
  const { rows: installed, refetch: refInstalled } = useLiveQuery('project_installed_items', (q) => q.select('*').eq('project_id', projectId).order('created_at'), [projectId])
  const { rows: removed, refetch: refRemoved } = useLiveQuery('project_removed_items', (q) => q.select('*').eq('project_id', projectId).order('created_at'), [projectId])
  const { rows: pEsms } = useLiveQuery('project_esms', (q) => q.select('custom_name,ordinal,esm:esms(code,name)').eq('project_id', projectId).order('ordinal'), [projectId])
  const esms = pEsms.filter((pe) => pe.esm).map((pe) => ({ code: pe.esm.code, name: pe.custom_name || pe.esm.name }))
  const [open, setOpen] = useState({}) // esm_code -> bool (accordion)
  const [edit, setEdit] = useState(null) // { table, id|'new', esm_code, fields }

  const tableOf = (t) => (t === 'installed' ? 'project_installed_items' : 'project_removed_items')
  const refOf = (t) => (t === 'installed' ? refInstalled : refRemoved)

  const startAdd = (table, esm) => setEdit({ table, id: 'new', esm_code: esm, fields: table === 'installed' ? blankInstalled(esm) : blankRemoved(esm) })
  const startEdit = (table, row) => setEdit({ table, id: row.id, esm_code: row.esm_code, fields: { ...row } })
  const setF = (k, v) => setEdit((e) => ({ ...e, fields: { ...e.fields, [k]: v } }))

  const save = async () => {
    const f = edit.fields, isInstalled = edit.table === 'installed'
    if (!String(f.item_description || '').trim()) { toast('Description is required', 'err'); return }
    if (!(Number(f.total_quantity) > 0)) { toast('Total quantity must be greater than 0', 'err'); return }
    if (isInstalled && (numOrNull(f.capacity_value) == null || numOrNull(f.efficiency_value) == null)) { toast('Capacity & efficiency are required for installed items', 'err'); return }
    const payload = {
      project_id: projectId, esm_code: edit.esm_code, item_description: f.item_description.trim(),
      capacity_value: numOrNull(f.capacity_value), capacity_unit: f.capacity_unit || null,
      efficiency_value: numOrNull(f.efficiency_value), efficiency_unit: f.efficiency_unit || null,
      total_quantity: numOrNull(f.total_quantity), notes: f.notes || null,
      ...(isInstalled ? { model_code: f.model_code || null } : { returned_to_facility: !!f.returned_to_facility }),
    }
    const { error } = edit.id === 'new'
      ? await bgInsert(tableOf(edit.table), payload)
      : await bgUpdate(tableOf(edit.table), edit.id, payload)
    if (!error) { setEdit(null); refOf(edit.table)() }
  }
  const remove = async (table, id) => { const { error } = await bgDelete(tableOf(table), id); if (!error) refOf(table)() }

  const exportCsv = () => {
    const ins = installed.map((r) => ({ kind: 'installed', esm_code: r.esm_code, item_description: r.item_description, model_code: r.model_code, capacity_value: r.capacity_value, capacity_unit: r.capacity_unit, efficiency_value: r.efficiency_value, efficiency_unit: r.efficiency_unit, total_quantity: r.total_quantity, returned_to_facility: '', notes: r.notes }))
    const rem = removed.map((r) => ({ kind: 'removed', esm_code: r.esm_code, item_description: r.item_description, model_code: '', capacity_value: r.capacity_value, capacity_unit: r.capacity_unit, efficiency_value: r.efficiency_value, efficiency_unit: r.efficiency_unit, total_quantity: r.total_quantity, returned_to_facility: r.returned_to_facility, notes: r.notes }))
    const ws = utils.json_to_sheet([...ins, ...rem])
    const wb = utils.book_new(); utils.book_append_sheet(wb, ws, 'Items')
    writeFileXLSX(wb, 'project-items.csv', { bookType: 'csv' })
  }
  const importCsv = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const wb = read(await file.arrayBuffer())
    const data = utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
    let n = 0
    for (const r of data) {
      const kind = String(r.kind || '').toLowerCase()
      if (!r.item_description || !(Number(r.total_quantity) > 0)) continue
      const base = { project_id: projectId, esm_code: r.esm_code || null, item_description: String(r.item_description).trim(), capacity_value: numOrNull(r.capacity_value), capacity_unit: r.capacity_unit || null, efficiency_value: numOrNull(r.efficiency_value), efficiency_unit: r.efficiency_unit || null, total_quantity: numOrNull(r.total_quantity), notes: r.notes || null }
      if (kind === 'removed') { const { error } = await bgInsert('project_removed_items', { ...base, returned_to_facility: ['yes', 'true', '1'].includes(String(r.returned_to_facility).toLowerCase()) }); if (!error) n++ }
      else { const { error } = await bgInsert('project_installed_items', { ...base, model_code: r.model_code || null }); if (!error) n++ }
    }
    e.target.value = ''; refInstalled(); refRemoved()
    toast(`Imported ${n} item${n === 1 ? '' : 's'}`)
  }

  if (esms.length === 0) return <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}><Empty icon="materials">Add ESMs to this project to capture installed & removed items.</Empty></div>

  const editingCell = (k, type = 'text', options) => {
    if (type === 'select') return <select style={inp} value={edit.fields[k] ?? ''} onChange={(e) => setF(k, e.target.value)}>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select>
    if (type === 'toggle') return <button onClick={() => setF(k, !edit.fields[k])} style={{ ...inp, cursor: 'pointer', fontWeight: 700, color: edit.fields[k] ? 'var(--ok)' : 'var(--text-3)' }}>{edit.fields[k] ? 'Yes' : 'No'}</button>
    return <input lang="en" inputMode={type === 'num' ? 'numeric' : undefined} style={inp} value={edit.fields[k] ?? ''} onChange={(e) => setF(k, e.target.value)} />
  }

  const renderTable = (table, esm, rows) => {
    const isInstalled = table === 'installed'
    const editingHere = edit && edit.table === table && edit.esm_code === esm
    const cols = isInstalled
      ? ['#', 'Description', 'Model', 'Capacity', 'Efficiency', 'Qty', 'Notes', '']
      : ['#', 'Description', 'Capacity', 'Efficiency', 'Qty', 'Returned', 'Notes', '']
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 12.5, color: isInstalled ? 'var(--ok)' : 'var(--bad)' }}>{isInstalled ? 'Installed Items (new)' : 'Removed Items (old)'}</div>
          {canEdit && <button onClick={() => startAdd(table, esm)} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>+ Add row</button>}
        </div>
        <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 760 }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 9.5, fontFamily: 'var(--mono)' }}>{cols.map((c, i) => <th key={i} style={{ padding: '6px 8px', fontWeight: 600 }}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 && !(editingHere && edit.id === 'new') && <tr><td colSpan={cols.length} style={{ padding: 10, color: 'var(--text-3)' }}>No rows yet.</td></tr>}
            {rows.map((r, i) => {
              const isEd = editingHere && edit.id === r.id
              return (
                <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '6px 8px', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>{i + 1}</td>
                  {isEd ? <>
                    <td style={{ padding: 4 }}>{editingCell('item_description')}</td>
                    {isInstalled && <td style={{ padding: 4 }}>{editingCell('model_code')}</td>}
                    <td style={{ padding: 4, display: 'flex', gap: 4 }}>{editingCell('capacity_value', 'num')}{editingCell('capacity_unit', 'select', CAP_UNITS)}</td>
                    <td style={{ padding: 4, display: 'flex', gap: 4 }}>{editingCell('efficiency_value', 'num')}{editingCell('efficiency_unit', 'select', EFF_UNITS)}</td>
                    <td style={{ padding: 4, width: 70 }}>{editingCell('total_quantity', 'num')}</td>
                    {!isInstalled && <td style={{ padding: 4, width: 70 }}>{editingCell('returned_to_facility', 'toggle')}</td>}
                    <td style={{ padding: 4 }}>{editingCell('notes')}</td>
                    <td style={{ padding: 4, whiteSpace: 'nowrap' }}><button onClick={save} style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 12, marginRight: 8 }}>Save</button><button onClick={() => setEdit(null)} style={{ color: 'var(--text-3)', fontSize: 12 }}>Cancel</button></td>
                  </> : <>
                    <td style={{ padding: '6px 8px', fontWeight: 600 }}>{r.item_description || '—'}</td>
                    {isInstalled && <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{r.model_code || '—'}</td>}
                    <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)' }}>{r.capacity_value != null ? `${r.capacity_value} ${r.capacity_unit || ''}` : '—'}</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)' }}>{r.efficiency_value != null ? `${r.efficiency_value} ${r.efficiency_unit || ''}` : '—'}</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)', fontWeight: 700 }}>{r.total_quantity ?? '—'}</td>
                    {!isInstalled && <td style={{ padding: '6px 8px', fontWeight: 700, color: r.returned_to_facility ? 'var(--ok)' : 'var(--text-3)' }}>{r.returned_to_facility ? 'Yes' : 'No'}</td>}
                    <td style={{ padding: '6px 8px', color: 'var(--text-3)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.notes || ''}>{r.notes || '—'}</td>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{canEdit && <><button title="Edit" onClick={() => startEdit(table, r)} style={{ marginRight: 8 }}>✏</button><button title="Remove" onClick={() => remove(table, r.id)} style={{ color: 'var(--bad)' }}>🗑</button></>}</td>
                  </>}
                </tr>
              )
            })}
            {editingHere && edit.id === 'new' && (
              <tr style={{ borderTop: '1px solid var(--line)', background: '#F8FAFC' }}>
                <td style={{ padding: '6px 8px', color: 'var(--text-3)' }}>new</td>
                <td style={{ padding: 4 }}>{editingCell('item_description')}</td>
                {isInstalled && <td style={{ padding: 4 }}>{editingCell('model_code')}</td>}
                <td style={{ padding: 4, display: 'flex', gap: 4 }}>{editingCell('capacity_value', 'num')}{editingCell('capacity_unit', 'select', CAP_UNITS)}</td>
                <td style={{ padding: 4, display: 'flex', gap: 4 }}>{editingCell('efficiency_value', 'num')}{editingCell('efficiency_unit', 'select', EFF_UNITS)}</td>
                <td style={{ padding: 4, width: 70 }}>{editingCell('total_quantity', 'num')}</td>
                {!isInstalled && <td style={{ padding: 4, width: 70 }}>{editingCell('returned_to_facility', 'toggle')}</td>}
                <td style={{ padding: 4 }}>{editingCell('notes')}</td>
                <td style={{ padding: 4, whiteSpace: 'nowrap' }}><button onClick={save} style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 12, marginRight: 8 }}>Save</button><button onClick={() => setEdit(null)} style={{ color: 'var(--text-3)', fontSize: 12 }}>Cancel</button></td>
              </tr>
            )}
          </tbody>
        </table></div>
      </div>
    )
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Items & Replacements</div>
        {canEdit && <div style={{ display: 'flex', gap: 8 }}>
          <Btn style={{ padding: '6px 10px', fontSize: 12 }} onClick={exportCsv}>Export CSV</Btn>
          <label className="ies-hover" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Import CSV<input type="file" accept=".csv,.xlsx" onChange={importCsv} style={{ display: 'none' }} /></label>
        </div>}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>Project-level equipment counts per ESM. These totals appear on every COC for the ESM (the COC certifies they were installed across the buildings it covers).</div>
      {esms.map((e) => {
        const ins = installed.filter((r) => r.esm_code === e.code)
        const rem = removed.filter((r) => r.esm_code === e.code)
        const isOpen = open[e.code] ?? (esms.length <= 2)
        return (
          <div key={e.code} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <button onClick={() => setOpen((o) => ({ ...o, [e.code]: !isOpen }))} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', marginBottom: isOpen ? 10 : 0 }}>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{e.code}</span>
              <span style={{ fontWeight: 600 }}>{e.name}</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>{ins.length} installed · {rem.length} removed · {isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && <>{renderTable('installed', e.code, ins)}{renderTable('removed', e.code, rem)}</>}
          </div>
        )
      })}
    </div>
  )
}
