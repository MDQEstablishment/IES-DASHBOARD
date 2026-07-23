import { useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../rbac'
import { useLiveQuery, bgInsert, bgUpdate } from '../lib/db'
import { Btn, Modal, Field, inputStyle, Empty } from './ui'
import { toast } from '../lib/toast'
import { num, fmtDateTime } from '../lib/format'
import { SURVEY_CATEGORIES } from '../lib/constants'

// 9C-3 — the commitment engine UI. TARSHID commits BASELINE SAVINGS (kWh/yr)
// per category; the effective target is the LATEST revision (append-only
// ledger, never edited). Coverage = surveyed potential vs committed.
const CAT_LABEL = Object.fromEntries(SURVEY_CATEGORIES)
const CHANGE_LABEL = { initial: 'Initial', increase: 'Increase', decrease: 'Decrease' }

const toLatin = (s) => String(s).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660).replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06F0)
const numFilter = (s) => toLatin(s).replace(/[^\d.]/g, '')
const kwh = (v) => v == null ? '—' : num(Math.round(v))

// Coverage math shared by the header bars, the panel and the alert banners.
// Only categories WITH a commitment count toward totals.
export function coverageOf(savings) {
  const withC = savings.filter((s) => s.committed_kwh_yr != null && Number(s.committed_kwh_yr) > 0)
  const committed = withC.reduce((a, s) => a + Number(s.committed_kwh_yr), 0)
  const potential = withC.reduce((a, s) => a + Number(s.surveyed_potential_kwh_yr || 0), 0)
  const achieved = withC.reduce((a, s) => a + Number(s.achieved_kwh_yr || 0), 0)
  const unest = savings.reduce((a, s) => a + Number(s.unestimated_entries || 0), 0)
  return { withC, committed, potential, achieved, unest, pct: committed ? (potential / committed) * 100 : null }
}

// ── Compact per-category coverage bars (project header) ─────────────────────
export function SavingsCoverageBars({ savings }) {
  const rows = savings.filter((s) => s.committed_kwh_yr != null && Number(s.committed_kwh_yr) > 0)
  if (rows.length === 0) return null
  return (
    <div lang="en" dir="ltr" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {rows.map((s) => {
        const committed = Number(s.committed_kwh_yr)
        const potential = Number(s.surveyed_potential_kwh_yr || 0)
        const achieved = Number(s.achieved_kwh_yr || 0)
        const potPct = Math.min(100, (potential / committed) * 100)
        const achPct = Math.min(100, (achieved / committed) * 100)
        const over = potential >= committed
        return (
          <div key={s.category} title={`${CAT_LABEL[s.category] || s.category}: achieved ${kwh(achieved)} · surveyed potential ${kwh(potential)} · committed ${kwh(committed)} kWh/yr`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--text-3)', marginBottom: 2 }}>
              <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{(CAT_LABEL[s.category] || s.category).toUpperCase()}</span>
              <span>{kwh(achieved)} / {kwh(committed)} kWh·yr <span style={{ color: over ? 'var(--ok)' : '#B45309', fontWeight: 700 }}>· surveyed {Math.round((potential / committed) * 100)}%</span></span>
            </div>
            <div style={{ position: 'relative', height: 7, borderRadius: 4, background: '#EDEAE0', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: potPct + '%', background: over ? '#BFDFCF' : '#E7D9B8' }} />
              <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: achPct + '%', background: '#217A54' }} />
              {/* surveyed-potential marker */}
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${potPct}% - 1px)`, width: 2, background: over ? '#217A54' : '#B45309' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Alert banners: freeze suggestion / shortfall ────────────────────────────
export function SavingsAlerts({ project, savings, buildings, surveyedSet, canManage, onOpenFreeze }) {
  if (project.phase !== 'survey') return null
  const cov = coverageOf(savings)
  if (cov.committed <= 0) return null
  const frozen = !!project.scope_frozen_at
  const margin = Number(project.savings_margin_pct || 110)
  const candidates = buildings.filter((b) => b.scope_status === 'candidate')
  const allCandidatesSurveyed = candidates.length > 0 && candidates.every((b) => surveyedSet.has(b.id))
  const banners = []
  if (!frozen && cov.pct != null && cov.pct >= margin) {
    banners.push(
      <div key="freeze" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#E9F3EE', border: '1px solid #BFDFCF', color: '#175A3E', borderRadius: 8, padding: '9px 13px', fontSize: 12.5, marginBottom: 12 }}>
        <span lang="en" dir="ltr">Surveyed potential covers <b>{Math.round(cov.pct)}%</b> of the committed savings (margin {num(margin)}%) — you can freeze the project scope; unsurveyed candidates become surplus.</span>
        {canManage && <Btn variant="primary" style={{ padding: '6px 11px', fontSize: 12, marginLeft: 'auto' }} onClick={onOpenFreeze}>Freeze scope…</Btn>}
      </div>
    )
  }
  if (!frozen && allCandidatesSurveyed && cov.pct != null && cov.pct < 100) {
    banners.push(
      <div key="short" lang="en" dir="ltr" style={{ background: '#F9ECEA', border: '1px solid #EBCFC9', color: '#96271E', borderRadius: 8, padding: '9px 13px', fontSize: 12.5, marginBottom: 12 }}>
        Every candidate building is surveyed but potential covers only <b>{Math.round(cov.pct)}%</b> of the commitment — short by <b>{kwh(cov.committed - cov.potential)} kWh/yr</b>. Raise coverage (map unlinked entries{cov.unest > 0 ? ` — ${num(cov.unest)} unestimated` : ''}) or agree a commitment decrease with TARSHID.
      </div>
    )
  }
  return banners.length ? <>{banners}</> : null
}

// ── Freeze confirm modal ────────────────────────────────────────────────────
export function FreezeScopeModal({ project, buildings, surveyedSet, onClose }) {
  const [busy, setBusy] = useState(false)
  const candidates = buildings.filter((b) => b.scope_status === 'candidate')
  const toScope = candidates.filter((b) => surveyedSet.has(b.id)).length
  const toSurplus = candidates.length - toScope
  const go = async () => {
    setBusy(true)
    const { data, error } = await supabase.rpc('freeze_project_scope', { p_project_id: project.id })
    setBusy(false)
    if (error || !data?.ok) { toast("Couldn't freeze — " + (error?.message || ''), 'err'); return }
    toast(`Scope frozen — ${num(data.in_scope)} in scope, ${num(data.surplus)} surplus`)
    onClose()
  }
  return (
    <Modal open width={480} title={`Freeze scope · ${project.code}`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={busy} onClick={go}>{busy ? 'Freezing…' : 'Freeze scope'}</Btn></>}>
      <div lang="en" dir="ltr" style={{ fontSize: 13, lineHeight: 1.55 }}>
        <b>{num(toScope)}</b> surveyed candidate building{toScope === 1 ? '' : 's'} become <b>in scope</b>; <b>{num(toSurplus)}</b> unsurveyed candidate{toSurplus === 1 ? '' : 's'} become <b>surplus</b> ("commitment coverage reached"). Buildings already in scope or manually excluded are untouched.
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>
          Progress, COC lists and reports then compute over in-scope buildings only. A commitment increase auto-unfreezes; PMO can also unfreeze manually.
        </div>
      </div>
    </Modal>
  )
}

// ── The Savings & Scope tab panel ───────────────────────────────────────────
export default function SavingsPanel({ project, buildings, savings, surveyedSet }) {
  const { role } = useAuth()
  const canManage = ['pmo', 'admin'].includes(role)
  const [revOpen, setRevOpen] = useState(false)
  const [freezeOpen, setFreezeOpen] = useState(false)
  const [unfreezing, setUnfreezing] = useState(false)

  const { rows: revisions } = useLiveQuery('commitment_revisions', (q) =>
    q.select('*, approver:profiles!commitment_revisions_approved_by_fkey(full_name)')
      .eq('project_id', project.id).order('created_at', { ascending: false }), [project.id])

  const effective = useMemo(() => {
    const m = {}
    ;[...revisions].reverse().forEach((r) => { m[r.category] = Number(r.value_kwh_yr) })
    return m
  }, [revisions])

  const cov = coverageOf(savings)
  const frozen = !!project.scope_frozen_at
  const candidates = buildings.filter((b) => b.scope_status === 'candidate')
  const surveyedCandidates = candidates.filter((b) => surveyedSet.has(b.id)).length

  const unfreeze = async () => {
    setUnfreezing(true)
    const { data, error } = await supabase.rpc('unfreeze_project_scope', { p_project_id: project.id })
    setUnfreezing(false)
    if (error || !data?.ok) { toast("Couldn't unfreeze — " + (error?.message || ''), 'err'); return }
    toast(`Scope unfrozen — ${num(data.reopened)} building${data.reopened === 1 ? '' : 's'} reopened`)
  }

  const saveMargin = (v) => {
    const n = parseFloat(v)
    if (Number.isNaN(n) || n < 100 || n === Number(project.savings_margin_pct)) return
    bgUpdate('projects', project.id, { savings_margin_pct: n }, { okMsg: 'Freeze margin updated' })
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
      {/* coverage per category */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Savings coverage <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)', marginLeft: 6 }}>kWh/YR · COMMITTED VS SURVEYED</span></div>
        {canManage && (
          <label lang="en" dir="ltr" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-3)' }} title="Coverage at which the freeze suggestion appears (>=100)">
            Freeze margin %
            <input lang="en" dir="ltr" type="text" inputMode="decimal" defaultValue={num(Number(project.savings_margin_pct || 110))}
              onBlur={(e) => saveMargin(numFilter(e.target.value))}
              style={{ width: 58, padding: '4px 7px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'var(--mono)', textAlign: 'right' }} />
          </label>
        )}
      </div>
      {cov.withC.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '4px 0 14px' }}>No commitment recorded yet — add the TARSHID target below to activate the coverage meters.</div>
      ) : (
        <div style={{ margin: '8px 0 14px' }}>
          <SavingsCoverageBars savings={savings} />
          <div lang="en" dir="ltr" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)', marginTop: 8 }}>
            <span>TOTAL committed <b style={{ color: 'var(--text)' }}>{kwh(cov.committed)}</b></span>
            <span>surveyed potential <b style={{ color: cov.pct >= 100 ? 'var(--ok)' : '#B45309' }}>{kwh(cov.potential)} ({cov.pct != null ? Math.round(cov.pct) : '—'}%)</b></span>
            <span>achieved <b style={{ color: 'var(--text)' }}>{kwh(cov.achieved)}</b></span>
            {cov.unest > 0 && <span title="Entries without a catalog link or missing old-load fields — not counted in the potential">unestimated entries <b style={{ color: '#B45309' }}>{num(cov.unest)}</b></span>}
          </div>
        </div>
      )}

      {/* scope freeze state */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px', marginBottom: 16, background: frozen ? '#E9F3EE' : 'var(--bg)' }}>
        <span lang="en" dir="ltr" style={{ fontSize: 12.5 }}>
          {frozen
            ? <>Scope <b style={{ color: '#175A3E' }}>frozen</b> {fmtDateTime(project.scope_frozen_at)} — progress &amp; COCs count in-scope buildings only.</>
            : <>Scope <b>open</b> — {num(candidates.length)} candidate{candidates.length === 1 ? '' : 's'} ({num(surveyedCandidates)} surveyed). Freezing keeps surveyed candidates and marks the rest surplus.</>}
        </span>
        {canManage && (frozen
          ? <Btn style={{ padding: '6px 11px', fontSize: 12, marginLeft: 'auto' }} disabled={unfreezing} onClick={unfreeze}>{unfreezing ? 'Unfreezing…' : 'Unfreeze scope'}</Btn>
          : <Btn variant="primary" style={{ padding: '6px 11px', fontSize: 12, marginLeft: 'auto' }} onClick={() => setFreezeOpen(true)}>Freeze scope…</Btn>)}
      </div>

      {/* commitments ledger */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>Commitment revisions <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)', marginLeft: 6 }}>APPEND-ONLY · EFFECTIVE = LATEST</span></div>
        {canManage && <Btn variant="primary" icon="plus" style={{ padding: '6px 11px', fontSize: 12 }} onClick={() => setRevOpen(true)}>New revision</Btn>}
      </div>
      {revisions.length === 0 ? <Empty icon="doc">No commitment recorded for this project yet.</Empty> : (
        <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 640 }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
            <th style={{ padding: '8px 7px', fontWeight: 600 }}>WHEN</th>
            <th style={{ padding: '8px 7px', fontWeight: 600 }}>CATEGORY</th>
            <th style={{ padding: '8px 7px', fontWeight: 600, textAlign: 'right' }}>kWh/YR</th>
            <th style={{ padding: '8px 7px', fontWeight: 600 }}>TYPE</th>
            <th style={{ padding: '8px 7px', fontWeight: 600 }}>REASON</th>
            <th style={{ padding: '8px 7px', fontWeight: 600 }}>BY</th>
          </tr></thead>
          <tbody>
            {revisions.map((r, i) => {
              const isEffective = effective[r.category] === Number(r.value_kwh_yr) && revisions.findIndex((x) => x.category === r.category) === i
              return (
                <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '8px 7px', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDateTime(r.created_at)}</td>
                  <td style={{ padding: '8px 7px', fontWeight: 600 }}>{CAT_LABEL[r.category] || r.category}{isEffective && <span style={{ marginLeft: 6, fontFamily: 'var(--mono)', fontSize: 8.5, fontWeight: 700, padding: '1px 6px', borderRadius: 5, color: '#1D6A49', background: '#E9F3EE' }}>EFFECTIVE</span>}</td>
                  <td lang="en" dir="ltr" style={{ padding: '8px 7px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{kwh(Number(r.value_kwh_yr))}</td>
                  <td style={{ padding: '8px 7px', color: 'var(--text-3)' }}>{CHANGE_LABEL[r.change_type] || r.change_type}</td>
                  <td style={{ padding: '8px 7px', color: 'var(--text-3)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.reason}>{r.reason}</td>
                  <td style={{ padding: '8px 7px', whiteSpace: 'nowrap' }}>{r.approver?.full_name || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
      )}

      {revOpen && <NewRevisionModal project={project} effective={effective} onClose={() => setRevOpen(false)} />}
      {freezeOpen && <FreezeScopeModal project={project} buildings={buildings} surveyedSet={surveyedSet} onClose={() => setFreezeOpen(false)} />}
    </div>
  )
}

function NewRevisionModal({ project, effective, onClose }) {
  const [category, setCategory] = useState('lighting')
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const cur = effective[category]
  const v = value === '' ? null : parseFloat(value)
  // change_type derived, never mis-picked: no prior revision -> initial;
  // otherwise increase/decrease vs the current effective value.
  const changeType = cur == null ? 'initial' : v != null && v > cur ? 'increase' : 'decrease'
  const valid = v != null && v >= 0 && reason.trim().length > 0 && (cur == null || v !== cur)

  const save = async () => {
    if (!valid) return
    setBusy(true)
    const { error } = await bgInsert('commitment_revisions', {
      project_id: project.id, category, value_kwh_yr: v, change_type: changeType, reason: reason.trim(),
    }, { okMsg: `Commitment ${changeType === 'initial' ? 'set' : changeType + 'd'} — effective ${kwh(v)} kWh/yr` })
    setBusy(false)
    if (!error) onClose()
  }

  return (
    <Modal open width={480} title={`New commitment revision · ${project.code}`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={busy || !valid} onClick={save}>{busy ? 'Saving…' : 'Record revision'}</Btn></>}>
      <Field label="Category">
        <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
          {SURVEY_CATEGORIES.map(([val, l]) => <option key={val} value={val}>{l}</option>)}
        </select>
      </Field>
      <Field label="Committed savings (kWh/yr)">
        <input lang="en" dir="ltr" type="text" inputMode="decimal" style={inputStyle} value={value}
          onChange={(e) => setValue(numFilter(e.target.value))} placeholder="e.g. 1500000" />
      </Field>
      <Field label="Reason (required — e.g. TARSHID letter ref)">
        <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is the target changing?" />
      </Field>
      <div lang="en" dir="ltr" style={{ background: '#F5EEDF', border: '1px solid #E7D9B8', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, color: '#8A6524' }}>
        {cur == null
          ? <>First revision for <b>{CAT_LABEL[category]}</b> — effective target becomes <b>{v != null ? kwh(v) : '—'} kWh/yr</b> (initial).</>
          : v == null || v === cur
            ? <>Current effective target: <b>{kwh(cur)} kWh/yr</b>. Enter a different value.</>
            : <>Effective target: <b>{kwh(cur)}</b> → <b>{kwh(v)} kWh/yr</b> ({changeType}).{changeType === 'increase' && project.scope_frozen_at ? ' Scope is frozen — recording this increase auto-unfreezes the surplus pool.' : ''}</>}
      </div>
    </Modal>
  )
}
