import { useLiveQuery, signedUrlFor } from '../lib/db'
import { Drawer, Empty } from './ui'
import { toast } from '../lib/toast'
import { kindLabel } from '../lib/cocPdf'

// 8S screen 3 — one certificate's full story: scope, dates, files, and the
// whole revision chain (every Rev shares the code; older ones are superseded).
const fmtIso = (t) => (t ? String(t).slice(0, 10) : null)
const OUTCOME_LABEL = {
  approved: 'Approved', accepted_with_comments: 'Accepted with comments', rejected: 'Rejected',
}
const STATUS_LABEL = {
  draft: 'Draft — PDF not generated yet', generated: 'PDF ready to send', sent: 'Sent to TARSHID',
  approved: 'Approved', accepted_with_comments: 'Accepted with comments', rejected: 'Rejected',
  superseded: 'Superseded by a newer revision',
}

export default function CocDetailDrawer({ coc, buildings, esmName, onClose }) {
  const root = coc.root_coc_id || coc.id
  const { rows: chain } = useLiveQuery('cocs',
    (q) => q.select('*').or(`root_coc_id.eq.${root},id.eq.${root}`).order('revision'), [root])
  const { rows: covered } = useLiveQuery('coc_covered_buildings',
    (q) => q.select('building_id').eq('coc_id', coc.id), [coc.id])
  const bCodes = covered.map((r) => buildings.find((b) => b.id === r.building_id)?.code).filter(Boolean).sort()

  const open = async (bucket, path, label) => {
    if (!path) return
    const url = await signedUrlFor(bucket, path)
    if (url) window.open(url, '_blank', 'noopener'); else toast(`Couldn't open the ${label}`, 'err')
  }

  const fileLink = (bucket, path, label) => path && (
    <button onClick={() => open(bucket, path, label)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', fontSize: 12, fontWeight: 700, textDecoration: 'underline' }}>{label}</button>
  )

  const revBlock = (c) => {
    const current = c.id === coc.id
    const events = [
      ['Created', fmtIso(c.created_at)],
      c.generated_at && ['PDF generated', fmtIso(c.generated_at)],
      c.sent_at && ['Sent to TARSHID', fmtIso(c.sent_at)],
      c.feedback_at && [OUTCOME_LABEL[c.feedback_outcome] || 'Feedback logged', fmtIso(c.feedback_at)],
    ].filter(Boolean)
    return (
      <div key={c.id} style={{ border: '1px solid ' + (current ? 'var(--accent)' : 'var(--line)'), borderRadius: 10, padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>Rev {c.revision}</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{STATUS_LABEL[c.status] || c.status}</span>
          {current && <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, color: 'var(--accent)' }}>VIEWING</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
          {events.map(([lbl, d]) => (
            <div key={lbl} style={{ display: 'flex', gap: 8, fontSize: 11.5 }}>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-3)', width: 78 }}>{d}</span><span>{lbl}</span>
            </div>
          ))}
        </div>
        {c.feedback_comments && (
          <div style={{ fontSize: 11.5, color: 'var(--text)', background: 'var(--paper, #FAF8F2)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 9px', marginTop: 6 }}>
            “{c.feedback_comments}”
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
          {fileLink('coc-pdfs', c.pdf_path, 'Open PDF')}
          {fileLink('coc-responses', c.feedback_doc_path, 'Open TARSHID response')}
        </div>
      </div>
    )
  }

  return (
    <Drawer open width={460} title={coc.code} subtitle={`${kindLabel(coc.esm_codes, esmName)} certificate · ${(coc.esm_codes || []).join(' + ')}`} onClose={onClose}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', marginBottom: 6 }}>COVERS</div>
      <div style={{ fontSize: 12.5, marginBottom: 16 }}>
        {bCodes.length === 0 ? '—' : bCodes.length === buildings.length && buildings.length > 1 ? `All ${buildings.length} buildings (${bCodes.join(', ')})` : bCodes.join(', ')}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', marginBottom: 6 }}>REVISIONS</div>
      {chain.length === 0 ? <Empty icon="doc">Loading…</Empty> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...chain].sort((a, b) => b.revision - a.revision).map(revBlock)}
        </div>
      )}
    </Drawer>
  )
}
