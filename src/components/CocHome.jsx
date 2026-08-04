import { useState, useEffect, useMemo, useCallback } from 'react'
import { useLiveQuery, openSigned } from '../lib/db'
import { supabase } from '../lib/supabase'
import { useAuth } from '../rbac'
import { Btn, Empty, Loading, Modal } from './ui'
import { toast } from '../lib/toast'
import { ensureCocSettings, fetchCocContext, generateAndUploadCocPdf, kindLabel } from '../lib/cocPdf'
import CocBuilder from './CocBuilder'
import CocCoverage from './CocCoverage'
import CocFeedbackModal from './CocFeedbackModal'
import CocDetailDrawer from './CocDetailDrawer'

// The "COCs" home: the coverage matrix (what is left), three numbers, and a
// pipeline grouped by whose move it is.
//
// Everything on this screen reads coc_pool (0130). The layout-mode toggle is
// gone: the builder IS the layout decision now, so a project-wide setting that
// silently decided how many certificates the plan proposed had nothing left to
// decide. coc_project_settings.layout_mode keeps its data; nothing drives from
// it.
const STATUS_META = {
  draft: ['Draft', 'var(--text-3)', 'var(--line-soft)'],
  generated: ['PDF ready', 'var(--accent)', 'var(--accent-tint)'],
  sent: ['Sent to TARSHID', 'var(--esm2)', 'var(--esm2-bg)'],
  approved: ['Approved', 'var(--ok)', 'var(--ok-bg)'],
  accepted_with_comments: ['Accepted w/ comments', 'var(--warn)', 'var(--warn-bg)'],
  rejected: ['Rejected', 'var(--bad)', 'var(--bad-bg)'],
  superseded: ['Superseded', 'var(--text-3)', 'var(--line-soft)'],
}

export default function CocHome({ projectId, project, buildings, projectEsms, canManage }) {
  const { user } = useAuth()
  const [pool, setPool] = useState(null)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [feedbackCoc, setFeedbackCoc] = useState(null)
  const [detailCoc, setDetailCoc] = useState(null)
  const [delCoc, setDelCoc] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const esmOpts = useMemo(() => projectEsms.filter((pe) => pe.esm)
    .map((pe) => ({ code: pe.esm.code, name: pe.custom_name || pe.esm.name })), [projectEsms])
  const esmName = useMemo(() => Object.fromEntries(esmOpts.map((e) => [e.code, e.name])), [esmOpts])

  const { rows: cocs, refetch: refetchCocs } = useLiveQuery('cocs',
    (q) => q.select('*').eq('project_id', projectId).order('seq').order('revision'), [projectId])
  const { rows: covered } = useLiveQuery('coc_covered_buildings', (q) => q.select('coc_id,building_id'), [])
  const coveredByCoc = useMemo(() => {
    const m = {}
    covered.forEach((r) => { (m[r.coc_id] = m[r.coc_id] || []).push(r.building_id) })
    return m
  }, [covered])

  // first open: make sure settings exist (fixed Lighting-together / AC-alone pairing)
  useEffect(() => { if (esmOpts.length) ensureCocSettings(projectId, esmOpts) }, [projectId, esmOpts.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadPool = useCallback(async () => {
    const { data, error } = await supabase.rpc('coc_pool', { p_project_id: projectId })
    if (!error) setPool(Array.isArray(data) ? data : [])
  }, [projectId])
  useEffect(() => { loadPool() }, [loadPool, cocs.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const active = cocs.filter((c) => c.status !== 'superseded')
  const offerable = (pool || []).filter((p) => p.ready && !p.claim_root).length

  // ── open helpers ────────────────────────────────────────────────────────
  const openPdf = async (c) => {
    if (!c.pdf_path) { toast('No PDF yet — generate it first', 'err'); return }
    await openSigned('coc-pdfs', c.pdf_path, 'PDF')
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
  // Delete a certificate. Only DRAFTS are deletable: migration 0131 fences the
  // cocs table so an issued certificate can be superseded but not erased, and
  // the button below is gated to match rather than letting the user discover the
  // refusal in a toast. If this row supersedes a prior revision, that prior rev
  // is resurfaced first so the chain never points at a dead row. Junction rows
  // cascade, and the freed pairs return to the pool.
  const deleteCoc = async (c) => {
    setBusyId(c.id)
    try {
      const prior = cocs.find((x) => x.superseded_by_coc_id === c.id)
      if (prior) {
        // Restore the prior revision FIRST and stop if it fails — deleting the
        // newer rev anyway would leave the chain pointing at a dead row.
        // 9K(1c): status and superseded_by_coc_id are certificate STATE, which
        // only the workflow may move (migration 0114). The RPC recomputes the
        // same status this call used to send — the prior revision's feedback
        // outcome, or 'rejected' — server-side.
        const { data: pd, error: pErr } = await supabase.rpc('restore_prior_coc_revision', { p_superseding_coc_id: c.id })
        if (pErr || !pd?.ok) { toast("Couldn't restore the prior revision — " + (pErr?.message || pd?.error || 'no permission'), 'err'); return }
      }
      const { error } = await supabase.from('cocs').delete().eq('id', c.id)
      if (error) { toast("Couldn't delete — " + error.message, 'err'); return }
      if (c.pdf_path) await supabase.storage.from('coc-pdfs').remove([c.pdf_path]).catch(() => {})
      if (c.feedback_doc_path) await supabase.storage.from('coc-responses').remove([c.feedback_doc_path]).catch(() => {})
      toast(`${c.code}${c.revision > 1 ? ` Rev ${c.revision}` : ''} deleted`)
      setDelCoc(null); refetchCocs(); loadPool()
    } finally { setBusyId(null) }
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
      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--line)', borderRadius: 'var(--radius-m)', padding: '10px 12px', background: 'var(--surface-1)' }}>
        <button onClick={() => setDetailCoc(c)} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>{c.code}{c.revision > 1 ? ` · Rev ${c.revision}` : ''}</span>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{kindLabel(c.esm_codes, esmName)} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({(c.esm_codes || []).join(' + ')})</span></span>
          <span className="ies-ellipsis" style={{ fontSize: 11.5, color: 'var(--text-3)', maxWidth: 220 }} title={bCodes.join(', ')}>
            {bCodes.length === buildings.length && buildings.length > 1 ? `all ${buildings.length} buildings` : bCodes.join(', ') || '—'}
          </span>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-s)', color: col, background: bg, whiteSpace: 'nowrap' }}>
            {lbl}{age != null ? ` · ${age}d` : ''}
          </span>
        </button>
        {c.pdf_path && <Btn style={rowBtn} onClick={() => openPdf(c)}>Open PDF</Btn>}
        {canManage && c.status === 'generated' && <Btn style={rowBtn} disabled={busyId === c.id} onClick={() => generateOne(c)}>{busyId === c.id ? 'Regenerating…' : 'Regenerate PDF'}</Btn>}
        {actionFor(c)}
        {canManage && c.status === 'draft' && <button onClick={() => setDelCoc(c)} disabled={busyId === c.id} style={{ background: 'none', border: 'none', padding: '0 2px', cursor: 'pointer', color: 'var(--bad)', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>Delete</button>}
      </div>
    )
  }

  const stage = (title, list, hint) => list.length > 0 && (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>{title} · {list.length}{hint ? ` — ${hint}` : ''}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{list.map(row)}</div>
    </div>
  )

  if (pool === null && cocs.length === 0) return <Loading label="Loading certificates…" />

  return (
    <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Completion certificates</div>
        </div>
        {canManage && (
          <Btn variant="primary" icon="doc" disabled={offerable === 0} onClick={() => setBuilderOpen(true)}>
            {offerable > 0 ? `Generate — ${offerable} pair${offerable === 1 ? '' : 's'} ready` : 'Nothing ready to certify'}
          </Btn>
        )}
      </div>

      <CocCoverage pool={pool || []} esmOpts={esmOpts} cocs={cocs} onOpenCoc={setDetailCoc} />

      {/* three numbers */}
      <div style={{ display: 'flex', gap: 10, margin: '0 0 18px', flexWrap: 'wrap' }}>
        {[[pool === null ? '—' : offerable, 'pairs ready'], [waiting.length, 'with TARSHID'], [done.length, 'approved']].map(([n, l]) => (
          <div key={l} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-m)', padding: '10px 16px', minWidth: 110, textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700 }}>{n}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{l}</div>
          </div>
        ))}
      </div>

      {active.length === 0 ? (
        <Empty icon="doc">{offerable > 0 ? 'No certificates yet — Generate composes the first one.' : 'No certificates yet.'}</Empty>
      ) : (
        <>
          {stage('NEEDS YOUR ACTION', needsAction)}
          {stage('WAITING ON TARSHID', waiting)}
          {stage('DONE', done)}
        </>
      )}

      {builderOpen && (
        <CocBuilder projectId={projectId} project={project} esmOpts={esmOpts} esmName={esmName}
          pool={pool || []} cocs={cocs}
          onClose={() => setBuilderOpen(false)} onDone={() => { refetchCocs(); loadPool() }} />
      )}
      {feedbackCoc && (
        <CocFeedbackModal coc={feedbackCoc} onClose={() => setFeedbackCoc(null)}
          onDone={() => { setFeedbackCoc(null); refetchCocs() }} />
      )}
      {detailCoc && (
        <CocDetailDrawer coc={detailCoc} buildings={buildings} esmName={esmName}
          onClose={() => setDetailCoc(null)} />
      )}
      {delCoc && (
        <Modal open width={460} title={`Delete ${delCoc.code}${delCoc.revision > 1 ? ` Rev ${delCoc.revision}` : ''}?`} onClose={() => setDelCoc(null)}
          footer={<>
            <Btn onClick={() => setDelCoc(null)}>Cancel</Btn>
            <Btn variant="primary" disabled={busyId === delCoc.id} style={{ background: 'var(--bad)' }} onClick={() => deleteCoc(delCoc)}>{busyId === delCoc.id ? 'Deleting…' : 'Delete certificate'}</Btn>
          </>}>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            This removes the draft and its PDF. Its pairs return to the pool.
          </div>
        </Modal>
      )}
    </div>
  )
}

const rowBtn = { fontSize: 11.5, padding: '6px 10px', whiteSpace: 'nowrap' }
