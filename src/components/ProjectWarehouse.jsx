import { useState } from 'react'
import { useLiveQuery } from '../lib/db'
import { Empty } from './ui'

// Sprint 8E — project Warehouse tab. Reads the stock-ledger rollup views:
// project_warehouse_stock (per variant: received / consumed / on-hand) and
// project_category_stock (per category: is_short). Grouped by ESM, one row per
// variant, with a low-stock badge when the variant's category is short.
const ESM_ORDER = (c) => ({ ESM1: 1, ESM2: 2, ESM3: 3 }[c] || 9)
const num = (v) => (v == null ? 0 : Number(v))

export default function ProjectWarehouse({ projectId }) {
  const { rows: stock, loading } = useLiveQuery('project_warehouse_stock',
    (q) => q.select('*').eq('project_id', projectId), [projectId])
  const { rows: catStock } = useLiveQuery('project_category_stock',
    (q) => q.select('*').eq('project_id', projectId), [projectId])
  const [esm, setEsm] = useState('all')

  const shortByCat = {}
  catStock.forEach((c) => { shortByCat[c.category_id] = c.is_short })

  const esmsPresent = [...new Set(stock.map((r) => r.esm_code).filter(Boolean))].sort((a, b) => ESM_ORDER(a) - ESM_ORDER(b))
  const rows = stock
    .filter((r) => esm === 'all' || r.esm_code === esm)
    .sort((a, b) => ESM_ORDER(a.esm_code) - ESM_ORDER(b.esm_code)
      || (a.category_code || '').localeCompare(b.category_code || '')
      || (a.brand || '').localeCompare(b.brand || ''))

  const th = { padding: '9px 8px', fontWeight: 600, textAlign: 'left' }
  const tdR = { padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Warehouse — stock on hand</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', ...esmsPresent].map((k) => (
            <button key={k} onClick={() => setEsm(k)} style={{ padding: '4px 11px', borderRadius: 20, fontSize: 11.5, fontWeight: 600, border: '1px solid ' + (esm === k ? 'var(--accent)' : 'var(--line)'), background: esm === k ? '#EFF6FF' : '#fff', color: esm === k ? 'var(--accent)' : 'var(--text-3)' }}>{k === 'all' ? 'All ESM' : k}</button>
          ))}
        </div>
      </div>
      {loading && !stock.length ? <Empty icon="materials">Loading…</Empty>
        : rows.length === 0 ? <Empty icon="materials">No stock recorded yet. Approved deliveries appear here.</Empty> : (
          <div className="ies-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
              <thead><tr style={{ color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
                <th style={th}>ESM</th><th style={th}>CATEGORY</th><th style={th}>VARIANT (BRAND)</th>
                <th style={{ ...th, textAlign: 'right' }}>RECEIVED</th><th style={{ ...th, textAlign: 'right' }}>CONSUMED</th>
                <th style={{ ...th, textAlign: 'right' }}>ON-HAND</th><th style={th} />
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const short = shortByCat[r.category_id]
                  return (
                    <tr key={r.variant_id} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '10px 8px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>{r.esm_code || '—'}</td>
                      <td style={{ padding: '10px 8px' }}><span className="ies-ellipsis" title={r.category_code}>{r.category_name || r.category_code || '—'}</span></td>
                      <td style={{ padding: '10px 8px' }}><span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>{r.variant_code}</span> · {r.brand || '—'}</td>
                      <td style={tdR}>{num(r.received)}</td>
                      <td style={{ ...tdR, color: 'var(--text-3)' }}>{num(r.consumed)}</td>
                      <td style={{ ...tdR, fontWeight: 700, color: num(r.qty_on_hand) <= 0 ? 'var(--bad)' : 'var(--text)' }}>{num(r.qty_on_hand)}</td>
                      <td style={{ padding: '10px 8px' }}>{short && <span title="On-hand is below the remaining planned quantity for this category" style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '2px 7px' }}>⚠ LOW</span>}</td>
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
