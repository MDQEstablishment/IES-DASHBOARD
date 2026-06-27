import { useState } from 'react'
import { useLiveQuery } from '../lib/db'
import { Empty } from './ui'

// Sprint 8E — Main Warehouse rollup (top-bar Materials page). Total stock per
// variant across ALL projects, with an expandable per-project breakdown. Reads
// the main_warehouse_stock + project_warehouse_stock views.
const ESM_ORDER = (c) => ({ ESM1: 1, ESM2: 2, ESM3: 3 }[c] || 9)
const num = (v) => (v == null ? 0 : Number(v))

export default function MainWarehouse() {
  const { rows: main, loading } = useLiveQuery('main_warehouse_stock', (q) => q.select('*'))
  const { rows: byProj } = useLiveQuery('project_warehouse_stock', (q) => q.select('variant_id,project_id,qty_on_hand'))
  const { rows: projects } = useLiveQuery('projects', (q) => q.select('id,code').is('deleted_at', null))
  const [open, setOpen] = useState(null)
  const [esm, setEsm] = useState('all')

  const projCode = Object.fromEntries(projects.map((p) => [p.id, p.code]))
  const breakdown = {}
  byProj.forEach((r) => { (breakdown[r.variant_id] = breakdown[r.variant_id] || []).push(r) })

  const esmsPresent = [...new Set(main.map((r) => r.esm_code).filter(Boolean))].sort((a, b) => ESM_ORDER(a) - ESM_ORDER(b))
  const rows = main
    .filter((r) => num(r.qty_on_hand) !== 0 || true)
    .filter((r) => esm === 'all' || r.esm_code === esm)
    .sort((a, b) => ESM_ORDER(a.esm_code) - ESM_ORDER(b.esm_code) || (a.category_code || '').localeCompare(b.category_code || '') || (a.brand || '').localeCompare(b.brand || ''))

  const th = { padding: '9px 8px', fontWeight: 600, textAlign: 'left' }
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Main Warehouse</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Total stock on hand across all projects. Click a row for the per-project breakdown.</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', ...esmsPresent].map((k) => (
            <button key={k} onClick={() => setEsm(k)} style={{ padding: '4px 11px', borderRadius: 20, fontSize: 11.5, fontWeight: 600, border: '1px solid ' + (esm === k ? 'var(--accent)' : 'var(--line)'), background: esm === k ? '#EFF6FF' : '#fff', color: esm === k ? 'var(--accent)' : 'var(--text-3)' }}>{k === 'all' ? 'All ESM' : k}</button>
          ))}
        </div>
      </div>
      {loading && !main.length ? <Empty icon="materials">Loading…</Empty>
        : rows.length === 0 ? <Empty icon="materials">No stock recorded yet across any project.</Empty> : (
          <div className="ies-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 680 }}>
              <thead><tr style={{ color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
                <th style={th}>ESM</th><th style={th}>CATEGORY</th><th style={th}>VARIANT (BRAND)</th>
                <th style={{ ...th, textAlign: 'right' }}>TOTAL IN STOCK</th><th style={th} />
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const bd = (breakdown[r.variant_id] || []).filter((x) => num(x.qty_on_hand) !== 0)
                  const isOpen = open === r.variant_id
                  return (
                    <>
                      <tr key={r.variant_id} style={{ borderTop: '1px solid var(--line)', cursor: 'pointer' }} onClick={() => setOpen(isOpen ? null : r.variant_id)}>
                        <td style={{ padding: '10px 8px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>{r.esm_code || '—'}</td>
                        <td style={{ padding: '10px 8px' }}><span className="ies-ellipsis" title={r.category_code}>{r.category_name || r.category_code || '—'}</span></td>
                        <td style={{ padding: '10px 8px' }}><span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>{r.variant_code}</span> · {r.brand || '—'}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{num(r.qty_on_hand)}</td>
                        <td style={{ padding: '10px 8px', color: 'var(--text-3)', fontSize: 11 }}>{bd.length} project{bd.length === 1 ? '' : 's'} {isOpen ? '▲' : '▼'}</td>
                      </tr>
                      {isOpen && bd.map((x) => (
                        <tr key={r.variant_id + x.project_id} style={{ background: '#F8FAFC' }}>
                          <td />
                          <td colSpan={2} style={{ padding: '6px 8px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>{projCode[x.project_id] || x.project_id?.slice(0, 8)}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{num(x.qty_on_hand)}</td><td />
                        </tr>
                      ))}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}
