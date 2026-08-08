import { useState, useMemo, useEffect } from 'react'
import { zipSync } from 'fflate'
import { supabase } from '../lib/supabase'
import { useLiveQuery, downloadBlob } from '../lib/db'
import { Btn, Loading } from './ui'
import DateInput from './DateInput'
import { toast } from '../lib/toast'
import { num, localToday } from '../lib/format'
import { assembleReportData, estimatedCompletion } from '../lib/progressReport'
import { BUCKETS } from '../lib/buckets'

// 9F — the real report generator. Pick a project and a FROM/TO range, review
// the estimated completion dates, generate. The workbook design lives in the
// uploaded template (Settings -> Report Template); this only supplies numbers.
const NONE = '00000000-0000-0000-0000-000000000000'
const ctrl = { padding: '7px 10px', border: '1px solid var(--line-ctrl)', borderRadius: 'var(--radius-s)', background: 'var(--surface-1)', fontSize: 12.5, boxSizing: 'border-box' }

export default function ProgressReportCard() {
  const [projectId, setProjectId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState(localToday())
  const [estDates, setEstDates] = useState({})
  const [withAnnex, setWithAnnex] = useState(true)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState('')
  const [result, setResult] = useState(null)

  const { rows: projects, loading } = useLiveQuery('projects', (q) =>
    q.select('*').is('deleted_at', null).neq('status', 'deleted').order('code'))
  const { rows: templates } = useLiveQuery('report_templates', (q) => q.select('*').eq('active', true).order('version', { ascending: false }))
  const template = templates[0] || null

  const project = projects.find((p) => p.id === projectId) || null
  const { rows: projectEsms } = useLiveQuery('project_esms', (q) =>
    q.select('id,project_id,custom_name,ordinal,esm:esms(id,code,name)').eq('project_id', projectId || NONE).order('ordinal'), [projectId])

  // default the period to the project's start once a project is chosen
  useEffect(() => {
    if (!project) return
    setFrom((f) => f || project.start_date || '')
    setEstDates((d) => (Object.keys(d).length ? d : {}))
    setResult(null)
  }, [project])

  const esmCodes = useMemo(() => projectEsms.map((pe) => pe.esm?.code).filter(Boolean), [projectEsms])
  const defaultEst = project ? estimatedCompletion(project) : ''

  const generate = async () => {
    if (!template) { toast('Upload a report template in Settings → Report Template first', 'err'); return }
    if (!project) { toast('Pick a project', 'err'); return }
    if (!from || !to) { toast('Pick both a start and an end date', 'err'); return }
    if (from > to) { toast('The start date must be on or before the end date', 'err'); return }
    setBusy(true); setResult(null)
    try {
      // everything the report reads, scoped to this project. Buildings exclude
      // surplus/archived — the same rule every other screen applies.
      const [bRes, peRes, docRes, cocRes] = await Promise.all([
        supabase.from('buildings').select('id,code,name,status_override,scope_status').eq('project_id', project.id),
        supabase.from('project_esms').select('id,esm:esms(id,code,name)').eq('project_id', project.id),
        supabase.from('project_documents').select('doc_type,status').eq('project_id', project.id),
        supabase.from('cocs').select('status').eq('project_id', project.id),
      ])
      if (bRes.error) throw bRes.error
      const buildings = (bRes.data || []).filter((b) => b.status_override !== 'archived' && b.scope_status !== 'surplus')
      const bIds = buildings.map((b) => b.id)
      if (bIds.length === 0) throw new Error('This project has no active buildings to report on')

      const [scRes, whRes] = await Promise.all([
        supabase.from('building_item_scope').select('id,building_id,planned_qty,project_esm_id').in('building_id', bIds),
        supabase.from('project_warehouse_stock').select('esm_code,qty_on_hand').eq('project_id', project.id),
      ])
      if (scRes.error) throw scRes.error
      const scopes = scRes.data || []
      const scopeIds = scopes.map((s) => s.id)

      const [ilRes, mdRes, phRes] = await Promise.all([
        scopeIds.length
          ? supabase.from('install_log').select('scope_id,qty,entry_date,qa_status').in('scope_id', scopeIds).lte('entry_date', to)
          : Promise.resolve({ data: [] }),
        supabase.from('material_deliveries').select('quantity,status,actual_date,esm_id').eq('project_id', project.id),
        supabase.from('building_photos').select('building_id,caption,taken_at,storage_path,source,esm').in('building_id', bIds).order('taken_at'),
      ])
      if (ilRes.error) throw ilRes.error

      // deliveries carry esm_id (the global ESM), project_esms carry the
      // project's instance of it — map to the shared code
      const esmCodeById = new Map((peRes.data || []).map((pe) => [pe.esm?.id, pe.esm?.code]).filter(([k]) => k))
      const deliveries = (mdRes.data || []).map((d) => ({ ...d, esm_code: esmCodeById.get(d.esm_id) || null }))
      const bCodeById = new Map(buildings.map((b) => [b.id, b.code]))
      const photos = (phRes.data || []).map((p) => ({ ...p, building_code: bCodeById.get(p.building_id) || '', bucket: BUCKETS.BUILDING_PHOTOS }))

      const data = assembleReportData({
        project, buildings, scopes, projectEsms: peRes.data || [], install: ilRes.data || [],
        deliveries, warehouse: whRes.data || [], documents: docRes.data || [], cocs: cocRes.data || [],
        photos, from, to, estDates, asOf: localToday(),
      })

      // The annex is built BEFORE the workbook: it assigns each photograph a
      // page number, and those numbers are written into the Site Evidence
      // index so the two documents agree.
      let annex = null
      if (withAnnex && data.evidence.length > 0) {
        setStep('Preparing photographs…')
        const { buildPhotoAnnex } = await import('../lib/reportPhotoAnnex')
        annex = await buildPhotoAnnex({ evidence: data.evidence, meta: data.meta })
        if (annex.evidence?.length) {
          const pageOf = new Map(annex.evidence.map((e) => [e.storage_path, e.annex_page]))
          data.evidence = data.evidence.map((e) => ({ ...e, annex_page: pageOf.get(e.storage_path) ?? null }))
        }
        if (annex.note) data.warnings = [...data.warnings, annex.note]
      }

      setStep('Filling the workbook…')
      const { buildProgressReport } = await import('../lib/progressReportGen')
      const { bytes, report } = await buildProgressReport({ templatePath: template.storage_path, data })
      const base = `${(project.code || 'project').replace(/[^\w-]/g, '')}-progress-report-${from}-to-${to}`
      let name
      if (annex?.bytes) {
        // one download, both documents — same zipSync bundling the COC wizard uses
        const zipped = zipSync({
          [`${base}.xlsx`]: [new Uint8Array(bytes), { level: 0 }],
          [`${base}-photo-annex.pdf`]: [new Uint8Array(annex.bytes), { level: 0 }],
        })
        name = `${base}.zip`
        downloadBlob(new Blob([zipped], { type: 'application/zip' }), name)
      } else {
        name = `${base}.xlsx`
        downloadBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name)
      }
      setResult({ report, data, name, annex })
      toast(`${name} downloaded`)
    } catch (e) {
      toast('Could not generate the report — ' + (e?.message || e), 'err')
    }
    setBusy(false); setStep('')
  }

  if (loading) return <Loading />

  return (
    <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Client Progress Report</div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--radius-s)', color: 'var(--ok-deep)', background: 'var(--ok-bg)' }}>Excel</span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>
        The branded workbook sent to the client: completion by ESM, the daily installation log, per-building progress, documents and COCs. Installed quantities are what the project manager logged — there is no approval gate.
      </div>

      {!template && (
        <div style={{ background: 'var(--warn-bg)', border: '1px solid var(--warn-bg)', color: 'var(--warn-deep)', borderRadius: 'var(--radius-s)', padding: '9px 12px', fontSize: 12.5, marginBottom: 12 }}>
          No report template uploaded yet — generation is disabled. A PMO or admin can upload one in <b>Settings → Report Template</b>.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
        <label style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>Project</span>
          <select style={{ ...ctrl, width: '100%' }} value={projectId} onChange={(e) => { setProjectId(e.target.value); setFrom(''); setEstDates({}) }}>
            <option value="">Select a project…</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
        </label>
        <label style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>From</span>
          <DateInput value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...ctrl, width: '100%' }} />
        </label>
        <label style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>TO</span>
          <DateInput value={to} onChange={(e) => setTo(e.target.value)} style={{ ...ctrl, width: '100%' }} />
        </label>
      </div>

      {project && esmCodes.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>
            Estimated Completion per ESM
            <span style={{ textTransform: 'none', letterSpacing: 0, marginLeft: 8, color: 'var(--text-3)' }}>
              defaults to project start + {project.total_weeks != null ? `${num(project.total_weeks)} weeks` : 'total weeks'}{defaultEst ? ` = ${defaultEst}` : ' (not set on the project)'} — editable
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {esmCodes.map((c) => (
              <label key={c} style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>{c}</span>
                <DateInput value={estDates[c] ?? defaultEst} onChange={(e) => setEstDates((d) => ({ ...d, [c]: e.target.value }))} style={{ ...ctrl, width: '100%' }} />
              </label>
            ))}
          </div>
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, marginBottom: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={withAnnex} onChange={(e) => setWithAnnex(e.target.checked)} />
        Include the site photograph annex
        <span style={{ color: 'var(--text-3)', fontSize: 11.5 }}>— adds a branded PDF of site photographs and delivers both files as one ZIP</span>
      </label>

      <Btn variant="primary" icon="doc" disabled={busy || !template || !projectId} onClick={generate}
        title={!template ? 'Upload a report template in Settings first' : !projectId ? 'Pick a project' : undefined}>
        {busy ? (step || 'Generating…') : 'Generate report'}
      </Btn>

      {result && (
        <div lang="en" dir="ltr" style={{ marginTop: 12, background: 'var(--ok-bg)', border: '1px solid var(--ok-bg)', borderRadius: 'var(--radius-s)', padding: '9px 12px', fontSize: 12, color: 'var(--ok-deep)' }}>
          <div><b>{result.name}</b></div>
          <div style={{ marginTop: 4 }}>
            {num(result.data.kpis.units_installed)} of {num(result.data.kpis.units_total)} units installed ({num(result.data.kpis.completion_pct)}%) ·
            {' '}ESM rows {num(result.report.esm_table.rows || 0)} · daily rows {num(result.report.daily_log.rows || 0)} ·
            {' '}buildings {num(result.report.buildings.rows || 0)} · evidence {num(result.report.evidence.rows || 0)} ·
            {' '}charts refreshed {num(result.report.charts_refreshed || 0)}
            {result.annex?.bytes && <> · annex {num(result.annex.pages)} pages, {num(result.annex.indexed)} photographs</>}
          </div>
          {[result.report.esm_table.error, result.report.daily_log.error, result.report.buildings.error, result.report.documents.error, result.report.evidence.error]
            .filter(Boolean).map((e, i) => <div key={i} style={{ color: 'var(--bad-deep)', marginTop: 3 }}>Template: {e}</div>)}
          {(result.data.warnings || []).map((w, i) => <div key={i} style={{ color: 'var(--warn-deep)', marginTop: 3 }}>⚠ {w}</div>)}
        </div>
      )}
    </div>
  )
}
