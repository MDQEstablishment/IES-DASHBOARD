import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../rbac'
import { useLiveQuery, bgInsert, bgUpdate, signedUrlFor } from '../lib/db'
import { Btn, Empty, Loading, Modal } from './ui'
import Icon from './Icon'
import { toast } from '../lib/toast'
import { num, fmtDateTime } from '../lib/format'
import { loadConstants, computeProject, readiness } from '../lib/savingSheet'
import { fetchAllRows } from '../lib/tarshidImport'

// 9D-3 — the saving sheet as a formal deliverable: readiness → review → generate
// → draft/approved/shared, revisioned. pmo/admin only (like COCs).
const STATUS_META = {
  draft: ['Draft', '#A0762B', '#F5EEDF'],
  approved: ['Approved', '#217A54', '#E9F3EE'],
  shared: ['Shared with TARSHID', '#6D5A8E', '#F3E8FF'],
  superseded: ['Superseded', '#8A8577', '#F0EDE4'],
}
const FLAG_META = {
  'low-savings': ['Savings < min', '#B3362B', '#F9ECEA'],
  'capacity-out': ['Capacity out of band', '#B3362B', '#F9ECEA'],
  'type-mismatch': ['Type mismatch', '#B45309', '#FAF3E3'],
  'no-replacement': ['No replacement', '#B45309', '#FAF3E3'],
  'no-eflh': ['No EFLH', '#B45309', '#FAF3E3'],
  'no-capacity': ['No capacity', '#B45309', '#FAF3E3'],
  'no-cost': ['No cost', '#8A8577', '#F0EDE4'],
  residential: ['Residential', '#8A8577', '#F0EDE4'],
  inverter: ['Inverter', '#8A8577', '#F0EDE4'],
}
const kwh = (v) => (v == null ? '—' : num(Math.round(v)))
const pct = (v) => (v == null ? '—' : `${num(Math.round(v * 10) / 10)}%`)

export default function SavingSheetTab({ project, buildings, onGoSurvey }) {
  const { role } = useAuth()
  const canManage = ['pmo', 'admin'].includes(role)
  const [consts, setConsts] = useState(null)
  const [acCatalog, setAcCatalog] = useState([])
  const [registry, setRegistry] = useState([])
  const [assumedOldEff, setAssumedOldEff] = useState(8)
  const [loadingRef, setLoadingRef] = useState(true)
  const [busy, setBusy] = useState(false)
  const [genReport, setGenReport] = useState(null)
  const [confirmShare, setConfirmShare] = useState(null)

  const { rows: entries, loading: le } = useLiveQuery('survey_entries', (q) =>
    q.select('*').eq('project_id', project.id), [project.id])
  const { rows: ohRows } = useLiveQuery('v_operating_hours', (q) =>
    q.select('*').eq('project_id', project.id), [project.id])
  const { rows: sheets, refetch: refetchSheets } = useLiveQuery('saving_sheets', (q) =>
    q.select('*, author:profiles!saving_sheets_generated_by_fkey(full_name)').eq('project_id', project.id).order('revision', { ascending: false }), [project.id])
  const { rows: templates } = useLiveQuery('saving_sheet_templates', (q) => q.select('*').eq('active', true).order('version', { ascending: false }))
  const template = templates[0] || null

  // reference data (catalogs + registry) — chunked, no realtime needed
  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoadingRef(true)
      const [c, ac, reg, chf] = await Promise.all([
        loadConstants(),
        fetchAllRows('ac_catalog', 'id,description,equipment_type,make,model,size_category,capacity_btu,capacity_tr,seer,ieer,unit_cost,labor_cost'),
        fetchAllRows('old_model_registry', 'model_no,equivalent_seer,t1_btu'),
        supabase.from('category_hours_factors').select('assumed_old_eff').eq('category', 'ac').maybeSingle(),
      ])
      if (!alive) return
      setConsts(c); setAcCatalog(ac.rows || []); setRegistry(reg.rows || [])
      setAssumedOldEff(Number(chf?.data?.assumed_old_eff) || 8)
      setLoadingRef(false)
    })()
    return () => { alive = false }
  }, [project.id])

  const { rows, totals } = useMemo(() => {
    if (!consts) return { rows: [], totals: null }
    return computeProject({ entries, buildings, ohRows, acCatalog, registry, consts, assumedOldEff })
  }, [entries, buildings, ohRows, acCatalog, registry, consts, assumedOldEff])

  const check = useMemo(() => readiness({ project, rows, ohRows, entries, template }), [project, rows, ohRows, entries, template])

  const generate = async () => {
    if (!template) { toast('Upload a saving-sheet template in Settings first', 'err'); return }
    setBusy(true); setGenReport(null)
    try {
      const { buildSavingSheet } = await import('../lib/savingSheetGen')
      const inScope = rows.filter((r) => r.in_scope)
      const { bytes, report } = await buildSavingSheet({
        templatePath: template.storage_path, project, buildings,
        ohRows: ohRows.filter((o) => o.hours_per_year != null || o.eflh != null),
        rows: inScope,
      })
      const revision = (sheets.reduce((a, s) => Math.max(a, s.revision), 0) || 0) + 1
      const path = `${project.id}/rev${revision}-${Date.now()}.xlsx`
      const { error: upErr } = await supabase.storage.from('saving-sheets')
        .upload(path, new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), { upsert: false })
      if (upErr) { toast('Upload failed — ' + upErr.message, 'err'); setBusy(false); return }
      // previous drafts/approved become superseded (history kept)
      for (const s of sheets.filter((s) => s.status !== 'superseded')) {
        await bgUpdate('saving_sheets', s.id, { status: 'superseded' })
      }
      const { error } = await bgInsert('saving_sheets', {
        project_id: project.id, revision, template_version: template.version, storage_path: path,
        snapshot: { generated_at: new Date().toISOString(), totals, constants: consts, report, rows: inScope },
      }, { okMsg: `Revision ${revision} generated` })
      setGenReport(report)
      if (!error) refetchSheets()
    } catch (e) {
      toast('Generation failed — ' + (e?.message || e), 'err')
    }
    setBusy(false)
  }

  const download = async (s) => {
    const url = await signedUrlFor('saving-sheets', s.storage_path, 3600)
    if (url) window.open(url, '_blank', 'noopener'); else toast("Couldn't open the workbook", 'err')
  }
  const setStatus = async (s, status, extra = {}) => {
    const { error } = await bgUpdate('saving_sheets', s.id, { status, ...extra }, { okMsg: `Revision ${s.revision} → ${STATUS_META[status][0]}` })
    if (!error) { refetchSheets(); setConfirmShare(null) }
  }

  if (!canManage) return <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}><Empty icon="doc">The saving sheet is managed by PMO and admins.</Empty></div>
  if (le || loadingRef || !consts) return <Loading label="Loading survey, hours and catalogs…" />

  const violations = rows.filter((r) => r.in_scope && r.flags.some((f) => ['low-savings', 'capacity-out', 'type-mismatch'].includes(f)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── READINESS ─────────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Readiness</div>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '2px 9px', borderRadius: 6,
            color: check.ready ? '#1D6A49' : '#B45309', background: check.ready ? '#E9F3EE' : '#FAF3E3' }}>
            {check.ready ? 'READY TO GENERATE' : 'BLOCKED'}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Btn variant="primary" icon="doc" disabled={busy || !check.ready} onClick={generate}
              title={!template ? 'Upload a template in Settings → Saving Sheet Template' : !check.ready ? 'Resolve the blocking items first' : undefined}>
              {busy ? 'Generating…' : sheets.length ? 'Regenerate (new revision)' : 'Generate saving sheet'}
            </Btn>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 8 }}>
          {check.items.map((it) => {
            const ok = it.count === 0
            return (
              <div key={it.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, border: '1px solid var(--line)', borderRadius: 8, padding: '8px 11px', background: ok ? '#fff' : (it.blocking ? '#F9ECEA' : '#FAF3E3') }}>
                <span style={{ marginTop: 1, color: ok ? 'var(--ok)' : (it.blocking ? 'var(--bad)' : '#B45309'), flex: 'none' }}>
                  <Icon name={ok ? 'check' : 'alert'} size={14} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600 }}>
                    {it.label}{!ok && <span lang="en" dir="ltr" style={{ marginLeft: 6, fontFamily: 'var(--mono)', fontWeight: 700, color: it.blocking ? 'var(--bad)' : '#B45309' }}>{num(it.count)}</span>}
                  </span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>{it.hint}</span>
                  {!ok && it.link && onGoSurvey && (
                    <button onClick={() => onGoSurvey(it.link)} style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'none', padding: 0, marginTop: 2 }}>Go fix →</button>
                  )}
                </span>
              </div>
            )
          })}
        </div>
        {genReport && (
          <div lang="en" dir="ltr" style={{ marginTop: 10, background: '#E9F3EE', border: '1px solid #BFDFCF', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: '#175A3E' }}>
            Template filled — Project_Info {genReport.project_info.found ? `${num(genReport.project_info.cells)} cells` : 'sheet not found'} ·
            {' '}OH {genReport.oh.found ? `${num(genReport.oh.cells)} cells / ${num(genReport.oh.rows)} rows` : 'sheet not found'} ·
            {' '}AC_Savings {genReport.ac_savings.found ? `${num(genReport.ac_savings.cells)} cells / ${num(genReport.ac_savings.rows)} rows` : 'sheet not found'}.
            {(genReport.oh.error || genReport.ac_savings.error) && <span style={{ color: '#96271E' }}> {genReport.oh.error || ''} {genReport.ac_savings.error || ''}</span>}
          </div>
        )}
      </div>

      {/* ── REVIEW ────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Review — computed savings</div>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)' }}>
            TARIFF {num(consts.tariff_sar_kwh)} SAR/kWh · SEASONAL {num(consts.seasonal_factor)} · MIN SAVINGS {num(consts.min_savings_pct)}% · CAPACITY ±{num(consts.capacity_tolerance_pct)}%
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>
          Computed in-app from survey + operating hours + approved catalog — the same math the workbook recomputes in Excel. Inverter units and residential buildings are out of replacement scope and contribute zero savings.
        </div>
        {totals && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {[[num(totals.in_scope), 'rows in scope'], [num(totals.excluded), 'excluded'], [num(totals.units), 'units'],
              [kwh(totals.baseline_kwh), 'baseline kWh/yr'], [kwh(totals.savings_kwh), 'savings kWh/yr'],
              [pct(totals.savings_pct), 'savings %'], [num(violations.length), 'violations']].map(([v, l], i) => (
              <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '8px 13px', minWidth: 96, textAlign: 'center' }}>
                <div lang="en" dir="ltr" style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700 }}>{v}</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{l}</div>
              </div>
            ))}
          </div>
        )}
        {rows.length === 0 ? <Empty icon="box">No AC survey rows yet.</Empty> : (
          <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 900 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
              {['BLDG', 'SPACE', 'OLD UNIT', 'QTY', 'EFLH', 'NEW UNIT', 'BASELINE', 'SAVINGS', 'SAV %', 'CAP %', 'PAYBACK', 'FLAGS'].map((h, i) => (
                <th key={h} style={{ padding: '7px 6px', fontWeight: 600, whiteSpace: 'nowrap', textAlign: [3, 4, 6, 7, 8, 9, 10].includes(i) ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.entry_id} style={{ borderTop: '1px solid var(--line)', opacity: r.in_scope ? 1 : 0.55 }}>
                  <td style={{ padding: '6px', fontFamily: 'var(--mono)', fontSize: 10.5, whiteSpace: 'nowrap' }}>{r.building_code || '—'}</td>
                  <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>{r.space_type || '—'}</td>
                  <td style={{ padding: '6px', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${r.description} · old SEER ${num(r.old_seer)} (${r.old_seer_source})`}>{r.description || '—'}</td>
                  <td lang="en" dir="ltr" style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{num(r.qty)}</td>
                  <td lang="en" dir="ltr" style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{r.eflh != null ? num(r.eflh) : '—'}</td>
                  <td style={{ padding: '6px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.new_description}>{r.new_description || '—'}</td>
                  <td lang="en" dir="ltr" style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{kwh(r.baseline_kwh)}</td>
                  <td lang="en" dir="ltr" style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: r.savings_kwh > 0 ? 'var(--ok)' : 'var(--text-3)' }}>{kwh(r.savings_kwh)}</td>
                  <td lang="en" dir="ltr" style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)', color: r.savings_pct != null && r.savings_pct < consts.min_savings_pct ? 'var(--bad)' : undefined }}>{pct(r.savings_pct)}</td>
                  <td lang="en" dir="ltr" style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)', color: r.capacity_check_pct != null && Math.abs(r.capacity_check_pct) > consts.capacity_tolerance_pct ? 'var(--bad)' : undefined }}>{pct(r.capacity_check_pct)}</td>
                  <td lang="en" dir="ltr" style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{r.payback_years != null ? `${num(Math.round(r.payback_years * 10) / 10)} y` : '—'}</td>
                  <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>
                    {r.flags.filter((f) => FLAG_META[f]).map((f) => {
                      const [l, c, bg] = FLAG_META[f]
                      return <span key={f} title={l} style={{ marginRight: 4, fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 5, color: c, background: bg }}>{l}</span>
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      {/* ── REVISIONS ─────────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16, overflow: 'hidden' }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Generated revisions</div>
        {sheets.length === 0 ? <Empty icon="doc">Nothing generated yet.</Empty> : (
          <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 700 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
              <th style={{ padding: '8px 7px', fontWeight: 600 }}>REV</th>
              <th style={{ padding: '8px 7px', fontWeight: 600 }}>STATUS</th>
              <th style={{ padding: '8px 7px', fontWeight: 600 }}>TEMPLATE</th>
              <th style={{ padding: '8px 7px', fontWeight: 600, textAlign: 'right' }}>SAVINGS kWh/YR</th>
              <th style={{ padding: '8px 7px', fontWeight: 600 }}>GENERATED</th>
              <th style={{ padding: '8px 7px', fontWeight: 600 }}>BY</th>
              <th style={{ padding: '8px 7px', fontWeight: 600, textAlign: 'right' }}>ACTIONS</th>
            </tr></thead>
            <tbody>
              {sheets.map((s) => {
                const [lbl, c, bg] = STATUS_META[s.status] || STATUS_META.draft
                return (
                  <tr key={s.id} style={{ borderTop: '1px solid var(--line)', opacity: s.status === 'superseded' ? 0.6 : 1 }}>
                    <td lang="en" dir="ltr" style={{ padding: '8px 7px', fontFamily: 'var(--mono)', fontWeight: 700 }}>R{num(s.revision)}</td>
                    <td style={{ padding: '8px 7px' }}><span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6, color: c, background: bg, whiteSpace: 'nowrap' }}>{lbl}</span></td>
                    <td lang="en" dir="ltr" style={{ padding: '8px 7px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>v{num(s.template_version)}</td>
                    <td lang="en" dir="ltr" style={{ padding: '8px 7px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{kwh(s.snapshot?.totals?.savings_kwh)}</td>
                    <td style={{ padding: '8px 7px', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDateTime(s.created_at)}</td>
                    <td style={{ padding: '8px 7px', whiteSpace: 'nowrap' }}>{s.author?.full_name || '—'}</td>
                    <td style={{ padding: '8px 7px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="ies-hover" onClick={() => download(s)} style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', padding: '4px 9px', borderRadius: 6 }}>Download</button>
                      {s.status === 'draft' && <button className="ies-hover" onClick={() => setStatus(s, 'approved', { approved_at: new Date().toISOString() })} style={{ fontSize: 11, fontWeight: 700, color: '#1D6A49', padding: '4px 9px', borderRadius: 6 }}>Approve</button>}
                      {s.status === 'approved' && <button className="ies-hover" onClick={() => setConfirmShare(s)} style={{ fontSize: 11, fontWeight: 700, color: '#6D5A8E', padding: '4px 9px', borderRadius: 6 }}>Mark shared</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
      </div>

      {confirmShare && (
        <Modal open width={460} title={`Mark R${confirmShare.revision} shared with TARSHID?`} onClose={() => setConfirmShare(null)}
          footer={<><Btn onClick={() => setConfirmShare(null)}>Cancel</Btn>
            <Btn variant="primary" onClick={() => setStatus(confirmShare, 'shared', { shared_at: new Date().toISOString() })}>Mark shared</Btn></>}>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>Records that this revision was sent to TARSHID. Sharing happens outside the platform; this only logs it (audited). Regenerating later supersedes it — old revisions stay downloadable.</div>
        </Modal>
      )}
    </div>
  )
}
