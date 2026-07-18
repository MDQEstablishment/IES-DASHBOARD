import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { uploadToBucket } from '../lib/db'
import { useAuth } from '../rbac'
import { Modal, Btn, Field, inputStyle } from './ui'
import { toast } from '../lib/toast'
import FileDropZone from './FileDropZone'

// 8S screen 4 — record what TARSHID said about a sent certificate. Approval
// happens outside the platform; this only logs the outcome + their response
// document. A rejection offers to start the next revision immediately.
const OUTCOMES = [
  ['approved', 'Approved', 'TARSHID approved the certificate as sent.'],
  ['accepted_with_comments', 'Accepted with comments', 'Accepted, but their response carries comments to note.'],
  ['rejected', 'Rejected', 'Returned — a new revision will be needed.'],
]

export default function CocFeedbackModal({ coc, onClose, onDone }) {
  const { user } = useAuth()
  const [outcome, setOutcome] = useState('approved')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [comments, setComments] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [askRevision, setAskRevision] = useState(false)

  const save = async () => {
    if (outcome === 'rejected' && !comments.trim()) { toast('Comments are required for a rejection', 'err'); return }
    setBusy(true)
    let docPath = null
    if (file) {
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf'
      const key = `${coc.project_id}/${coc.code}-R${coc.revision}-response.${ext}`
      const { path, error } = await uploadToBucket('coc-responses', file, { userId: user.id, key })
      if (error) { setBusy(false); return }
      docPath = path
    }
    const { data, error } = await supabase.rpc('log_coc_feedback', {
      p_coc_id: coc.id, p_outcome: outcome,
      p_comments: comments.trim() || null, p_doc_path: docPath,
      p_feedback_at: date ? new Date(date + 'T12:00:00Z').toISOString() : null,
    })
    setBusy(false)
    if (error || !data?.ok) { toast("Couldn't log the feedback — " + (error?.message || data?.error || ''), 'err'); return }
    toast(`${coc.code} marked ${outcome === 'accepted_with_comments' ? 'accepted with comments' : outcome}`)
    if (outcome === 'rejected') { setAskRevision(true); return }
    onDone?.()
  }

  const startRevision = async () => {
    setBusy(true)
    const { data, error } = await supabase.rpc('create_coc_revision', { p_source_coc_id: coc.id })
    setBusy(false)
    if (error || !data?.ok) { toast("Couldn't create the revision — " + (error?.message || data?.error || ''), 'err'); onDone?.(); return }
    toast(`${coc.code} Rev ${data.revision} created — generate its PDF next`)
    onDone?.()
  }

  if (askRevision) {
    return (
      <Modal open width={460} title={`Start Rev ${coc.revision + 1} now?`} onClose={() => onDone?.()}
        footer={<>
          <Btn onClick={() => onDone?.()}>Not yet</Btn>
          <Btn variant="primary" disabled={busy} onClick={startRevision}>{busy ? 'Creating…' : `Create Rev ${coc.revision + 1}`}</Btn>
        </>}>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>
          The rejection is logged. A new revision keeps the same certificate number ({coc.code}) and starts as a draft you can regenerate and resend.
        </div>
      </Modal>
    )
  }

  return (
    <Modal open width={520} title={`TARSHID feedback · ${coc.code}${coc.revision > 1 ? ` Rev ${coc.revision}` : ''}`} onClose={onClose}
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Log feedback'}</Btn>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {OUTCOMES.map(([v, label, desc]) => (
          <label key={v} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid ' + (outcome === v ? 'var(--accent)' : 'var(--line)'), background: outcome === v ? '#F5EEDF' : '#fff', borderRadius: 10, padding: '9px 12px', cursor: 'pointer' }}>
            <input type="radio" name="coc-outcome" checked={outcome === v} onChange={() => setOutcome(v)} style={{ marginTop: 2 }} />
            <span><span style={{ fontWeight: 700, fontSize: 13 }}>{label}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-3)' }}>{desc}</span></span>
          </label>
        ))}
      </div>
      <Field label="Date of their response">
        <input type="date" lang="en" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label={outcome === 'rejected' ? 'Their comments (required)' : 'Their comments (optional)'}>
        <textarea style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="What TARSHID said" />
      </Field>
      <FileDropZone label="Their response document (optional)" accept=".pdf,image/*" maxSizeMb={25} onFiles={(f) => setFile(f)} helperText="The signed/stamped response as received · 25 MB cap" />
    </Modal>
  )
}
