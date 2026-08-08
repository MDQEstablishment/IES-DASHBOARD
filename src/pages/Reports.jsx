import { utils, writeFileXLSX } from 'xlsx'
import { useAuth } from '../rbac'
import { useLiveQuery } from '../lib/db'
import { Loading } from '../components/ui'
import { roleTitle } from '../lib/constants'
import ProgressReportCard from '../components/ProgressReportCard'

// Reports. Client Progress Report (9F — the real generator, replacing the
// "awaiting client format" placeholder) · Materials Consumption (live bars) ·
// Employee Performance (PMO+CEO only).
export default function Reports() {
  const { role } = useAuth()
  const empAllowed = role === 'pmo' || role === 'ceo'

  const { rows: materials, loading } = useLiveQuery('materials', (q) => q.select('code,name,unit,esm:esms(code)'))
  const { rows: scopes } = useLiveQuery('building_item_scope', (q) => q.select('id,material_code'))
  const { rows: install } = useLiveQuery('install_log', (q) => q.select('scope_id,qty,qa_status'))
  const { rows: profiles } = useLiveQuery('profiles', (q) => q.select('id,full_name,role,archived'))
  const { rows: tasks } = useLiveQuery('tasks', (q) => q.select('assigned_to_id,status,due_date,created_at,updated_at'))
  const { rows: escs } = useLiveQuery('escalations', (q) => q.select('raised_by_id'))
  // A4(6) — the on-time bands are HR-adjacent policy, so they are rows in
  // tarshid_constants (migration 0138), not literals in this file. No code
  // default: with the rows absent the column simply carries no colour, rather
  // than the app asserting a band nobody approved.
  const { rows: constRows } = useLiveQuery('tarshid_constants', (q) => q.select('key,value'))
  const constants = {}; constRows.forEach((r) => { constants[r.key] = Number(r.value) })
  const goodPct = Number.isFinite(constants.perf_ontime_good_pct) ? constants.perf_ontime_good_pct : null
  const warnPct = Number.isFinite(constants.perf_ontime_warn_pct) ? constants.perf_ontime_warn_pct : null

  // consumption per material code
  const scopeMat = {}; scopes.forEach((s) => { scopeMat[s.id] = s.material_code })
  // 0100's rule, the same one Dashboard / Projects / ProjectDetail /
  // BuildingDetail / ProgressReportCard apply: everything not rejected counts.
  const consumed = {}; install.forEach((r) => { const c = scopeMat[r.scope_id]; if (c && r.qa_status !== 'rejected') consumed[c] = (consumed[c] || 0) + (r.qty || 0) })
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
    // A4(5) — an employee with tasks but nothing completed has NO on-time
    // ratio. It used to read 100% in green, which is a perfect score awarded
    // for zero deliveries. No denominator means unknown, and unknown renders
    // as an em dash.
    const ontime = done.length ? Math.round((onTime.length / done.length) * 100) : null
    const avg = done.length ? Math.round(done.reduce((s, t) => s + Math.max(0, (new Date(t.updated_at) - new Date(t.created_at)) / 86400000), 0) / done.length) : null
    return {
      name: p.full_name, role: roleTitle(p.role), handled: mine.length, ontime, avg,
      bn: mine.filter((t) => t.status === 'blocked').length,
      es: escs.filter((e) => e.raised_by_id === p.id).length,
      otColor: (ontime == null || goodPct == null || warnPct == null) ? 'var(--text-3)'
        : ontime >= goodPct ? 'var(--ok)' : ontime >= warnPct ? 'var(--warn)' : 'var(--bad)',
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
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Report builders</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 0' }}>Reports</h1>
      </div>

      {/* 9F — the real client report generator */}
      <ProgressReportCard />

      <div style={{ marginBottom: 14 }}>
        {/* Materials Consumption */}
        <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Materials Consumption</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={exportConsumption} disabled={consBars.length === 0} className="ies-hover" style={{ fontSize: 11, fontWeight: 700, padding: '6px 11px', borderRadius: 'var(--radius-s)', background: consBars.length === 0 ? 'var(--track)' : 'var(--ok)', color: consBars.length === 0 ? 'var(--text-3)' : 'var(--surface-1)', cursor: consBars.length === 0 ? 'not-allowed' : 'pointer' }}>Export Excel</button>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 14 }}>Every material consumed across the programme to date, by quantity.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {consBars.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No consumption recorded yet.</div> : consBars.map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent)', width: 46 }}>{b.esm}</span>
                <span style={{ fontSize: 12.5, width: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
                <div style={{ flex: 1, height: 18, borderRadius: 'var(--radius-s)', background: 'var(--track)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: Math.round((b.qty / maxCons) * 100) + '%', background: 'linear-gradient(90deg,var(--accent),var(--brass-bright))' }} />
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, width: 80, textAlign: 'right' }}>{b.qty} {b.unit}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Employee Performance (PMO + CEO only) */}
      {empAllowed && (
        <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Employee Performance <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--esm2)', background: 'var(--esm2-bg)', padding: '2px 7px', borderRadius: 'var(--radius-s)', marginLeft: 6 }}>PMO + CEO ONLY</span></div>
          </div>
          <div className="ies-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10.5, fontFamily: 'var(--mono)' }}>
                  <th style={{ padding: '9px 8px', fontWeight: 600 }}>Employee</th>
                  <th style={{ padding: '9px 8px', fontWeight: 600 }}>Role</th>
                  <th style={{ padding: '9px 8px', fontWeight: 600, textAlign: 'right' }}>Tasks</th>
                  <th style={{ padding: '9px 8px', fontWeight: 600, textAlign: 'right' }}>On-Time %</th>
                  <th style={{ padding: '9px 8px', fontWeight: 600, textAlign: 'right' }}>Avg days</th>
                  <th style={{ padding: '9px 8px', fontWeight: 600, textAlign: 'right' }}>Bottlenecks</th>
                  <th style={{ padding: '9px 8px', fontWeight: 600, textAlign: 'right' }}>ESC. Caused</th>
                </tr>
              </thead>
              <tbody>
                {empPerf.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: '14px 8px', color: 'var(--text-3)' }}>No task activity yet.</td></tr>
                ) : empPerf.map((e, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '10px 8px', fontWeight: 600 }}>{e.name}</td>
                    <td style={{ padding: '10px 8px', color: 'var(--text-3)' }}>{e.role}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{e.handled}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: e.otColor }} title={e.ontime == null ? 'No completed task yet — there is no ratio to report' : undefined}>{e.ontime == null ? '—' : `${e.ontime}%`}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{e.avg == null ? '—' : e.avg}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{e.bn}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{e.es}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* A4(8) — the "[ DESIGNER SUGGESTION ] ESM Progress vs Plan" card is
          gone. It advertised an unbuilt feature on a shipped screen, which
          reads to the owner as something he should be able to click. The idea
          itself is kept: docs/Backlog.md, ESM_PROGRESS_VS_PLAN. */}
    </div>
  )
}
