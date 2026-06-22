import { useState } from 'react'
import { useLiveQuery, bgInsert, bgUpdate, bgDelete } from '../lib/db'
import { useAuth } from '../rbac'
import { Empty, Btn } from './ui'
import DateInput from './DateInput'
import { fmtDate } from '../lib/format'

const DSTATUS = {
  pending: ['Pending', '#64748B', '#F1F5F9'], in_transit: ['In Transit', '#2563EB', '#EFF6FF'],
  delivered: ['Delivered', '#10B981', '#ECFDF5'], rejected: ['Rejected', '#EF4444', '#FEF2F2'],
}
// Plain-English lifecycle help shown as a tooltip on each status pill (1.5)
const DDESC = {
  pending: 'Supplier confirmed the order but it has not shipped yet.',
  in_transit: 'Shipped — on its way, awaiting on-site receipt.',
  delivered: 'Received on site and checked in against the submittal.',
  rejected: 'Delivery refused — wrong, damaged, or failed inspection.',
}
const WRITE_ROLES = ['admin', 'pmo', 'projm', 'progm', 'procm', 'proco']
const inp = { padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 12.5, background: '#fff' }

export default function MaterialDeliveries({ projectId, buildings = [] }) {
  const { user, role } = useAuth()
  const canWrite = WRITE_ROLES.includes(role)
  const { rows, refetch } = useLiveQuery('material_deliveries',
    (q) => q.select('*,building:buildings(code)').eq('project_id', projectId).order('scheduled_date', { ascending: true }), [projectId])
  const [add, setAdd] = useState(null) // draft row or null

  const startAdd = () => setAdd({ material_name: '', building_id: '', scheduled_date: '', status: 'pending', notes: '' })
  const saveAdd = async () => {
    if (!add.material_name.trim()) return
    const { error } = await bgInsert('material_deliveries', {
      project_id: projectId, material_name: add.material_name.trim(), building_id: add.building_id || null,
      scheduled_date: add.scheduled_date || null, status: add.status, notes: add.notes || null, created_by: user.id,
    }, { okMsg: 'Delivery added' })
    if (!error) { setAdd(null); refetch() }
  }
  // Silent-success row mutations; bgUpdate/bgDelete still surface errors via toast.
  // refetch() guarantees the UI reflects the change immediately (not realtime-dependent).
  const patchRow = async (id, patch) => { const { error } = await bgUpdate('material_deliveries', id, patch); if (!error) refetch() }
  const removeRow = async (id) => { const { error } = await bgDelete('material_deliveries', id); if (!error) refetch() }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Materials Delivery</div>
        {canWrite && <Btn icon="plus" style={{ padding: '7px 11px', fontSize: 12 }} onClick={startAdd}>Add delivery</Btn>}
      </div>
      {rows.length === 0 && !add ? <Empty icon="box">No deliveries scheduled.</Empty> : (
        <div className="ies-table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
              <th style={{ padding: 8, fontWeight: 600 }}>MATERIAL</th><th style={{ padding: 8, fontWeight: 600 }}>BUILDING</th>
              <th style={{ padding: 8, fontWeight: 600 }}>SCHEDULED</th><th style={{ padding: 8, fontWeight: 600 }}>ACTUAL</th>
              <th style={{ padding: 8, fontWeight: 600 }}>STATUS</th><th style={{ padding: 8, fontWeight: 600 }}>NOTES</th>{canWrite && <th />}
            </tr></thead>
            <tbody>
              {add && (
                <tr style={{ borderTop: '1px solid var(--line)', background: '#F8FAFC' }}>
                  <td style={{ padding: 6 }}><input lang="en" style={{ ...inp, width: 150 }} value={add.material_name} placeholder="Material" onChange={(e) => setAdd({ ...add, material_name: e.target.value })} /></td>
                  <td style={{ padding: 6 }}><select style={inp} value={add.building_id} onChange={(e) => setAdd({ ...add, building_id: e.target.value })}><option value="">All / —</option>{buildings.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select></td>
                  <td style={{ padding: 6 }}><DateInput style={inp} value={add.scheduled_date} onChange={(e) => setAdd({ ...add, scheduled_date: e.target.value })} /></td>
                  <td style={{ padding: 6, color: 'var(--text-3)' }}>—</td>
                  <td style={{ padding: 6 }}><select style={inp} value={add.status} onChange={(e) => setAdd({ ...add, status: e.target.value })}>{Object.keys(DSTATUS).map((s) => <option key={s} value={s}>{DSTATUS[s][0]}</option>)}</select></td>
                  <td style={{ padding: 6 }}><input lang="en" style={{ ...inp, width: 140 }} value={add.notes} placeholder="Notes" onChange={(e) => setAdd({ ...add, notes: e.target.value })} /></td>
                  <td style={{ padding: 6, whiteSpace: 'nowrap' }}><button onClick={saveAdd} style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 12, marginRight: 8 }}>Save</button><button onClick={() => setAdd(null)} style={{ color: 'var(--text-3)', fontSize: 12 }}>Cancel</button></td>
                </tr>
              )}
              {rows.map((r) => {
                const [lbl, col, bg] = DSTATUS[r.status] || DSTATUS.pending
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '9px 8px', fontWeight: 600 }}>{r.material_name}</td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>{r.building?.code || '—'}</td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{r.scheduled_date ? fmtDate(r.scheduled_date) : '—'}</td>
                    <td style={{ padding: '9px 8px' }}>
                      {canWrite
                        ? <DateInput value={r.actual_date || ''} onChange={(e) => e.target.value !== (r.actual_date || '') && patchRow(r.id, { actual_date: e.target.value || null })} style={{ ...inp, padding: '4px 6px' }} />
                        : <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{r.actual_date ? fmtDate(r.actual_date) : '—'}</span>}
                    </td>
                    <td style={{ padding: '9px 8px' }}>
                      {canWrite
                        ? <select title={DDESC[r.status] || ''} value={r.status} onChange={(e) => patchRow(r.id, { status: e.target.value })} style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 6, color: col, background: bg, border: `1px solid ${col}33` }}>{Object.keys(DSTATUS).map((s) => <option key={s} value={s}>{DSTATUS[s][0]}</option>)}</select>
                        : <span title={DDESC[r.status] || ''} style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: col, background: bg, cursor: 'help' }}>{lbl}</span>}
                    </td>
                    <td style={{ padding: '9px 8px', color: 'var(--text-3)', fontSize: 11.5, maxWidth: 200 }}>{r.notes || '—'}</td>
                    {canWrite && <td style={{ padding: '9px 8px' }}><button onClick={() => removeRow(r.id)} style={{ color: 'var(--bad)', fontSize: 11.5, fontWeight: 700 }}>Remove</button></td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
