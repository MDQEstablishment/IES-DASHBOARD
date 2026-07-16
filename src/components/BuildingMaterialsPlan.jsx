import { useLiveQuery } from '../lib/db'
import { Empty } from './ui'

// Sprint 8E — building Materials: category-level Planned / Used / Remaining /
// Available-in-warehouse (project-wide stock shared across the project's
// buildings). Grouped by ESM, sorted by category code. Low badge when the
// available warehouse stock can't cover this building's remaining need.
const ESM_ORDER = (c) => ({ ESM1: 1, ESM2: 2, ESM3: 3 }[c] || 9)
const num = (v) => (v == null ? 0 : Number(v))

export default function BuildingMaterialsPlan({ buildingId, projectId }) {
  const { rows: plan } = useLiveQuery('building_material_plan', (q) => q.select('*').eq('building_id', buildingId), [buildingId])
  const { rows: pstock } = useLiveQuery('project_warehouse_stock', (q) => q.select('category_id,qty_on_hand').eq('project_id', projectId), [projectId])
  const { rows: cats } = useLiveQuery('material_categories', (q) => q.select('id,code,name_en,esm:esms(code)'))

  const catById = Object.fromEntries(cats.map((c) => [c.id, c]))
  const availByCat = {}
  pstock.forEach((r) => { availByCat[r.category_id] = (availByCat[r.category_id] || 0) + num(r.qty_on_hand) })

  const rows = plan
    .map((p) => ({ ...p, cat: catById[p.category_id], avail: availByCat[p.category_id] || 0 }))
    .filter((r) => r.cat)
    .sort((a, b) => ESM_ORDER(a.cat.esm?.code) - ESM_ORDER(b.cat.esm?.code) || (a.cat.code || '').localeCompare(b.cat.code || ''))

  const th = { padding: '8px', fontWeight: 600, textAlign: 'left' }
  const tdR = { padding: '9px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }
  let lastEsm = null

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16, marginBottom: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>Materials — Planned / Used / Remaining / Warehouse</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>By category. Available-in-warehouse is the project's on-hand stock, shared across all its buildings.</div>
      {rows.length === 0 ? <Empty icon="materials">No planned materials for this building yet.</Empty> : (
        <div className="ies-table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 620 }}>
            <thead><tr style={{ color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
              <th style={th}>CATEGORY</th>
              <th style={{ ...th, textAlign: 'right' }}>PLANNED</th><th style={{ ...th, textAlign: 'right' }}>USED</th>
              <th style={{ ...th, textAlign: 'right' }}>REMAINING</th><th style={{ ...th, textAlign: 'right' }}>IN WAREHOUSE</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const esm = r.cat.esm?.code || '—'
                const header = esm !== lastEsm ? esm : null; lastEsm = esm
                const short = r.avail < num(r.remaining_qty)
                return (
                  <>
                    {header && <tr key={'h' + esm}><td colSpan={5} style={{ padding: '8px', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: '#FAF8F2', borderTop: '1px solid var(--line)' }}>{header}</td></tr>}
                    <tr key={r.category_id} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '9px 8px' }}><span className="ies-ellipsis" title={r.cat.code}>{r.cat.name_en}</span></td>
                      <td style={tdR}>{num(r.planned_qty)}</td>
                      <td style={{ ...tdR, color: 'var(--ok)' }}>{num(r.used_qty)}</td>
                      <td style={{ ...tdR, fontWeight: 700 }}>{num(r.remaining_qty)}</td>
                      <td style={{ ...tdR, color: short ? 'var(--bad)' : 'var(--text)' }}>{r.avail}{short && <span title="Warehouse stock is below this building's remaining need" style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: '#96271E', background: '#F9ECEA', border: '1px solid #EBCFC9', borderRadius: 5, padding: '1px 5px' }}>LOW</span>}</td>
                    </tr>
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
