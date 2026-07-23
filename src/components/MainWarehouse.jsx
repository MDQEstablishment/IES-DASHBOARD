import { useState, Fragment } from 'react'
import { useLiveQuery } from '../lib/db'
import { Empty } from './ui'

// Sprint 8E/8H — Main Warehouse rollup (top-bar Materials page). Total stock on
// hand aggregated by material NAME across brand variants and across all projects;
// click a row to drill down to the brand-by-brand split. Reads main_warehouse_stock.
const ESM_ORDER = (c) => ({ ESM1: 1, ESM2: 2, ESM3: 3 }[c] || 9)
const num = (v) => (v == null ? 0 : Number(v))

export default function MainWarehouse() {
  const { rows: main, loading } = useLiveQuery('main_warehouse_stock', (q) => q.select('*'))
  const [open, setOpen] = useState(null)
  const [esm, setEsm] = useState('all')

  // Aggregate variants by material name (within ESM + category). Each group keeps
  // its per-brand rows for the drilldown.
  const byName = {}
  main.forEach((r) => {
    const name = r.variant_name || r.variant_code
    const key = (r.esm_code || '') + '|' + (r.category_name || r.category_code || '') + '|' + name
    const g = byName[key] || (byName[key] = { key, esm_code: r.esm_code, category_name: r.category_name || r.category_code, name, qty: 0, brands: [] })
    g.qty += num(r.qty_on_hand)
    g.brands.push({ brand: r.brand || '—', code: r.variant_code, qty: num(r.qty_on_hand) })
  })

  const esmsPresent = [...new Set(main.map((r) => r.esm_code).filter(Boolean))].sort((a, b) => ESM_ORDER(a) - ESM_ORDER(b))
  const rows = Object.values(byName)
    .map((g) => ({ ...g, brands: g.brands.sort((a, b) => (a.brand || '').localeCompare(b.brand || '')) }))
    .filter((r) => esm === 'all' || r.esm_code === esm)
    .sort((a, b) => ESM_ORDER(a.esm_code) - ESM_ORDER(b.esm_code) || (a.category_name || '').localeCompare(b.category_name || '') || a.name.localeCompare(b.name))

  const th = { padding: '9px 8px', fontWeight: 600, textAlign: 'left' }
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Main Warehouse</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Total stock on hand across all projects, by material. Click a row for the brand-by-brand split.</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', ...esmsPresent].map((k) => (
            <button key={k} onClick={() => setEsm(k)} style={{ padding: '4px 11px', borderRadius: 20, fontSize: 11.5, fontWeight: 600, border: '1px solid ' + (esm === k ? 'var(--accent)' : 'var(--line)'), background: esm === k ? '#F5EEDF' : '#fff', color: esm === k ? 'var(--accent)' : 'var(--text-3)' }}>{k === 'all' ? 'All ESM' : k}</button>
          ))}
        </div>
      </div>
      {loading && !main.length ? <Empty icon="materials">Loading…</Empty>
        : rows.length === 0 ? <Empty icon="materials">No stock recorded yet across any project.</Empty> : (
          <div className="ies-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 680 }}>
              <thead><tr style={{ color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
                <th style={th}>ESM</th><th style={th}>CATEGORY</th><th style={th}>MATERIAL</th>
                <th style={{ ...th, textAlign: 'right' }}>TOTAL IN STOCK</th><th style={th} />
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const multi = r.brands.length > 1
                  const isOpen = open === r.key
                  return (
                    <Fragment key={r.key}>
                      <tr style={{ borderTop: '1px solid var(--line)', cursor: multi ? 'pointer' : 'default' }} onClick={() => multi && setOpen(isOpen ? null : r.key)}>
                        <td style={{ padding: '10px 8px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>{r.esm_code || '—'}</td>
                        <td style={{ padding: '10px 8px' }}><span className="ies-ellipsis">{r.category_name || '—'}</span></td>
                        <td style={{ padding: '10px 8px', fontWeight: 600 }}><span className="ies-ellipsis">{r.name}</span></td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{r.qty}</td>
                        <td style={{ padding: '10px 8px', color: 'var(--text-3)', fontSize: 11 }}>{multi ? <>{r.brands.length} brands {isOpen ? '▲' : '▼'}</> : (r.brands[0]?.brand || '—')}</td>
                      </tr>
                      {multi && isOpen && r.brands.map((b) => (
                        <tr key={r.key + b.code} style={{ background: '#FAF8F2' }}>
                          <td />
                          <td colSpan={2} style={{ padding: '6px 8px', color: 'var(--text-3)' }}><span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{b.code}</span> · {b.brand}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{b.qty}</td><td />
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}
