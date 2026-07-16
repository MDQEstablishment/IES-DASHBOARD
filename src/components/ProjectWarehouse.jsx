import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from '../lib/db'
import { Empty } from './ui'

// Sprint 8E/8H — project Warehouse tab. Reads project_warehouse_stock (per
// variant: received / consumed / on-hand) and project_category_stock (per
// category: is_short). Rows are aggregated by material NAME across brand
// variants; click a row to drill down to the brand-by-brand split. The low-stock
// badge fires when the row's category is short.
const ESM_ORDER = (c) => ({ ESM1: 1, ESM2: 2, ESM3: 3 }[c] || 9)
const num = (v) => (v == null ? 0 : Number(v))

export default function ProjectWarehouse({ projectId }) {
  const { rows: stock, loading } = useLiveQuery('project_warehouse_stock',
    (q) => q.select('*').eq('project_id', projectId), [projectId])
  const { rows: catStock } = useLiveQuery('project_category_stock',
    (q) => q.select('*').eq('project_id', projectId), [projectId])
  const [esm, setEsm] = useState('all')
  const [open, setOpen] = useState(null)

  const shortByCat = {}
  catStock.forEach((c) => { shortByCat[c.category_id] = c.is_short })

  // Aggregate variants by material name (within ESM + category).
  const byName = {}
  stock.forEach((r) => {
    const name = r.variant_name || r.variant_code
    const key = (r.esm_code || '') + '|' + (r.category_id || '') + '|' + name
    const g = byName[key] || (byName[key] = { key, esm_code: r.esm_code, category_id: r.category_id, category_name: r.category_name || r.category_code, name, received: 0, consumed: 0, qty: 0, brands: [] })
    g.received += num(r.received); g.consumed += num(r.consumed); g.qty += num(r.qty_on_hand)
    g.brands.push({ brand: r.brand || '—', code: r.variant_code, received: num(r.received), consumed: num(r.consumed), qty: num(r.qty_on_hand) })
  })

  const esmsPresent = [...new Set(stock.map((r) => r.esm_code).filter(Boolean))].sort((a, b) => ESM_ORDER(a) - ESM_ORDER(b))
  const rows = Object.values(byName)
    .map((g) => ({ ...g, brands: g.brands.sort((a, b) => (a.brand || '').localeCompare(b.brand || '')) }))
    .filter((r) => esm === 'all' || r.esm_code === esm)
    .sort((a, b) => ESM_ORDER(a.esm_code) - ESM_ORDER(b.esm_code)
      || (a.category_name || '').localeCompare(b.category_name || '')
      || a.name.localeCompare(b.name))

  const th = { padding: '9px 8px', fontWeight: 600, textAlign: 'left' }
  const tdR = { padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
      {/* 8K-2b — discoverability hint: materials are global; this tab is per-project stock */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', background: '#FAF8F2', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 12px', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Materials are added globally in the <Link to="/materials" style={{ color: 'var(--accent)', fontWeight: 600 }}>Materials page</Link>. Use this tab to track per-project stock.</div>
        <Link to="/materials" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 6, background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap' }}>+ Add material</Link>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Warehouse — stock on hand</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', ...esmsPresent].map((k) => (
            <button key={k} onClick={() => setEsm(k)} style={{ padding: '4px 11px', borderRadius: 20, fontSize: 11.5, fontWeight: 600, border: '1px solid ' + (esm === k ? 'var(--accent)' : 'var(--line)'), background: esm === k ? '#F5EEDF' : '#fff', color: esm === k ? 'var(--accent)' : 'var(--text-3)' }}>{k === 'all' ? 'All ESM' : k}</button>
          ))}
        </div>
      </div>
      {loading && !stock.length ? <Empty icon="materials">Loading…</Empty>
        : rows.length === 0 ? <Empty icon="materials">No stock recorded yet. Approved deliveries appear here.</Empty> : (
          <div className="ies-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
              <thead><tr style={{ color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
                <th style={th}>ESM</th><th style={th}>CATEGORY</th><th style={th}>MATERIAL</th>
                <th style={{ ...th, textAlign: 'right' }}>RECEIVED</th><th style={{ ...th, textAlign: 'right' }}>CONSUMED</th>
                <th style={{ ...th, textAlign: 'right' }}>ON-HAND</th><th style={th} />
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const short = shortByCat[r.category_id]
                  const multi = r.brands.length > 1
                  const isOpen = open === r.key
                  return (
                    <>
                      <tr key={r.key} style={{ borderTop: '1px solid var(--line)', cursor: multi ? 'pointer' : 'default' }} onClick={() => multi && setOpen(isOpen ? null : r.key)}>
                        <td style={{ padding: '10px 8px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>{r.esm_code || '—'}</td>
                        <td style={{ padding: '10px 8px' }}><span className="ies-ellipsis">{r.category_name || '—'}</span></td>
                        <td style={{ padding: '10px 8px', fontWeight: 600 }}>
                          <span className="ies-ellipsis">{r.name}</span>
                          {multi && <span style={{ marginLeft: 7, fontSize: 10.5, color: 'var(--text-3)' }}>{r.brands.length} brands {isOpen ? '▲' : '▼'}</span>}
                        </td>
                        <td style={tdR}>{r.received}</td>
                        <td style={{ ...tdR, color: 'var(--text-3)' }}>{r.consumed}</td>
                        <td style={{ ...tdR, fontWeight: 700, color: r.qty <= 0 ? 'var(--bad)' : 'var(--text)' }}>{r.qty}</td>
                        <td style={{ padding: '10px 8px' }}>{short && <span title="On-hand is below the remaining planned quantity for this category" style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, color: '#96271E', background: '#F9ECEA', border: '1px solid #EBCFC9', borderRadius: 6, padding: '2px 7px' }}>⚠ LOW</span>}</td>
                      </tr>
                      {multi && isOpen && r.brands.map((b) => (
                        <tr key={r.key + b.code} style={{ background: '#FAF8F2' }}>
                          <td /><td />
                          <td style={{ padding: '6px 8px', color: 'var(--text-3)' }}><span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{b.code}</span> · {b.brand}</td>
                          <td style={{ ...tdR, padding: '6px 8px' }}>{b.received}</td>
                          <td style={{ ...tdR, padding: '6px 8px', color: 'var(--text-3)' }}>{b.consumed}</td>
                          <td style={{ ...tdR, padding: '6px 8px' }}>{b.qty}</td><td />
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
