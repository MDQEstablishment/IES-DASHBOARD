import { useState, useEffect, useRef } from 'react'
import { zipSync } from 'fflate'
import { supabase } from '../lib/supabase'
import { useAuth } from '../rbac'
import { Modal, Btn, Empty, Spinner } from './ui'
import { toast } from '../lib/toast'
import { fetchCocContext, generateAndUploadCocPdf, renderCocPreview, kindLabel } from '../lib/cocPdf'

// 8S screen 2 — pick certificates on the left, see the real PDF on the right,
// generate in bulk, download everything as one ZIP.
export default function CocGenerateWizard({ projectId, project, esmName, plan, drafts, coveredByCoc, buildings, onClose, onDone }) {
  const { user } = useAuth()
  const [ctx, setCtx] = useState(null)
  const [selected, setSelected] = useState(() => new Set(plan.map((r, i) => (r.exists_coc_id ? null : i)).filter((i) => i != null)))
  const [previewKey, setPreviewKey] = useState(null)   // plan index | 'draft:'+id
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [progress, setProgress] = useState(null)       // [{label, state}]
  const [zipFiles, setZipFiles] = useState(null)       // {filename: bytes}
  const [busy, setBusy] = useState(false)
  const urlRef = useRef(null)

  const newRows = plan.map((r, i) => ({ ...r, _i: i })).filter((r) => !r.exists_coc_id)

  useEffect(() => { fetchCocContext(projectId).then(setCtx) }, [projectId])
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  // live preview — real renderCoc output for the highlighted row
  useEffect(() => {
    if (previewKey == null || !ctx) return
    let stale = false
    setPreviewBusy(true)
    const run = async () => {
      try {
        let bytes
        if (String(previewKey).startsWith('draft:')) {
          const c = drafts.find((d) => 'draft:' + d.id === previewKey)
          if (!c) return
          bytes = await renderCocPreview({ esm_codes: c.esm_codes, building_ids: coveredByCoc[c.id] || [] }, ctx, c.code)
        } else {
          const r = plan[previewKey]
          if (!r) return
          bytes = await renderCocPreview(r, ctx)
        }
        if (stale) return
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        urlRef.current = url
        setPreviewUrl(url)
      } catch (e) {
        if (!stale) toast('Preview failed — ' + (e?.message || e), 'err')
      } finally {
        if (!stale) setPreviewBusy(false)
      }
    }
    run()
    return () => { stale = true }
  }, [previewKey, ctx]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (i) => {
    const n = new Set(selected)
    n.has(i) ? n.delete(i) : n.add(i)
    setSelected(n)
  }

  const rowLabel = (r) => {
    const codes = r.building_codes || []
    const scope = codes.length === buildings.length && buildings.length > 1 ? `all ${buildings.length} buildings` : codes.join(', ')
    return `${kindLabel(r.esm_codes, esmName)} (${(r.esm_codes || []).join(' + ')}) — ${scope || 'no buildings'}`
  }

  const generate = async () => {
    if (!ctx) return
    const rows = newRows.filter((r) => selected.has(r._i)).map(({ _i, ...r }) => r)
    if (rows.length === 0 && drafts.length === 0) { toast('Nothing selected', 'err'); return }
    setBusy(true)
    const files = {}
    const steps = []
    const track = (label) => { steps.push({ label, state: 'pending' }); setProgress([...steps]) }
    const mark = (label, state) => { const s = steps.find((x) => x.label === label); if (s) s.state = state; setProgress([...steps]) }

    try {
      // 1) create the missing certificate rows
      let created = []
      if (rows.length > 0) {
        track('Creating certificate records')
        const { data, error } = await supabase.rpc('generate_cocs', { p_project_id: projectId, p_rows: rows })
        if (error || !data?.ok) { mark('Creating certificate records', 'failed'); toast("Couldn't create certificates — " + (error?.message || data?.error || ''), 'err'); setBusy(false); return }
        created = data.coc_ids || []
        mark('Creating certificate records', 'done')
      }
      // 2) fetch every COC that needs a PDF (new + pre-existing drafts)
      const ids = [...created, ...drafts.map((d) => d.id)]
      const { data: cocRows, error: cErr } = await supabase.from('cocs').select('*').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
      if (cErr) { toast("Couldn't load certificates — " + cErr.message, 'err'); setBusy(false); return }
      const { data: cov } = await supabase.from('coc_covered_buildings').select('coc_id,building_id').in('coc_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
      const covBy = {}
      ;(cov || []).forEach((x) => { (covBy[x.coc_id] = covBy[x.coc_id] || []).push(x.building_id) })
      // 3) render + upload each PDF
      for (const c of (cocRows || [])) {
        const label = `${c.code}${c.revision > 1 ? ' Rev ' + c.revision : ''}`
        track(label)
        const res = await generateAndUploadCocPdf(c, covBy[c.id] || [], ctx, user.id)
        if (res.error) { mark(label, 'failed') } else { files[res.filename] = res.bytes; mark(label, 'done') }
      }
      const ok = Object.keys(files).length
      const failed = steps.filter((s) => s.state === 'failed').length
      if (ok) toast(`${ok} PDF${ok === 1 ? '' : 's'} generated${failed ? ` · ${failed} failed` : ''}`)
      else if (failed) toast('PDF generation failed', 'err')
      setZipFiles(ok ? files : null)
      onDone?.()
    } finally { setBusy(false) }
  }

  const downloadZip = () => {
    const input = {}
    Object.entries(zipFiles).forEach(([name, bytes]) => { input[name] = [bytes, { level: 0 }] }) // PDFs don't recompress
    const zipped = zipSync(input)
    const url = URL.createObjectURL(new Blob([zipped], { type: 'application/zip' }))
    const a = document.createElement('a')
    a.href = url; a.download = `${project?.code || 'PROJECT'}-COCs.zip`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  const selCount = newRows.filter((r) => selected.has(r._i)).length
  const stateDot = (s) => s === 'done' ? '✓' : s === 'failed' ? '✗' : '…'

  return (
    <Modal open width={920} title="Generate certificates" onClose={onClose}
      footer={<>
        {zipFiles && <Btn onClick={downloadZip}>Download all as ZIP ({Object.keys(zipFiles).length})</Btn>}
        <Btn onClick={onClose}>{zipFiles ? 'Close' : 'Cancel'}</Btn>
        {!zipFiles && <Btn variant="primary" disabled={busy || !ctx || (selCount === 0 && drafts.length === 0)} onClick={generate}>
          {busy ? 'Generating…' : ctx ? `Generate ${selCount + drafts.length} PDF${selCount + drafts.length === 1 ? '' : 's'}` : 'Loading…'}
        </Btn>}
      </>}>
      <div style={{ display: 'flex', gap: 16, minHeight: 420 }}>
        {/* left: the plan */}
        <div style={{ flex: '0 0 360px', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto', maxHeight: 520 }}>
          {progress ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 4 }}>Progress</div>
              {progress.map((s) => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: s.state === 'failed' ? 'var(--bad)' : s.state === 'done' ? '#217A54' : 'var(--text-3)' }}>
                  <span style={{ fontFamily: 'var(--mono)', width: 14 }}>{stateDot(s.state)}</span>{s.label}
                </div>
              ))}
            </div>
          ) : (
            <>
              {newRows.length > 0 && <>
                <div style={{ fontWeight: 700, fontSize: 12.5 }}>New certificates to create</div>
                {newRows.map((r) => (
                  <label key={r._i} onMouseEnter={() => setPreviewKey(r._i)}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 8, border: '1px solid ' + (previewKey === r._i ? 'var(--accent)' : 'var(--line)'), borderRadius: 10, padding: '9px 11px', cursor: 'pointer', fontSize: 12.5 }}>
                    <input type="checkbox" checked={selected.has(r._i)} onChange={() => toggle(r._i)} style={{ marginTop: 2 }} />
                    <span>
                      <span style={{ fontWeight: 600 }}>{rowLabel(r)}</span>
                      {r.mixed_beneficiary && <span style={{ display: 'block', fontSize: 11, color: 'var(--warn, #B45309)' }}>Buildings have different recipients — the certificate prints without one.</span>}
                      {r.beneficiary_name && !r.mixed_beneficiary && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>Recipient: {r.beneficiary_name}</span>}
                    </span>
                  </label>
                ))}
              </>}
              {drafts.length > 0 && <>
                <div style={{ fontWeight: 700, fontSize: 12.5, marginTop: 4 }}>Drafts still needing a PDF</div>
                {drafts.map((c) => (
                  <div key={c.id} onMouseEnter={() => setPreviewKey('draft:' + c.id)}
                    style={{ border: '1px solid ' + (previewKey === 'draft:' + c.id ? 'var(--accent)' : 'var(--line)'), borderRadius: 10, padding: '9px 11px', fontSize: 12.5 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{c.code}{c.revision > 1 ? ` · Rev ${c.revision}` : ''}</span>
                    <span style={{ color: 'var(--text-3)' }}> — PDF will be generated</span>
                  </div>
                ))}
              </>}
              {newRows.length === 0 && drafts.length === 0 && <Empty icon="doc">Everything in the plan already has a certificate.</Empty>}
              {plan.some((r) => r.exists_coc_id) && (
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{plan.filter((r) => r.exists_coc_id).length} already covered by an existing certificate — not shown.</div>
              )}
            </>
          )}
        </div>
        {/* right: live PDF preview */}
        <div style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 10, background: 'var(--paper, #FAF8F2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative', minHeight: 420 }}>
          {previewUrl
            ? <iframe title="Certificate preview" src={previewUrl} style={{ width: '100%', height: 520, border: 'none', background: '#fff' }} />
            : <div style={{ color: 'var(--text-3)', fontSize: 12.5 }}>{ctx ? 'Point at a certificate on the left to preview its PDF.' : 'Loading project data…'}</div>}
          {previewBusy && <div style={{ position: 'absolute', top: 10, right: 12 }}><Spinner size={16} /></div>}
        </div>
      </div>
    </Modal>
  )
}
