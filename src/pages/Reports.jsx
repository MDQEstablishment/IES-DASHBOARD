import { utils, writeFileXLSX } from 'xlsx'
import { useAuth } from '../rbac'
import { useLiveQuery } from '../lib/db'
import { Loading } from '../components/ui'
import { roleTitle } from '../lib/constants'

// Reports (dc r_reports, 917-948). Materials Consumption (live bars) · Tarsheed
// (locked placeholder) · Employee Performance (PMO+CEO only) · ESM-vs-Plan.
export default function Reports() {
  const { role } = useAuth()
  const empAllowed = role === 'pmo' || role === 'ceo'

  const { rows: materials, loading } = useLiveQuery('materials', (q) => q.select('code,name,unit,esm:esms(code)'))
  const { rows: scopes } = useLiveQuery('building_item_scope', (q) => q.select('id,material_code'))
  const { rows: install } = useLiveQuery('install_log', (q) => q.select('scope_id,qty'))
  const { rows: profiles } = useLiveQuery('profiles', (q) => q.select('id,full_name,role,archived'))
  const { rows: tasks } = useLiveQuery('tasks', (q) => q.select('assigned_to_id,status,due_date,created_at,updated_at'))
  const { rows: escs } = useLiveQuery('escalations', (q) => q.select('raised_by_id'))

  // consumption per material code
  const scopeMat = {}; scopes.forEach((s) => { scopeMat[s.id] = s.material_code })
  const consumed = {}; install.forEach((r) => { const c = scopeMat[r.scope_id]; if (c) consumed[c] = (consumed[c] || 0) + (r.qty || 0) })
  const consBars = materials
    .map((m) => ({ esm: m.esm?.code || '—', name: m.name, unit: m.unit || '', qty: consumed[m.code] || 0 }))
    .filter((b) => b.qty > 0)
    .sort((a, b) => b.qty - a.qty)
  const maxCons = Math.max(1, ...consBars.map((b) => b.qty))

  // employee performance
  const empPerf = profiles.filter((p) => !p.archived && p.role !== 'admin').map((p) => {
    const mine = tasks.filter((t) => t.assigned_to_id === p.id)
    const done = mine.filter((t) => t.status === 'done')
    const onTime = done.filter((t) => t.due_date && new Date(t.updated_at) <= new Date(t.due_date + 'T23:59:59'))
    const ontime = done.length ? Math.round((onTime.length / done.length) * 100) : 100
    const avg = done.length ? Math.round(done.reduce((s, t) => s + Math.max(0, (new Date(t.updated_at) - new Date(t.created_at)) / 86400000), 0) / done.length) : 0
    return {
      name: p.full_name, role: roleTitle(p.role), handled: mine.length, ontime, avg,
      bn: mine.filter((t) => t.status === 'blocked').length,
      es: escs.filter((e) => e.raised_by_id === p.id).length,
      otColor: ontime >= 90 ? '#10B981' : ontime >= 70 ? '#F59E0B' : '#EF4444',
    }
  }).filter((e) => e.handled > 0).sort((a, b) => b.handled - a.handled)

  // real export of the live materials-consumption table (opens in Excel)
  const exportConsumption = () => {
    if (consBars.length === 0) return
    const ws = utils.json_to_sheet(consBars.map((b) => ({ ESM: b.esm, Material: b.name, Unit: b.unit, Quantity: b.qty })))
    const wb = utils.book_new(); utils.book_append_sheet(wb, ws, 'Consumption')
    writeFileXLSX(wb, 'materials-consumption.csv', { bookType: 'csv' })
  }

  if (loading) return <Loading />

  return (
    <div data-screen-label="Reports">
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '2px', color: 'var(--text-3)' }}>REPORT BUILDERS</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 0' }}>Reports</h1>
      </div>

      <div className="ies-2col" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14, marginBottom: 14, alignItems: 'start' }}>
        {/* 1 · Materials Consumption */}
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>1 · Materials Consumption</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={exportConsumption} disabled={consBars.length === 0} className="ies-hover" style={{ fontSize: 11, fontWeight: 700, padding: '6px 11px', borderRadius: 7, background: consBars.length === 0 ? '#E5E7EB' : '#10B981', color: consBars.length === 0 ? 'var(--text-3)' : '#fff', cursor: consBars.length === 0 ? 'not-allowed' : 'pointer' }}>Export Excel</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <select style={{ padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}><option>All projects</option></select>
            <select style={{ padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}><option>This year</option></select>
            <select style={{ padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}><option>Group by ESM</option><option>By sub-type</option><option>By building</option></select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {consBars.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No consumption recorded yet.</div> : consBars.map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent)', width: 46 }}>{b.esm}</span>
                <span style={{ fontSize: 12.5, width: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
                <div style={{ flex: 1, height: 18, borderRadius: 5, background: '#EFF2F6', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: Math.round((b.qty / maxCons) * 100) + '%', background: 'linear-gradient(90deg,#2563EB,#3B82F6)' }} />
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, width: 80, textAlign: 'right' }}>{b.qty} {b.unit}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 2 · Tarsheed (locked) */}
        <div style={{ background: '#fff', border: '1px dashed var(--line)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 200 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: '#F59E0B', fontWeight: 700 }}>2 · AWAITING CLIENT FORMAT</div>
          <div style={{ fontWeight: 700, fontSize: 15, margin: '8px 0 6px' }}>Tarsheed Excel</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.45 }}>Tarsheed report template — awaiting client format. Once received, this report will export to the exact Excel layout the client submits to Tarsheed.</div>
          <div style={{ marginTop: 14, alignSelf: 'flex-start', fontSize: 12, fontWeight: 600, padding: '8px 13px', borderRadius: 8, border: '1px solid var(--line)', color: 'var(--text-3)', background: '#FAFAFA' }}>Locked — pending template</div>
        </div>
      </div>

      {/* 3 · Employee Performance (PMO + CEO only) */}
      {empAllowed && (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>3 · Employee Performance <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#7C3AED', background: '#F5F3FF', padding: '2px 7px', borderRadius: 5, marginLeft: 6 }}>PMO + CEO ONLY</span></div>
            <select style={{ padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}><option>This month</option><option>Quarter</option><option>Year</option></select>
          </div>
          <div className="ies-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10.5, fontFamily: 'var(--mono)' }}>
                  <th style={{ padding: '9px 8px', fontWeight: 600 }}>EMPLOYEE</th>
                  <th style={{ padding: '9px 8px', fontWeight: 600 }}>ROLE</th>
                  <th style={{ padding: '9px 8px', fontWeight: 600, textAlign: 'right' }}>TASKS</th>
                  <th style={{ padding: '9px 8px', fontWeight: 600, textAlign: 'right' }}>ON-TIME %</th>
                  <th style={{ padding: '9px 8px', fontWeight: 600, textAlign: 'right' }}>AVG DAYS</th>
                  <th style={{ padding: '9px 8px', fontWeight: 600, textAlign: 'right' }}>BOTTLENECKS</th>
                  <th style={{ padding: '9px 8px', fontWeight: 600, textAlign: 'right' }}>ESC. CAUSED</th>
                </tr>
              </thead>
              <tbody>
                {empPerf.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: '14px 8px', color: 'var(--text-3)' }}>No task activity in range.</td></tr>
                ) : empPerf.map((e, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '10px 8px', fontWeight: 600 }}>{e.name}</td>
                    <td style={{ padding: '10px 8px', color: 'var(--text-3)' }}>{e.role}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{e.handled}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: e.otColor }}>{e.ontime}%</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{e.avg}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{e.bn}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{e.es}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ESM Progress vs Plan (designer suggestion) */}
      <div style={{ background: 'linear-gradient(180deg,#fff,#FCFCFD)', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', fontWeight: 700 }}>[ DESIGNER SUGGESTION ]</div>
        <div style={{ fontWeight: 700, fontSize: 15, margin: '8px 0 6px' }}>ESM Progress vs Plan</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', maxWidth: 560 }}>Per-ESM planned vs actual installed quantities over time, with delay attribution by building. High-value for the Planning Engineer's delay analysis.</div>
      </div>
    </div>
  )
}
