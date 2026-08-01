import { useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useLiveQuery } from '../../lib/db'
import { toast } from '../../lib/toast'
import { num, toLatin } from '../../lib/format'

// 9L(3b) — مُرشد's controls and its own meter, mirroring the 9D-4 card so the
// two AI budgets are read the same way.
//
// The meter filters ai_runs to job='murshid', and the cap it shows is
// murshid_monthly_cap_usd — SEPARATE from the saving-sheet agent's cap, so
// neither assistant can drain the other's budget.
//
// The API key is deliberately NOT here and never will be: ai_settings is read
// by the browser, so a key in it would be shipped to every device. The key is
// an Edge Function secret (MURSHID_API_KEY), set per Supabase project — which
// is per client company. See docs/9L-decisions.md.
const numFilter = (s) => toLatin(s).replace(/[^\d.]/g, '')
const usd = (v) => `$${(Number(v) || 0).toFixed(2)}`

export default function MurshidSettings({ role }) {
  const canWrite = ['admin', 'pmo'].includes(role)
  const monthIso = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
  }, [])

  const { rows: runs } = useLiveQuery('ai_runs', (q) =>
    q.select('cost_usd,tokens_in,tokens_out,cache_read_tokens,success,error')
      .eq('job', 'murshid').gte('created_at', monthIso), [monthIso])
  const { rows: settings, refetch } = useLiveQuery('ai_settings', (q) => q.select('*').order('key'))

  const S = Object.fromEntries(settings.map((s) => [s.key, s]))
  const enabled = S.murshid_enabled?.value === 'true'
  const escalate = S.murshid_escalate?.value === 'true'
  const cap = Number(S.murshid_monthly_cap_usd?.value ?? 10)
  const spent = runs.reduce((a, r) => a + Number(r.cost_usd || 0), 0)
  const pct = cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : 0
  const refusals = runs.filter((r) => String(r.error || '').startsWith('refused:')).length

  const save = async (key, raw) => {
    const row = S[key]
    if (!row) return
    const v = key === 'murshid_monthly_cap_usd' ? numFilter(raw) : String(raw).trim()
    if (!v || v === row.value) return
    // ai_settings' primary key is `key`, not `id`
    const { data, error } = await supabase.from('ai_settings').update({ value: v }).eq('key', key).select('key')
    if (error || !data?.length) { toast("Couldn't save — " + (error?.message || 'no permission'), 'err'); return }
    toast('Saved'); refetch()
  }

  return (
    <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Murshid assistant (مُرشد)</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 14 }}>
        The in-app assistant. It answers only from data the asking person can already see — every query runs under their own
        session, so it inherits their permissions exactly. Help articles, the FAQ and the feedback box are static and always
        work; only the chat consumes budget. The API key is held server-side per deployment and is never stored here.
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: canWrite ? 'pointer' : 'default' }}>
        <input type="checkbox" checked={enabled} disabled={!canWrite}
          onChange={(e) => save('murshid_enabled', e.target.checked ? 'true' : 'false')} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Enable the chat</span>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
          {enabled ? 'on' : 'off — the panel still serves help, FAQ and feedback'}
        </span>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, cursor: canWrite ? 'pointer' : 'default' }}>
        <input type="checkbox" checked={escalate} disabled={!canWrite}
          onChange={(e) => save('murshid_escalate', e.target.checked ? 'true' : 'false')} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Use the stronger model</span>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>costs more per question</span>
      </label>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div lang="en" dir="ltr" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>
          <span>QUESTIONS <b style={{ color: 'var(--text)' }}>{num(runs.length)}</b></span>
          <span>REFUSED <b style={{ color: 'var(--text)' }}>{num(refusals)}</b></span>
          <span>TOKENS <b style={{ color: 'var(--text)' }}>{num(runs.reduce((a, r) => a + (r.tokens_in || 0), 0))}</b> in
            / <b style={{ color: 'var(--text)' }}>{num(runs.reduce((a, r) => a + (r.tokens_out || 0), 0))}</b> out</span>
        </div>
        <div lang="en" dir="ltr" style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 800, color: spent >= cap ? 'var(--bad)' : 'var(--text)' }}>
          {usd(spent)} <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 600 }}>/ {usd(cap)}</span>
        </div>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: 'var(--track)', overflow: 'hidden', marginTop: 10 }}>
        <div style={{ height: '100%', width: pct + '%', background: spent >= cap ? 'var(--bad)' : 'var(--accent)' }} />
      </div>

      {canWrite && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Monthly cap (USD)</span>
          <input lang="en" dir="ltr" defaultValue={String(cap)}
            onBlur={(e) => save('murshid_monthly_cap_usd', e.target.value)}
            style={{
              width: 90, padding: '6px 9px', borderRadius: 'var(--radius-s)', border: '1px solid var(--line-ctrl)',
              background: 'var(--surface-1)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 12,
            }} />
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
            separate from the saving-sheet agent's cap
          </span>
        </div>
      )}
    </div>
  )
}
