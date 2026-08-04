import { useState } from 'react'
import { useLiveQuery } from '../../lib/db'
import { Empty, Loading } from '../ui'
import { fmtDateTime } from '../../lib/format'

// The Settings view of what people sent Murshid's way.
//
// TWO SHAPES SINCE 0127, in one table. A written note — suggestion, problem or
// question — carries a message and no reply_to. A reaction — helpful or not
// helpful — carries a reply_to (the answer being rated) and no message at all.
// Both are feedback and both belong in the same list; splitting them across two
// screens would mean reading two screens to learn what people think.
//
// The categories are the English ones 0127's CHECK accepts. The Arabic values
// the 0119 form used are gone from the constraint, so nothing can arrive in
// them and nothing here needs to render them.
//
// The RLS policy is the actual control: pmo and admin read everything, everyone
// else reads only their own rows. This component does no role check of its own —
// it renders what the query returns, so a non-privileged user reaching this tab
// would see their own feedback and nothing else, rather than an empty screen
// that looks broken or a leak that looks fine.
//
// Rows are read-only by design. There is no policy for UPDATE or DELETE on the
// table at all, so there is nothing to wire here: feedback is a record of what
// someone said at a moment, and editing it away is not a feature. That is also
// why a thumb cannot be taken back once sent, and why the chat panel makes both
// thumbs inert the moment one is used.
const LABELS = {
  suggestion: 'Suggestion',
  problem: 'Problem',
  question: 'Question',
  helpful: 'Helpful',
  not_helpful: 'Not helpful',
}
const CATS = ['all', 'suggestion', 'problem', 'question', 'helpful', 'not_helpful']

export default function MurshidFeedback() {
  const [cat, setCat] = useState('all')
  const { rows, loading } = useLiveQuery('murshid_feedback', (q) =>
    q.select('*, author:profiles!murshid_feedback_user_id_fkey(full_name, role)')
      .order('created_at', { ascending: false }).limit(200), [])

  const shown = cat === 'all' ? rows : rows.filter((r) => r.category === cat)
  const countOf = (c) => (c === 'all' ? rows.length : rows.filter((r) => r.category === c).length)

  return (
    <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Murshid feedback</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            Written notes and thumbs on individual answers, with the screen each came from.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CATS.map((c) => (
            <button key={c} onClick={() => setCat(c)} style={{
              padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              background: cat === c ? 'var(--accent)' : 'var(--track)',
              color: cat === c ? 'var(--surface-1)' : 'var(--text-2)',
            }}>
              <span>{c === 'all' ? 'All' : LABELS[c]}</span>
              <span style={{ marginInlineStart: 6, opacity: 0.75 }}>{countOf(c)}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? <Loading /> : shown.length === 0 ? <Empty>No feedback yet.</Empty> : (
        <div className="ies-table-wrap">
          <table className="ies-tbl">
            <thead>
              <tr>
                <th>When</th>
                <th>From</th>
                <th>Screen</th>
                <th>Type</th>
                <th>What they said</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="ies-trow">
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--text-3)' }}>{fmtDateTime(r.created_at)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.author?.full_name || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--text-2)' }}>{r.screen || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{LABELS[r.category] || r.category}</td>
                  <td style={{ minWidth: 260 }}>
                    {r.message || (r.reply_to
                      ? (
                        <span style={{ color: 'var(--text-2)' }}>
                          <span style={{ color: 'var(--text-3)' }}>on this answer: </span>{r.reply_to}
                        </span>
                      )
                      : '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
