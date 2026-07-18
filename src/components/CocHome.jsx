import { useState, useEffect, useMemo, useCallback } from 'react'
import { useLiveQuery, signedUrlFor } from '../lib/db'
import { supabase } from '../lib/supabase'
import { useAuth } from '../rbac'
import { Btn, Empty, Loading } from './ui'
import { toast } from '../lib/toast'
import { ensureCocSettings, fetchCocContext, generateAndUploadCocPdf, kindLabel } from '../lib/cocPdf'
import CocSettings from './CocSettings'
import CocGenerateWizard from './CocGenerateWizard'
import CocFeedbackModal from './CocFeedbackModal'
import CocDetailDrawer from './CocDetailDrawer'

// 8S screen 1 — the single "COCs" home: a plain sentence about what this
// project needs, three numbers, and a pipeline grouped by whose move it is.
const STATUS_META = {
  draft: ['Draft', '#8A8577', '#F0EDE4'],
  generated: ['PDF ready', '#A0762B', '#F5EEDF'],
  sent: ['Sent to TARSHID', '#6D5A8E', '#F3E8FF'],
  approved: ['Approved', '#217A54', '#E9F3EE'],
  accepted_with_comments: ['Accepted w/ comments', '#B45309', '#F5E9CE'],
  rejected: ['Rejected', '#B3362B', '#F9ECEA'],
  superseded: ['Superseded', '#8A8577', '#F0EDE4'],
}

export default function CocHome({ projectId, project, buildings, projectEsms, canManage }) {
  const { user } = useAuth()
  const [plan, setPlan] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [feedbackCoc, setFeedbackCoc] = useState(null)
  const [detailCoc, setDetailCoc] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const esmOpts = useMemo(() => projectEsms.filter((pe) => pe.esm)
    .map((pe) => ({ code: pe.esm.code, name: pe.custom_name || pe.esm.name })), [projectEsms])
  const esmName = useMemo(() => Object.fromEntries(esmOpts.map((e) => [e.code, e.name])), [esmOpts])

  const { rows: cocs, refetch: refetchCocs } = useLiveQuery('cocs',
    (q) => q.select('*').eq('project_id', projectId).order('seq').order('revision'), [projectId])
  const { rows: settingsRows } = useLiveQuery('coc_project_settings',
    (q) => q.select('*').eq('project_id', projectId), [projectId])
  const settings = settingsRows[0]
  const { rows: covered } = useLiveQuery('coc_covered_buildings', (q) => q.select('coc_id,building_id'), [])
  const coveredByCoc = useMemo(() => {
    const m = {}
    covered.forEach((r) => { (m[r.coc_id] = m[r.coc_id] || []).push(r.building_id) })
    return m
  }, [covered])

  // first open: make sure settings exist (fixed Lighting-together / AC-alone pairing)
  useEffect(() => { if (esmOpts.length) ensureCocSettings(projectId, esmOpts) }, [projectId, esmOpts.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadPlan = useCallback(async () => {
    const { data, error } = await supabase.rpc('coc_plan_preview', { p_project_id: projectId })
    if (!error) setPlan(Array.isArray(data) ? data : [])
  }, [projectId])
  useEffect(() => { loadPlan() }, [loadPlan, cocs.length, settings?.layout_mode, JSON.stringify(settings?.esm_groupings)]) // eslint-disable-line react-hooks/exhaustive-deps

  const active = cocs.filter((c) => c.status !== 'superseded')
  const toCreate = (plan || []).filter((r) => !r.exists_coc_id)
  const missingPdf = active.filter((c) => c.status === 'draft')
  const needGenerate = toCreate.length > 0 || missingPdf.length > 0

  // ── plain-language headline ─────────────────────────────────────────────
  const groups = useMemo(() => {
    const seen = new Map()
    ;(plan || []).forEach((r) => { const k = (r.esm_codes || []).join('+'); if (!seen.has(k)) seen.set(k, r.esm_codes) })
    return [...seen.values()]
  }, [plan])
  const scattered = settings?.layout_mode === 'scattered'
  const groupPhrase = groups.map((g) => `${kindLabel(g, esmName)} (${g.join(' + ')})`).join(' and one ')
  const headline = plan === null ? '' : plan.length === 0
    ? 'Nothing to certify yet — this project has no active buildings or ESMs.'
    : scattered
      ? `Each of the ${buildings.length} buildings gets its own certificates — one ${groupPhrase} — ${plan.length} in total.`
      : `This project needs ${plan.length === 1 ? 'one certificate' : plan.length + ' certificates'} — one ${groupPhrase} — covering all ${buildings.length} building${buildings.length === 1 ? '' : 's'} together.`

  // ── open helpers ────────────────────────────────────────────────────────
  const openPdf = async (c) => {
    if (!c.pdf_path) { toast('No PDF yet — generate it first', 'err'); return }
    const url = await signedUrlFor('coc-pdfs', c.pdf_path)
    if (url) window.open(url, '_blank', 'noopener'); else toast("Couldn't open the PDF", 'err')
  }
  const generateOne = async (c) => {
    setBusyId(c.id)
    try {
      const ctx = await fetchCocContext(projectId)
      const res = await generateAndUploadCocPdf(c, coveredByCoc[c.id] || [], ctx, user.id)
      if (res.error) toast('PDF generation failed — ' + (res.error.message || ''), 'err')
      else { toast(`${c.code} Rev ${c.revision} PDF generated`); refetchCocs() }
    } finally { setBusyId(null) }
  }
  const markSent = async (c) => {
    setBusyId(c.id)
    const { data, error } = await supabase.rpc('mark_coc_sent', { p_coc_id: c.id })
    setBusyId(null)
    if (error || !data?.ok) { toast("Couldn't mark as sent — " + (error?.message || data?.error || ''), 'err'); return }
    toast(`${c.code} marked as sent to TARSHID`); refetchCocs()
  }
  const createRevision = async (c) => {
    setBusyId(c.id)
    const { data, error } = await supabase.rpc('create_coc_revision', { p_source_coc_id: c.id })
    setBusyId(null)
    if (error || !data?.ok) { toast("Couldn't create the revision — " + (error?.message || data?.error || ''), 'err'); return }
    toast(`${c.code} Rev ${data.revision} created — generate its PDF next`); refetchCocs()
  }

  // ── pipeline grouping ───────────────────────────────────────────────────
  const needsAction = active.filter((c) => ['draft', 'generated', 'rejected', 'accepted_with_comments'].includes(c.status))
  const waiting = active.filter((c) => c.status === 'sent')
  const done = active.filter((c) => c.status === 'approved')
  const daysSince = (t) => (t ? Math.max(0, Math.round((Date.now() - new Date(t)) / 86400000)) : null)

  const actionFor = (c) => {
    const busy = busyId === c.id
    if (!canManage) return null
    if (c.status === 'draft') return <Btn variant="primary" disabled={busy} style={rowBtn} onClick={() => generateOne(c)}>{busy ? 'Generating…' : 'Generate PDF'}</Btn>
    if (c.status === 'generated') return <Btn variant="primary" disabled={busy} style={rowBtn} onClick={() => markSent(c)}>Mark as sent</Btn>
    if (c.status === 'sent') return <Btn variant="primary" disabled={busy} style={rowBtn} onClick={() => setFeedbackCoc(c)}>Log TARSHID feedback</Btn>
    if (c.status === 'rejected' || c.status === 'accepted_with_comments') return <Btn variant="primary" disabled={busy} style={rowBtn} onClick={() => createRevision(c)}>{busy ? 'Creating…' : `Create Rev ${c.revision + 1}`}</Btn>
    return null
  }

  const row = (c) => {
    const [lbl, col, bg] = STATUS_META[c.status] || STATUS_META.draft
    const bCodes = (coveredByCoc[c.id] || []).map((id) => buildings.find((b) => b.id === id)?.code).filter(Boolean)
    const age = c.status === 'sent' ? daysSince(c.sent_at) : null
    return (
      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', background: '#fff' }}>
        <button onClick={() => setDetailCoc(c)} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>{c.code}{c.revision > 1 ? ` · Rev ${c.revision}` : ''}</span>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{kindLabel(c.esm_codes, esmName)} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({(c.esm_codes || []).join(' + ')})</span></span>
          <span className="ies-ellipsis" style={{ fontSize: 11.5, color: 'var(--text-3)', maxWidth: 220 }} title={bCodes.join(', ')}>
            {bCodes.length === buildings.length && buildings.length > 1 ? `all ${buildings.length} buildings` : bCodes.join(', ') || '—'}
          </span>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: col, background: bg, whiteSpace: 'nowrap' }}>
            {lbl}{age != null ? ` · ${age}d` : ''}
          </span>
        </button>
        {c.pdf_path && <Btn style={rowBtn} onClick={() => openPdf(c)}>Open PDF</Btn>}
        {actionFor(c)}
      </div>
    )
  }

  const stage = (title, list, hint) => list.length > 0 && (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', marginBottom: 6 }}>{title} · {list.length}{hint ? ` — ${hint}` : ''}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{list.map(row)}</div>
    </div>
  )

  if (plan === null && cocs.length === 0) return <Loading label="Loading certificates…" />

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Completion certificates</div>
          <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 6, lineHeight: 1.5 }}>{headline}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
            {scattered ? 'Certificates are issued per building' : 'Certificates cover all buildings together'}
            {canManage && <> · <button onClick={() => setSettingsOpen(true)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', fontSize: 11.5, fontWeight: 700, textDecoration: 'underline' }}>Edit in settings</button></>}
          </div>
        </div>
        {canManage && needGenerate && (
          <Btn variant="primary" icon="doc" onClick={() => setWizardOpen(true)}>
            {toCreate.length > 0 ? `Generate ${toCreate.length} certificate${toCreate.length === 1 ? '' : 's'}` : 'Finish generating PDFs'}
          </Btn>
        )}
      </div>

      {/* three numbers */}
      <div style={{ display: 'flex', gap: 10, margin: '14px 0 18px', flexWrap: 'wrap' }}>
        {[[plan?.length ?? '—', 'planned'], [waiting.length, 'with TARSHID'], [done.length, 'approved']].map(([n, l]) => (
          <div key={l} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 16px', minWidth: 110, textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700 }}>{n}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{l}</div>
          </div>
        ))}
      </div>

      {active.length === 0 ? (
        <Empty icon="doc">{toCreate.length > 0 ? 'No certificates yet — use Generate to create them from the plan above.' : 'No certificates yet.'}</Empty>
      ) : (
        <>
          {stage('NEEDS YOUR ACTION', needsAction)}
          {stage('WAITING ON TARSHID', waiting)}
          {stage('DONE', done)}
        </>
      )}

      <CocSettings open={settingsOpen} projectId={projectId} buildings={buildings} onClose={() => setSettingsOpen(false)} />
      {wizardOpen && (
        <CocGenerateWizard projectId={projectId} project={project} esmName={esmName} plan={plan || []} drafts={missingPdf}
          coveredByCoc={coveredByCoc} buildings={buildings}
          onClose={() => setWizardOpen(false)} onDone={() => { refetchCocs(); loadPlan() }} />
      )}
      {feedbackCoc && (
        <CocFeedbackModal coc={feedbackCoc} onClose={() => setFeedbackCoc(null)}
          onDone={() => { setFeedbackCoc(null); refetchCocs() }} />
      )}
      {detailCoc && (
        <CocDetailDrawer coc={detailCoc} buildings={buildings} esmName={esmName}
          onClose={() => setDetailCoc(null)} />
      )}
    </div>
  )
}

const rowBtn = { fontSize: 11.5, padding: '6px 10px', whiteSpace: 'nowrap' }
