import { useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { Btn, Modal, Empty } from '../ui'
import Icon from '../Icon'
import { toast } from '../../lib/toast'
import { num, fmtDateTime } from '../../lib/format'
import { SURVEY_CATEGORIES } from '../../lib/constants'

const CAT_LABEL = Object.fromEntries(SURVEY_CATEGORIES)
const PAGE = 100
const ctrl = { padding: '8px 10px', border: '1px solid var(--line-ctrl)', borderRadius: 6, background: '#fff', fontSize: 12.5 }

export default function SurveyEntriesTable({ entries, buildings, canManageAll, currentUserId, onEdit }) {
  const [search, setSearch] = useState('')
  const [building, setBuilding] = useState('all')
  const [category, setCategory] = useState('all')
  const [page, setPage] = useState(0)
  const [sel, setSel] = useState(() => new Set())
  const [del, setDel] = useState(null)      // single row pending delete
  const [bulkDel, setBulkDel] = useState(false)
  const [busy, setBusy] = useState(false)

  const canTouch = (e) => canManageAll || e.created_by === currentUserId
  const reset = (fn) => (...a) => { fn(...a); setPage(0) }

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return entries.filter((e) => {
      if (building !== 'all' && e.building_id !== building) return false
      if (category !== 'all' && e.category !== category) return false
      if (s) {
        const hay = [e.building?.code, e.building?.name, e.room_name, e.floor, e.make, e.model, e.equipment_type, e.remarks].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [entries, search, building, category])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE))
  const pageSafe = Math.min(page, pageCount - 1)
  const rows = filtered.slice(pageSafe * PAGE, pageSafe * PAGE + PAGE)

  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allOnPage = rows.length > 0 && rows.every((r) => sel.has(r.id))
  const toggleAll = () => setSel((p) => { const n = new Set(p); if (allOnPage) rows.forEach((r) => n.delete(r.id)); else rows.forEach((r) => n.add(r.id)); return n })

  const doDelete = async (ids) => {
    setBusy(true)
    const { error } = await supabase.from('survey_entries').delete().in('id', ids)
    setBusy(false)
    if (error) { toast("Couldn't delete — " + error.message, 'err'); return }
    toast(`${ids.length} ${ids.length === 1 ? 'entry' : 'entries'} deleted`)
    setSel(new Set()); setDel(null); setBulkDel(false)
  }

  const COLS = ['', 'BLDG', 'FLOOR', 'ROOM', 'TYPE', 'CAT', 'EQUIP', 'MAKE', 'MODEL', 'SIZE', 'TR', 'W', 'QTY', 'INV', 'AGE', 'REMARKS', 'BY', 'WHEN']

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }}><Icon name="search" size={15} /></span>
          <input value={search} onChange={reset((e) => setSearch(e.target.value))} placeholder="Search room, make, model…" style={{ ...ctrl, width: '100%', paddingLeft: 32, boxSizing: 'border-box' }} />
        </div>
        <select style={ctrl} value={building} onChange={reset((e) => setBuilding(e.target.value))}>
          <option value="all">All buildings</option>
          {buildings.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
        </select>
        <select style={ctrl} value={category} onChange={reset((e) => setCategory(e.target.value))}>
          <option value="all">All categories</option>
          {SURVEY_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {canManageAll && sel.size > 0 && <Btn variant="danger" icon="x" onClick={() => setBulkDel(true)}>Delete {sel.size}</Btn>}
      </div>

      {filtered.length === 0 ? <Empty icon="box">No entries match.</Empty> : (
        <>
          <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 900 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
              {COLS.map((c, i) => <th key={i} style={{ padding: '7px 6px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {i === 0 ? (canManageAll ? <input type="checkbox" checked={allOnPage} onChange={toggleAll} /> : '') : c}
              </th>)}
              <th style={{ padding: '7px 6px', fontWeight: 600, textAlign: 'right' }}>·</th>
            </tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} style={{ borderTop: '1px solid var(--line)', background: sel.has(e.id) ? '#F5EEDF' : undefined }}>
                  <td style={{ padding: '6px' }}>{canManageAll && <input type="checkbox" checked={sel.has(e.id)} onChange={() => toggle(e.id)} />}</td>
                  <td style={{ padding: '6px', fontFamily: 'var(--mono)', fontSize: 10.5, whiteSpace: 'nowrap' }}>{e.building?.code || '—'}</td>
                  <td style={{ padding: '6px' }}>{e.floor || '—'}</td>
                  <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>{e.room_name || '—'}</td>
                  <td style={{ padding: '6px', color: 'var(--text-3)' }}>{e.room_type || '—'}</td>
                  <td style={{ padding: '6px' }}>{CAT_LABEL[e.category] || e.category}</td>
                  <td style={{ padding: '6px' }}>{e.equipment_type || '—'}</td>
                  <td style={{ padding: '6px' }}>{e.make || '—'}</td>
                  <td style={{ padding: '6px' }}>{e.model || '—'}</td>
                  <td style={{ padding: '6px' }}>{e.size_category || '—'}</td>
                  <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{e.tr != null ? num(e.tr) : '—'}</td>
                  <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{e.wattage != null ? num(e.wattage) : '—'}</td>
                  <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{num(e.qty)}</td>
                  <td style={{ padding: '6px' }}>{e.inverter == null ? '—' : e.inverter ? 'Y' : 'N'}</td>
                  <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{e.age_years != null ? num(e.age_years) : '—'}</td>
                  <td style={{ padding: '6px', color: 'var(--text-3)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.remarks || ''}>{e.remarks || '—'}</td>
                  <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>{e.author?.full_name || '—'}</td>
                  <td style={{ padding: '6px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDateTime(e.created_at)}</td>
                  <td style={{ padding: '6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {canTouch(e) && <>
                      <button className="ies-hover" title="Edit" onClick={() => onEdit(e)} style={{ padding: 4, borderRadius: 6, color: 'var(--text-3)' }}><Icon name="edit" size={13} /></button>
                      <button className="ies-hover" title="Delete" onClick={() => setDel(e)} style={{ padding: 4, borderRadius: 6, color: 'var(--bad)' }}><Icon name="x" size={14} /></button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>{num(filtered.length)} entries · showing {pageSafe * PAGE + 1}–{Math.min(filtered.length, (pageSafe + 1) * PAGE)}</span>
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

      {del && (
        <Modal open width={420} title="Delete entry?" onClose={() => setDel(null)}
          footer={<><Btn onClick={() => setDel(null)}>Cancel</Btn><Btn variant="danger" disabled={busy} onClick={() => doDelete([del.id])}>{busy ? 'Deleting…' : 'Delete'}</Btn></>}>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>Delete the <b>{CAT_LABEL[del.category] || del.category}</b> entry in <b>{del.building?.code} · {del.room_name || '—'}</b>? This can't be undone.</div>
        </Modal>
      )}
      {bulkDel && (
        <Modal open width={420} title={`Delete ${sel.size} entries?`} onClose={() => setBulkDel(false)}
          footer={<><Btn onClick={() => setBulkDel(false)}>Cancel</Btn><Btn variant="danger" disabled={busy} onClick={() => doDelete([...sel])}>{busy ? 'Deleting…' : `Delete ${sel.size}`}</Btn></>}>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>Permanently delete the {sel.size} selected survey entries? This can't be undone.</div>
        </Modal>
      )}
    </div>
  )
}
