import { useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useLiveQuery } from '../lib/db'
import { Empty } from './ui'
import { toast } from '../lib/toast'
import { num, fmtDateTime, toLatin } from '../lib/format'

// 9D-4 — AI agent usage meter, mirroring the PDF-extraction meter pattern.
// Shows this month's runs, tokens and estimated cost against the configurable
// hard cap that stops calls server-side when exceeded.
const numFilter = (s) => toLatin(s).replace(/[^\d.]/g, '')
const usd = (v) => `$${(Number(v) || 0).toFixed(2)}`

export default function AiUsageMeter({ role }) {
  const canWrite = ['admin', 'pmo'].includes(role)
  // LOCAL month start — the card says "this calendar month", and the team is
  // UTC+3: a UTC boundary billed the first three hours of each month backwards
  const monthIso = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
  }, [])
  // recent runs for the table (capped) …
  const { rows: runs } = useLiveQuery('ai_runs', (q) =>
    q.select('*, actor:profiles!ai_runs_created_by_fkey(full_name), project:projects(code)')
      .gte('created_at', monthIso).order('created_at', { ascending: false }).limit(50), [monthIso])
  // … but the TOTALS sum every run this month, uncapped — the server-side gate
  // sums all rows, so a limit here made the meter read "under budget" while
  // the Edge Function was already refusing calls
  const { rows: allRuns } = useLiveQuery('ai_runs', (q) =>
    q.select('cost_usd,tokens_in,tokens_out,cache_read_tokens,rows_from_cache,rows_requested')
      .gte('created_at', monthIso), [monthIso])
  const { rows: settings, refetch } = useLiveQuery('ai_settings', (q) => q.select('*').order('key'))

  const S = Object.fromEntries(settings.map((s) => [s.key, s]))
  const cap = Number(S.monthly_cap_usd?.value ?? 25)
  const spent = allRuns.reduce((a, r) => a + Number(r.cost_usd || 0), 0)
  const tIn = allRuns.reduce((a, r) => a + (r.tokens_in || 0), 0)
  const tOut = allRuns.reduce((a, r) => a + (r.tokens_out || 0), 0)
  const cacheRead = allRuns.reduce((a, r) => a + (r.cache_read_tokens || 0), 0)
  const fromCache = allRuns.reduce((a, r) => a + (r.rows_from_cache || 0), 0)
  const asked = allRuns.reduce((a, r) => a + (r.rows_requested || 0), 0)
  const pct = cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : 0

  const saveSetting = async (key, raw) => {
    const row = S[key]
    if (!row) return
    // U5 / COMMIT B — pdf_monthly_cap joins the numeric keys. It is a hard
    // ceiling the Edge Function enforces, so a stray character here would make
    // Number() return NaN and both the wall and the meter fall back to a
    // default the operator never chose.
    const NUMERIC = ['monthly_cap_usd', 'min_auto_confidence', 'pdf_monthly_cap']
    const v = NUMERIC.includes(key) ? numFilter(raw) : String(raw).trim()
    if (!v || v === row.value) return
    // ai_settings' primary key is `key`, not `id` — bgUpdate can't target it
    const { data, error } = await supabase.from('ai_settings').update({ value: v }).eq('key', row.key).select('key')
    if (error || !data?.length) { toast("Couldn't save — " + (error?.message || 'no permission'), 'err'); return }
    toast('Saved'); refetch()
  }

  return (
    <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16, overflow: 'hidden' }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>AI saving-sheet assistant</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>
        Usage this calendar month against the hard cap. When the cap is reached the assistant stops calling the API and says so — every other feature keeps working. Decisions resolved from memory cost nothing and are shown separately.
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div lang="en" dir="ltr" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>
          <span>RUNS <b style={{ color: 'var(--text)' }}>{num(allRuns.length)}</b></span>
          <span>ASKED <b style={{ color: 'var(--text)' }}>{num(asked)}</b></span>
          <span>FROM MEMORY <b style={{ color: 'var(--ok)' }}>{num(fromCache)}</b></span>
          <span>TOKENS <b style={{ color: 'var(--text)' }}>{num(tIn)}</b> in / <b style={{ color: 'var(--text)' }}>{num(tOut)}</b> out</span>
          {cacheRead > 0 && <span>CACHE READ <b style={{ color: 'var(--ok)' }}>{num(cacheRead)}</b></span>}
        </div>
        <div lang="en" dir="ltr" style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 800, color: spent >= cap ? 'var(--bad)' : 'var(--text)' }}>
          {usd(spent)} <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 600 }}>/ {usd(cap)}</span>
        </div>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: 'var(--track)', overflow: 'hidden', marginTop: 10 }}>
        <div style={{ height: '100%', width: pct + '%', background: spent >= cap ? 'var(--bad)' : 'var(--accent)' }} />
      </div>
      {spent >= cap && <div style={{ fontSize: 11.5, color: 'var(--bad)', marginTop: 6 }}>Monthly cap reached — AI calls are paused until next month or until the cap is raised.</div>}

      {/* settings */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginTop: 14 }}>
        {settings.map((s) => (
          <div key={s.key} style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>{s.key.replace(/_/g, ' ').toUpperCase()}</span>
            <input lang="en" dir="ltr" defaultValue={s.value} disabled={!canWrite} onBlur={(e) => saveSetting(s.key, e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 9px', border: '1px solid var(--line)', borderRadius: 'var(--radius-s)', fontSize: 12, fontFamily: 'var(--mono)' }} />
            <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-3)', marginTop: 3 }}>{s.description}</span>
          </div>
        ))}
      </div>

      <div style={{ fontWeight: 700, fontSize: 13, margin: '16px 0 8px' }}>Recent runs</div>
      {runs.length === 0 ? <Empty icon="box">No AI runs this month.</Empty> : (
        <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
            <th style={{ padding: '7px 6px', fontWeight: 600 }}>WHEN</th>
            <th style={{ padding: '7px 6px', fontWeight: 600 }}>PROJECT</th>
            <th style={{ padding: '7px 6px', fontWeight: 600 }}>JOB</th>
            <th style={{ padding: '7px 6px', fontWeight: 600 }}>MODEL</th>
            <th style={{ padding: '7px 6px', fontWeight: 600, textAlign: 'right' }}>ASKED</th>
            <th style={{ padding: '7px 6px', fontWeight: 600, textAlign: 'right' }}>CACHED</th>
            <th style={{ padding: '7px 6px', fontWeight: 600, textAlign: 'right' }}>TOK IN/OUT</th>
            <th style={{ padding: '7px 6px', fontWeight: 600, textAlign: 'right' }}>COST</th>
            <th style={{ padding: '7px 6px', fontWeight: 600 }}>BY</th>
          </tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--line)', opacity: r.success ? 1 : 0.6 }}>
                <td style={{ padding: '6px', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDateTime(r.created_at)}</td>
                <td style={{ padding: '6px', fontFamily: 'var(--mono)', fontSize: 10.5 }}>{r.project?.code || '—'}</td>
                <td style={{ padding: '6px' }}>{r.job}{!r.success && <span title={r.error || ''} style={{ marginLeft: 5, fontFamily: 'var(--mono)', fontSize: 8.5, fontWeight: 700, padding: '1px 5px', borderRadius: 'var(--radius-s)', color: 'var(--bad-deep)', background: 'var(--bad-bg)' }}>FAILED</span>}</td>
                <td style={{ padding: '6px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.model || ''}>{(r.model || '—').replace(/^claude-/, '')}</td>
                <td lang="en" dir="ltr" style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{num(r.rows_requested || 0)}</td>
                <td lang="en" dir="ltr" style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--ok)' }}>{num(r.rows_from_cache || 0)}</td>
                <td lang="en" dir="ltr" style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10.5 }}>{num(r.tokens_in || 0)} / {num(r.tokens_out || 0)}</td>
                <td lang="en" dir="ltr" style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)' }}>${(Number(r.cost_usd) || 0).toFixed(4)}</td>
                <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>{r.actor?.full_name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  )
}
