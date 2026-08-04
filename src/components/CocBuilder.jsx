import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { zipSync } from 'fflate'
import { supabase } from '../lib/supabase'
import { useLiveQuery, downloadBlob } from '../lib/db'
import { useAuth } from '../rbac'
import { Btn, Empty, Modal, Spinner } from './ui'
import Icon from './Icon'
import { toast } from '../lib/toast'
import { fetchCocContext, generateAndUploadCocPdf, renderCocPreview, defaultEsmGroupings, kindLabel } from '../lib/cocPdf'

// The COC builder. The unit of certification is the PAIR — one building × one
// ESM — and a certificate is a rectangle of pairs: the ESMs you tick times the
// buildings you tick. Three steps compose one rectangle; Generate allocates the
// number. Nothing before Generate costs anything.
//
// Every eligibility decision on this screen comes from the coc_pool RPC (0130).
// This file does not decide what is certifiable — it renders what the pool says
// and lets generate_cocs (0131) refuse anything a stale screen still offers.
//
// The attachment ids are docPdf.js's checkbox ids and must not drift. The labels
// here are English; the certificate itself prints the Arabic set from docPdf.js,
// which this commit does not touch.
const ATTACHMENTS = [
  ['specs', 'Specification'],
  ['samples', 'Samples'],
  ['drawings', 'Shop drawings'],
  ['photos', 'Photos'],
  ['boq', 'BOQ reference'],
  ['testReport', 'Sample test report'],
  ['inspReport', 'Sample inspection report'],
  ['other', 'Other'],
]

const pairPct = (p) => {
  const planned = Number(p.planned) || 0
  if (planned <= 0) return 0
  return Math.floor((100 * Math.min(Number(p.installed) || 0, planned)) / planned)
}
const keyOf = (s) => [...s].sort().join(',')

export default function CocBuilder({ projectId, project, esmOpts, esmName, pool, cocs, onClose, onDone }) {
  const { user } = useAuth()
  const [ctx, setCtx] = useState(null)
  const [step, setStep] = useState(1)
  const [selEsms, setSelEsms] = useState(() => new Set())
  const [selBuildings, setSelBuildings] = useState(() => new Set())
  const [query, setQuery] = useState('')
  const [attach, setAttach] = useState([])
  const [saveDefault, setSaveDefault] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rowErrors, setRowErrors] = useState(null)
  const [progress, setProgress] = useState(null)
  const [notices, setNotices] = useState([])
  const [zipFiles, setZipFiles] = useState(null)
  const urlRef = useRef(null)
  const inited = useRef(false)

  const { rows: benRows } = useLiveQuery('coc_beneficiary_assignments',
    (q) => q.select('building_id,beneficiary_name').eq('project_id', projectId), [projectId])
  const benBy = useMemo(() => {
    const m = {}
    benRows.forEach((r) => { if (r.beneficiary_name) m[r.building_id] = r.beneficiary_name })
    return m
  }, [benRows])

  const cocByIdMap = useMemo(() => Object.fromEntries((cocs || []).map((c) => [c.id, c])), [cocs])

  // ── the pool, indexed ────────────────────────────────────────────────────
  const poolBy = useMemo(() => {
    const m = new Map()
    pool.forEach((p) => m.set(p.building_id + '|' + p.esm_code, p))
    return m
  }, [pool])
  const poolEsms = useMemo(() => {
    const present = new Set(pool.map((p) => p.esm_code))
    const ordered = esmOpts.filter((e) => present.has(e.code)).map((e) => e.code)
    const extra = [...present].filter((c) => !ordered.includes(c)).sort()
    return [...ordered, ...extra]
  }, [pool, esmOpts])
  const poolBuildings = useMemo(() => {
    const m = new Map()
    pool.forEach((p) => { if (!m.has(p.building_id)) m.set(p.building_id, { id: p.building_id, code: p.building_code, name: p.building_name }) })
    return [...m.values()].sort((a, b) => String(a.code).localeCompare(String(b.code)))
  }, [pool])

  const offerableFor = (code) => pool.filter((p) => p.esm_code === code && p.ready && !p.claim_root).length

  // Quick-pick chips: the auto-derived groups, exactly as defaultEsmGroupings
  // computes them. One tap replaces N ticks; nothing new is persisted.
  const chips = useMemo(() => {
    if (poolEsms.length < 2) return []
    return defaultEsmGroupings(esmOpts.filter((e) => poolEsms.includes(e.code)))
      .filter((g) => g.length > 0)
  }, [esmOpts, poolEsms])

  // Scenario 8 — a forced choice is no choice. A step whose pool offers exactly
  // one option selects it and collapses to a chip; a single-building,
  // single-ESM project lands straight on attachments and preview.
  const lockedEsm = poolEsms.length === 1
  const lockedBld = poolBuildings.length === 1
  const liveSteps = useMemo(() => [1, 2, 3].filter((s) => !(s === 1 && lockedEsm) && !(s === 2 && lockedBld)), [lockedEsm, lockedBld])

  useEffect(() => {
    fetchCocContext(projectId).then((c) => { setCtx(c); setAttach(c?.settings?.default_attachments || []) })
  }, [projectId])
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  // Once only. onDone refetches the pool after a successful generate, and
  // without this guard that refresh would throw the user back to step 1 and
  // wipe the result they are looking at.
  useEffect(() => {
    if (inited.current || !pool.length) return
    inited.current = true
    if (lockedEsm) setSelEsms(new Set(poolEsms))
    setStep(liveSteps[0] || 3)
  }, [pool.length, lockedEsm, lockedBld]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── step 2 rows ──────────────────────────────────────────────────────────
  const codes = useMemo(() => [...selEsms], [selEsms])
  const step2Rows = useMemo(() => {
    if (!codes.length) return []
    return poolBuildings
      .filter((b) => codes.every((c) => poolBy.has(b.id + '|' + c)))
      .map((b) => {
        const cells = codes.map((c) => poolBy.get(b.id + '|' + c))
        const claimed = cells.find((p) => p.claim_root)
        const notReady = cells.filter((p) => !p.ready)
        const pct = notReady.length ? Math.min(...notReady.map(pairPct)) : 100
        const claimLabel = claimed
          ? (claimed.claim_status === 'draft' ? 'in a draft' : (cocByIdMap[claimed.claim_coc]?.code || 'certified'))
          : null
        return { ...b, cells, blocked: !!claimed || notReady.length > 0, claimLabel, pct, beneficiary: benBy[b.id] || null }
      })
  }, [codes, poolBuildings, poolBy, cocByIdMap, benBy])

  // default selection: everything ready and uncovered
  useEffect(() => {
    if (zipFiles) return
    if (!codes.length) { setSelBuildings(new Set()); return }
    const next = new Set()
    poolBuildings.forEach((b) => {
      if (codes.every((c) => { const p = poolBy.get(b.id + '|' + c); return p && p.ready && !p.claim_root })) next.add(b.id)
    })
    setSelBuildings(next)
  }, [keyOf(selEsms), poolBuildings, poolBy, !!zipFiles]) // eslint-disable-line react-hooks/exhaustive-deps

  const view = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? step2Rows.filter((r) => (r.code + ' ' + r.name).toLowerCase().includes(q)) : step2Rows
  }, [step2Rows, query])
  const selectableInView = view.filter((r) => !r.blocked)
  const allInViewSelected = selectableInView.length > 0 && selectableInView.every((r) => selBuildings.has(r.id))

  const benNames = useMemo(
    () => [...new Set([...selBuildings].map((id) => benBy[id]).filter(Boolean))],
    [selBuildings, benBy])
  const benConflict = benNames.length > 1

  // ── live preview ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 3 || !ctx || !selEsms.size || !selBuildings.size || zipFiles) return
    let stale = false
    setPreviewBusy(true)
    ;(async () => {
      try {
        const bytes = await renderCocPreview({ esm_codes: [...selEsms], building_ids: [...selBuildings] }, ctx, 'PREVIEW', attach)
        if (stale) return
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        urlRef.current = url
        setPreviewUrl(url)
      } catch (e) {
        if (!stale) toast('Preview failed — ' + (e?.message || e), 'err')
      } finally { if (!stale) setPreviewBusy(false) }
    })()
    return () => { stale = true }
  }, [step, ctx, keyOf(selEsms), keyOf(selBuildings), attach.join(','), !!zipFiles]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── generate ─────────────────────────────────────────────────────────────
  const generate = async () => {
    if (!ctx) return
    setBusy(true)
    setRowErrors(null)
    const steps = []
    const files = {}
    const allNotices = []
    const track = (label) => { steps.push({ label, state: 'pending' }); setProgress([...steps]) }
    const mark = (label, state) => { const s = steps.find((x) => x.label === label); if (s) s.state = state; setProgress([...steps]) }
    try {
      track('Creating the certificate')
      const row = { building_ids: [...selBuildings], esm_codes: [...selEsms] }
      const { data, error } = await supabase.rpc('generate_cocs', { p_project_id: projectId, p_rows: [row] })
      if (error || !data?.ok) {
        mark('Creating the certificate', 'failed')
        toast("Couldn't create the certificate — " + (error?.message || data?.error || ''), 'err')
        setProgress(null); setBusy(false); return
      }
      const errs = data.errors || []
      const created = data.coc_ids || []
      if (errs.length) { setRowErrors(errs); mark('Creating the certificate', 'failed') }
      else mark('Creating the certificate', 'done')
      if (!created.length) { setProgress(null); setBusy(false); onDone?.(); return }

      if (saveDefault) {
        await supabase.from('coc_project_settings')
          .upsert({ project_id: projectId, default_attachments: attach }, { onConflict: 'project_id' })
      }
      // Snapshot the ticks onto the certificate so re-rendering a revision later
      // reproduces the boxes ticked at issue, not today's default.
      await supabase.from('cocs').update({ attachments_checked: attach }).in('id', created)
      const { data: cocRows, error: cErr } = await supabase.from('cocs').select('*').in('id', created)
      if (cErr) { toast("Couldn't load the certificate — " + cErr.message, 'err'); setBusy(false); return }
      const { data: cov } = await supabase.from('coc_covered_buildings').select('coc_id,building_id').in('coc_id', created)
      const covBy = {}
      ;(cov || []).forEach((x) => { (covBy[x.coc_id] = covBy[x.coc_id] || []).push(x.building_id) })
      for (const c of (cocRows || [])) {
        const label = `${c.code}${c.revision > 1 ? ' Rev ' + c.revision : ''}`
        track(label)
        const res = await generateAndUploadCocPdf(c, covBy[c.id] || [], ctx, user.id)
        if (res.error) mark(label, 'failed')
        else {
          files[res.filename] = res.bytes; mark(label, 'done')
          if (res.notices?.length) allNotices.push(...res.notices.map((n) => `${c.code}: ${n}`))
        }
      }
      const ok = Object.keys(files).length
      if (ok) toast(`${ok} PDF${ok === 1 ? '' : 's'} generated`)
      else toast('PDF generation failed', 'err')
      setZipFiles(ok ? files : null)
      setNotices([...new Set(allNotices)])
      onDone?.()
    } finally { setBusy(false) }
  }

  const downloadZip = () => {
    const input = {}
    Object.entries(zipFiles).forEach(([name, bytes]) => { input[name] = [bytes, { level: 0 }] })
    downloadBlob(new Blob([zipSync(input)], { type: 'application/zip' }), `${project?.code || 'PROJECT'}-COCs.zip`)
  }

  // ── step gating ──────────────────────────────────────────────────────────
  const step1Valid = selEsms.size > 0
  const step2Valid = selBuildings.size > 0 && !benConflict
  const canEnter = (s) => (s === 1) || (s === 2 ? step1Valid : step1Valid && step2Valid)
  const idx = liveSteps.indexOf(step)
  const nextStep = liveSteps[idx + 1]
  const prevStep = liveSteps[idx - 1]

  const toggleEsm = (code) => {
    const n = new Set(selEsms)
    n.has(code) ? n.delete(code) : n.add(code)
    setSelEsms(n)
  }
  const applyChip = (group) => setSelEsms(new Set(group))
  const toggleBuilding = (id) => {
    const n = new Set(selBuildings)
    n.has(id) ? n.delete(id) : n.add(id)
    setSelBuildings(n)
  }
  const toggleAllInView = () => {
    const n = new Set(selBuildings)
    if (allInViewSelected) selectableInView.forEach((r) => n.delete(r.id))
    else selectableInView.forEach((r) => n.add(r.id))
    setSelBuildings(n)
  }

  // ── the empty state names the cause (scenario 10) ────────────────────────
  const emptyReason = () => {
    if (!poolBuildings.length) return 'No buildings are in scope with installation scope planned.'
    const free = pool.filter((p) => !p.claim_root)
    if (!free.length) return 'Every eligible pair is already covered by a certificate.'
    const closest = free.filter((p) => !p.ready).sort((a, b) => pairPct(b) - pairPct(a))[0]
    if (closest) return `Nothing is ready to certify yet. Closest: ${closest.building_code} × ${closest.esm_code} at ${pairPct(closest)}% installed.`
    return 'Nothing is ready to certify yet.'
  }
  const nothingOfferable = pool.length === 0 || !pool.some((p) => p.ready && !p.claim_root)

  // ── pieces ───────────────────────────────────────────────────────────────
  const stateDot = (s) => (s === 'done' ? '✓' : s === 'failed' ? '✗' : '…')

  const collapsedChips = () => {
    const out = []
    if (lockedEsm && selEsms.size) out.push(`ESM: ${[...selEsms].join(' + ')}`)
    if (lockedBld && poolBuildings[0]) out.push(`Building: ${poolBuildings[0].code}`)
    if (!out.length) return null
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {out.map((t) => (
          <span key={t} style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: 'var(--accent-tint)', color: 'var(--accent)' }}>{t}</span>
        ))}
      </div>
    )
  }

  const indicators = (compact) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: compact ? 0 : 14, flexWrap: 'wrap' }}>
      {liveSteps.map((s, i) => {
        const on = s === step
        const reachable = canEnter(s)
        const label = s === 1 ? 'ESMs' : s === 2 ? 'Buildings' : 'Attachments & preview'
        return (
          <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {i > 0 && <span style={{ color: 'var(--text-faint)' }}><Icon name="chevronr" size={13} /></span>}
            <button disabled={!reachable} onClick={() => reachable && setStep(s)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 999, border: 'none',
                background: on ? 'var(--accent-tint)' : 'transparent', color: on ? 'var(--accent)' : reachable ? 'var(--text-2)' : 'var(--text-faint)',
                fontSize: 12, fontWeight: on ? 700 : 500, cursor: reachable && !on ? 'pointer' : 'default',
              }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5 }}>{i + 1}</span>{label}
            </button>
          </span>
        )
      })}
    </div>
  )

  const errorBlock = () => rowErrors && rowErrors.length > 0 && (
    <div style={{ background: 'var(--bad-bg)', borderRadius: 'var(--radius-s)', padding: '10px 12px', marginBottom: 12 }}>
      {rowErrors.map((e, i) => (
        <div key={i} style={{ fontSize: 12, color: 'var(--bad-deep)', lineHeight: 1.55 }}>
          {e.error === 'not_ready' && <>
            <b>Not ready.</b> {(e.pairs || []).map((p) => `${bcode(p.building_id)} × ${p.esm_code} (${p.installed} of ${p.planned})`).join(', ')}
          </>}
          {e.error === 'already_claimed' && <>
            <b>Already certified.</b> {(e.pairs || []).map((p) => `${bcode(p.building_id)} × ${p.esm_code}`).join(', ')}
          </>}
          {e.error === 'mixed_beneficiary' && <>
            <b>More than one recipient.</b> {(e.names || []).join(' · ')}
          </>}
          {!['not_ready', 'already_claimed', 'mixed_beneficiary'].includes(e.error) && <><b>Refused.</b> {e.error}</>}
        </div>
      ))}
    </div>
  )
  const bcode = (id) => poolBuildings.find((b) => b.id === id)?.code || String(id).slice(0, 8)

  const attachmentPanel = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {ATTACHMENTS.map(([id, label]) => (
        <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={attach.includes(id)}
            onChange={() => setAttach((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]))} />
          <span>{label}</span>
        </label>
      ))}
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
        <input type="checkbox" checked={saveDefault} onChange={() => setSaveDefault((v) => !v)} />
        <span>Save as this project's default</span>
      </label>
    </div>
  )

  const summaryPanel = () => (
    <div style={{ fontSize: 12, lineHeight: 1.6 }}>
      <div><span style={{ color: 'var(--text-3)' }}>ESMs</span> {kindLabel([...selEsms], esmName)} ({[...selEsms].join(' + ')})</div>
      <div><span style={{ color: 'var(--text-3)' }}>Buildings</span> {selBuildings.size}</div>
      {benNames.length === 1 && <div><span style={{ color: 'var(--text-3)' }}>Recipient</span> {benNames[0]}</div>}
    </div>
  )

  const multiBuildingNotice = () => selBuildings.size > 1 && (
    <div style={{ background: 'var(--warn-bg)', borderRadius: 'var(--radius-s)', padding: '9px 11px', fontSize: 11.5, color: 'var(--warn-deep)', lineHeight: 1.5 }}>
      This certificate covers {selBuildings.size} buildings — meter and subscription fields print blank (single-building template).
    </div>
  )

  // ── step 3: the near-full-screen surface ─────────────────────────────────
  if (step === 3) {
    return createPortal(
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--scrim)', backdropFilter: 'blur(2px)' }}>
        <div style={{ position: 'fixed', inset: 16, background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-2)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--line)', flex: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Generate certificate</div>
              <div style={{ display: 'flex', alignItems: 'center' }}>{indicators(true)}</div>
            </div>
            <button className="ies-hover" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 'var(--radius-s)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}><Icon name="x" size={18} /></button>
          </div>
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <div style={{ flex: '0 0 300px', borderRight: '1px solid var(--line)', overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {errorBlock()}
              {progress && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {progress.map((s) => (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: s.state === 'failed' ? 'var(--bad)' : s.state === 'done' ? 'var(--ok)' : 'var(--text-3)' }}>
                      <span style={{ fontFamily: 'var(--mono)', width: 12 }}>{stateDot(s.state)}</span>{s.label}
                    </div>
                  ))}
                </div>
              )}
              {notices.length > 0 && (
                <div style={{ background: 'var(--warn-bg)', borderRadius: 'var(--radius-s)', padding: '9px 11px' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--warn-deep)', marginBottom: 4 }}>Worth checking before you send</div>
                  <ul style={{ margin: 0, paddingLeft: 15, fontSize: 11.5, color: 'var(--warn-deep)', lineHeight: 1.5 }}>
                    {notices.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              )}
              {selBuildings.size === 0 && !zipFiles ? (
                <Empty icon="doc">{emptyReason()}</Empty>
              ) : (
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>This certificate</div>
                  {summaryPanel()}
                </div>
              )}
              {multiBuildingNotice()}
              <div>
                <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>Attachments</div>
                {attachmentPanel()}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0, background: 'var(--hover)', position: 'relative' }}>
              {previewUrl
                ? <iframe title="Certificate preview" src={previewUrl} style={{ width: '100%', height: '100%', border: 'none', display: 'block', background: 'var(--surface-1)' }} />
                : <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-3)', fontSize: 12.5 }}>{ctx ? 'Building the preview…' : 'Loading project data…'}</div>}
              {previewBusy && <div style={{ position: 'absolute', top: 12, right: 14 }}><Spinner size={16} /></div>}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--line)', flex: 'none' }}>
            {zipFiles && <Btn onClick={downloadZip}>Download as ZIP ({Object.keys(zipFiles).length})</Btn>}
            {!zipFiles && prevStep && <Btn onClick={() => setStep(prevStep)}>Back</Btn>}
            <Btn onClick={onClose}>{zipFiles ? 'Close' : 'Cancel'}</Btn>
            {!zipFiles && (
              <Btn variant="primary" disabled={busy || !ctx || !selBuildings.size || !selEsms.size} onClick={generate}>
                {busy ? 'Generating…' : 'Generate certificate'}
              </Btn>
            )}
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  // ── steps 1 and 2 ────────────────────────────────────────────────────────
  return (
    <Modal open width={920} title="Generate certificate" onClose={onClose}
      footer={<>
        {prevStep && <Btn onClick={() => setStep(prevStep)}>Back</Btn>}
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary"
          disabled={step === 1 ? !step1Valid : !step2Valid}
          onClick={() => nextStep && setStep(nextStep)}>Next</Btn>
      </>}>
      {collapsedChips()}
      {indicators()}

      {nothingOfferable && step === 1 ? (
        <Empty icon="doc">{emptyReason()}</Empty>
      ) : step === 1 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {chips.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {chips.map((g) => (
                <button key={g.join('+')} onClick={() => applyChip(g)}
                  style={{ fontSize: 11.5, fontWeight: 600, padding: '5px 12px', borderRadius: 999, border: '1px solid var(--line-ctrl)', background: keyOf(selEsms) === keyOf(new Set(g)) ? 'var(--accent-tint)' : 'var(--surface-1)', color: keyOf(selEsms) === keyOf(new Set(g)) ? 'var(--accent)' : 'var(--text-2)', cursor: 'pointer' }}>
                  {g.join(' + ')}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {poolEsms.map((code) => {
              const n = offerableFor(code)
              return (
                <label key={code} style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid var(--line)', borderRadius: 'var(--radius-m)', padding: '10px 12px', cursor: 'pointer', fontSize: 12.5 }}>
                  <input type="checkbox" checked={selEsms.has(code)} onChange={() => toggleEsm(code)} />
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)', width: 52 }}>{code}</span>
                  <span style={{ flex: 1 }}>{esmName[code] || code}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: n ? 'var(--ok)' : 'var(--text-3)' }}>{n} ready</span>
                </label>
              )
            })}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--line-ctrl)', borderRadius: 'var(--radius-s)', padding: '5px 9px', flex: 1, minWidth: 200 }}>
              <span style={{ color: 'var(--text-faint)' }}><Icon name="search" size={14} /></span>
              <input lang="en" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search buildings"
                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%', color: 'var(--text)' }} />
            </span>
            <Btn style={{ fontSize: 11.5, padding: '6px 10px' }} disabled={!selectableInView.length} onClick={toggleAllInView}>
              {allInViewSelected ? 'Clear all in view' : 'Select all in view'}
            </Btn>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--text-3)' }}>{selBuildings.size} of {step2Rows.length} selected</span>
          </div>

          {benConflict && (
            <div style={{ background: 'var(--bad-bg)', borderRadius: 'var(--radius-s)', padding: '9px 11px', fontSize: 12, color: 'var(--bad-deep)' }}>
              One certificate, one recipient — this selection spans {benNames.join(' · ')}.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 380, overflow: 'auto' }}>
            {view.length === 0 && <Empty icon="buildings">No building has every selected ESM in its scope.</Empty>}
            {view.map((r) => (
              <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid var(--line)', borderRadius: 'var(--radius-m)', padding: '9px 12px', fontSize: 12.5, cursor: r.blocked ? 'default' : 'pointer', opacity: r.blocked ? 0.62 : 1 }}>
                <input type="checkbox" disabled={r.blocked} checked={selBuildings.has(r.id)} onChange={() => toggleBuilding(r.id)} />
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)', width: 78 }}>{r.code}</span>
                <span className="ies-ellipsis" style={{ flex: 1, minWidth: 0 }}>{r.name}</span>
                {r.beneficiary && <span className="ies-ellipsis" style={{ fontSize: 11, color: 'var(--text-3)', maxWidth: 170 }}>{r.beneficiary}</span>}
                {r.claimLabel
                  ? <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{r.claimLabel}</span>
                  : r.blocked
                    ? <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--warn)', whiteSpace: 'nowrap' }}>{r.pct}%</span>
                    : <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ok)', whiteSpace: 'nowrap' }}>ready</span>}
              </label>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
