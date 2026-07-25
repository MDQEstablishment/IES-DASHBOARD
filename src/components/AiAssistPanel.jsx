import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Btn, Modal, Empty } from './ui'
import Icon from './Icon'
import { toast } from '../lib/toast'
import { num } from '../lib/format'

// 9D-4 — AI assist for the saving sheet. The agent proposes; nothing reaches a
// survey row until a human clicks Accept. Accepted decisions are written to
// PERMANENT memory (model_aliases / replacement_choices) so the same string is
// never sent to the model again — human decisions are stored as source=human
// and are never overwritten by a later AI run.
const norm = (s) => String(s ?? '').toLowerCase()
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
  .replace(/[^a-z0-9]+/g, ' ').trim()

const conf = (c) => (c == null ? '—' : `${num(Math.round(c * 100))}%`)
const confColor = (c) => (c >= 0.85 ? 'var(--ok)' : c >= 0.6 ? '#B45309' : 'var(--bad)')

export default function AiAssistPanel({ project, entries, onChanged, onGoSurvey }) {
  const [busy, setBusy] = useState(null)          // 'match' | 'replace' | 'adjust'
  const [result, setResult] = useState(null)      // { job, cached, proposals, stats }
  const [picked, setPicked] = useState(() => new Set())
  const [instruction, setInstruction] = useState('')
  const [askAdjust, setAskAdjust] = useState(false)
  const [unavailable, setUnavailable] = useState(null)

  const ac = entries.filter((e) => e.category === 'ac')
  const unmatched = ac.filter((e) => !e.registry_id).length
  const unmapped = ac.filter((e) => !e.catalog_item_id).length

  const run = async (job, extra = {}) => {
    setBusy(job); setResult(null); setUnavailable(null)
    const { data, error } = await supabase.functions.invoke('saving-sheet-agent', {
      body: { project_id: project.id, job, ...extra },
    })
    setBusy(null)
    if (error) {
      // graceful degradation — the rest of the saving sheet keeps working
      let msg = 'The AI assistant is unavailable right now.'
      try { const j = await error.context?.json?.(); if (j?.message) msg = j.message } catch { /* keep default */ }
      setUnavailable(msg); toast(msg, 'err'); return
    }
    if (data?.error) { setUnavailable(data.message || data.error); toast(data.message || data.error, 'err'); return }
    setResult(data)
    // pre-select cached (certain) + high-confidence proposals; the click is still explicit
    const pre = new Set()
    ;(data.cached || []).forEach((c) => pre.add('c:' + (c.entry_id)))
    ;(data.proposals || []).forEach((p, i) => { if ((p.registry_id || p.catalog_item_id) && p.confidence >= 0.85) pre.add('p:' + i) })
    setPicked(pre)
    const asked = data.stats?.asked ?? 0
    toast(asked === 0
      ? `Nothing new to ask — ${num(data.stats?.from_cache || 0)} resolved from memory (no AI cost)`
      : `${num(asked)} asked · ${num(data.stats?.from_cache || 0)} from memory · ${num(data.stats?.tokens_in || 0)} in / ${num(data.stats?.tokens_out || 0)} out tokens`)
  }

  const toggle = (k) => setPicked((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n })

  const accept = async () => {
    if (!result) return
    setBusy('apply')
    let rows = 0, mem = 0
    const isMatch = result.job === 'match'
    try {
      // cached entries (exact / remembered) — apply directly to the survey rows
      for (const c of (result.cached || [])) {
        if (!picked.has('c:' + c.entry_id)) continue
        const patch = isMatch
          ? { registry_id: c.registry_id, match_source: c.source === 'alias' ? 'ai' : 'human', match_confidence: c.confidence ?? 1 }
          : { catalog_item_id: c.catalog_item_id }
        const { error } = await supabase.from('survey_entries').update(patch).eq('id', c.entry_id).select('id')
        if (!error) rows++
      }
      // AI proposals — write the survey rows AND the permanent memory
      for (let i = 0; i < (result.proposals || []).length; i++) {
        if (!picked.has('p:' + i)) continue
        const p = result.proposals[i]
        if (isMatch) {
          if (!p.registry_id) continue
          for (const id of p.entry_ids || []) {
            const { error } = await supabase.from('survey_entries')
              .update({ registry_id: p.registry_id, match_source: 'ai', match_confidence: p.confidence })
              .eq('id', id).select('id')
            if (!error) rows++
          }
          // alias memory: accepted-by-human, so this string never costs a token again
          const { error: aErr } = await supabase.from('model_aliases').upsert({
            raw_normalized: p.key || norm(p.raw), raw_sample: p.raw,
            registry_id: p.registry_id, confidence: p.confidence, source: 'human', reason: p.reason,
          }, { onConflict: 'raw_normalized' })
          if (!aErr) mem++
        } else {
          if (!p.catalog_item_id) continue
          for (const id of p.entry_ids || []) {
            const { error } = await supabase.from('survey_entries')
              .update({ catalog_item_id: p.catalog_item_id }).eq('id', id).select('id')
            if (!error) rows++
          }
          const { error: rErr } = await supabase.from('replacement_choices').upsert({
            registry_id: p.registry_id, catalog_item_id: p.catalog_item_id, source: 'human', reason: p.reason,
          }, { onConflict: 'registry_id' })
          if (!rErr) mem++
        }
      }
      toast(`${num(rows)} survey row${rows === 1 ? '' : 's'} updated · ${num(mem)} decision${mem === 1 ? '' : 's'} remembered`)
      setResult(null); setPicked(new Set()); onChanged?.()
    } catch (e) {
      toast('Could not apply — ' + (e?.message || e), 'err')
    }
    setBusy(null)
  }

  const proposals = result?.proposals || []
  const resolvedProps = proposals.filter((p) => p.registry_id || p.catalog_item_id)
  const unresolved = proposals.filter((p) => !p.registry_id && !p.catalog_item_id)
  const selectedCount = picked.size

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>AI assist</div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, color: '#6D5A8E', background: '#F3E8FF' }}>PROPOSES · YOU DECIDE</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn disabled={!!busy || unmatched === 0} onClick={() => run('match')}>
            {busy === 'match' ? 'Resolving…' : `Resolve ${num(unmatched)} unmapped model${unmatched === 1 ? '' : 's'}`}
          </Btn>
          <Btn disabled={!!busy || unmapped === 0} onClick={() => run('replace')}>
            {busy === 'replace' ? 'Suggesting…' : `Suggest replacements for ${num(unmapped)} row${unmapped === 1 ? '' : 's'}`}
          </Btn>
          <Btn disabled={!!busy} onClick={() => setAskAdjust(true)}>Adjust…</Btn>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>
        The assistant only makes judgement calls (which registry model, which approved replacement) — every number is computed by the platform, not the model. Strings resolved once are remembered forever and never re-sent, so re-running costs nothing when there is no new data.
      </div>

      {unavailable && (
        <div style={{ background: '#FAF3E3', border: '1px solid #EBDCB2', color: '#854D0E', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, marginBottom: 10 }}>
          {unavailable} Everything else on this page still works — you can map replacements by hand in the survey.
        </div>
      )}

      {result && (
        <>
          <div lang="en" dir="ltr" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>
            <span>ASKED <b style={{ color: 'var(--text)' }}>{num(result.stats?.asked || 0)}</b></span>
            <span>FROM MEMORY <b style={{ color: 'var(--ok)' }}>{num(result.stats?.from_cache || 0)}</b> (no cost)</span>
            <span>TOKENS <b style={{ color: 'var(--text)' }}>{num(result.stats?.tokens_in || 0)}</b> in / <b style={{ color: 'var(--text)' }}>{num(result.stats?.tokens_out || 0)}</b> out</span>
            {result.stats?.cache_read > 0 && <span>CACHE READ <b style={{ color: 'var(--ok)' }}>{num(result.stats.cache_read)}</b></span>}
            <span>EST. COST <b style={{ color: 'var(--text)' }}>${(result.stats?.cost || 0).toFixed(4)}</b></span>
          </div>

          {(result.cached?.length > 0 || resolvedProps.length > 0) ? (
            <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
                <th style={{ padding: '7px 6px', fontWeight: 600, width: 28 }} />
                <th style={{ padding: '7px 6px', fontWeight: 600 }}>SURVEYED / OLD UNIT</th>
                <th style={{ padding: '7px 6px', fontWeight: 600 }}>{result.job === 'match' ? 'REGISTRY MATCH' : 'PROPOSED REPLACEMENT'}</th>
                <th style={{ padding: '7px 6px', fontWeight: 600, textAlign: 'right' }}>CONF.</th>
                <th style={{ padding: '7px 6px', fontWeight: 600 }}>WHY</th>
                <th style={{ padding: '7px 6px', fontWeight: 600, textAlign: 'right' }}>ROWS</th>
              </tr></thead>
              <tbody>
                {(result.cached || []).map((c) => (
                  <tr key={'c' + c.entry_id} style={{ borderTop: '1px solid var(--line)', background: '#FCFBF7' }}>
                    <td style={{ padding: '6px' }}><input type="checkbox" checked={picked.has('c:' + c.entry_id)} onChange={() => toggle('c:' + c.entry_id)} /></td>
                    <td style={{ padding: '6px' }}>{c.raw || '—'}</td>
                    <td style={{ padding: '6px', color: 'var(--ok)', fontWeight: 600 }}>{c.source === 'exact' ? 'Exact model match' : 'From memory'}</td>
                    <td lang="en" dir="ltr" style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--ok)' }}>{conf(c.confidence)}</td>
                    <td style={{ padding: '6px', color: 'var(--text-3)' }}>{c.reason} <span style={{ fontFamily: 'var(--mono)', fontSize: 8.5, color: 'var(--ok)' }}>· NO AI COST</span></td>
                    <td lang="en" dir="ltr" style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)' }}>1</td>
                  </tr>
                ))}
                {resolvedProps.map((p) => {
                  const i = proposals.indexOf(p)
                  return (
                    <tr key={'p' + i} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '6px' }}><input type="checkbox" checked={picked.has('p:' + i)} onChange={() => toggle('p:' + i)} /></td>
                      <td style={{ padding: '6px', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.raw || ''}>
                        {p.raw || [p.old?.make, p.old?.model_no].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td style={{ padding: '6px', fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {result.job === 'match'
                          ? [p.registry?.make, p.registry?.model_no, p.registry?.tr ? `${num(p.registry.tr)} TR` : null].filter(Boolean).join(' · ')
                          : [p.catalog?.equipment_type, p.catalog?.make, p.catalog?.model, p.catalog?.seer ? `SEER ${num(p.catalog.seer)}` : null].filter(Boolean).join(' · ')}
                      </td>
                      <td lang="en" dir="ltr" style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: confColor(p.confidence) }}>{conf(p.confidence)}</td>
                      <td style={{ padding: '6px', color: 'var(--text-3)', maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.reason}>{p.reason}</td>
                      <td lang="en" dir="ltr" style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{num((p.entry_ids || []).length)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          ) : <Empty icon="box">Nothing to propose.</Empty>}

          {(result.cached?.length > 0 || resolvedProps.length > 0) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{num(selectedCount)} selected — accepting writes the survey rows and remembers each decision permanently.</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <Btn onClick={() => { setResult(null); setPicked(new Set()) }}>Reject all</Btn>
                <Btn variant="primary" disabled={busy === 'apply' || selectedCount === 0} onClick={accept}>
                  {busy === 'apply' ? 'Applying…' : `Accept ${num(selectedCount)}`}
                </Btn>
              </div>
            </div>
          )}

          {unresolved.length > 0 && (
            <div style={{ marginTop: 12, border: '1px solid #EBDCB2', background: '#FAF3E3', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 12.5, color: '#854D0E', marginBottom: 5 }}>
                <Icon name="camera" size={14} /> Needs a nameplate photo — {num(unresolved.length)} model{unresolved.length === 1 ? '' : 's'} could not be identified
              </div>
              <div style={{ fontSize: 11.5, color: '#854D0E', marginBottom: 6 }}>
                The assistant returned no confident match rather than guessing. Photograph the nameplate and correct the make/model on those survey rows.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {unresolved.slice(0, 12).map((p, i) => (
                  <span key={i} title={p.reason} style={{ fontSize: 11, background: '#fff', border: '1px solid #EBDCB2', borderRadius: 6, padding: '2px 8px' }}>{p.raw || '—'}</span>
                ))}
                {unresolved.length > 12 && <span style={{ fontSize: 11, color: '#854D0E' }}>+{num(unresolved.length - 12)} more</span>}
              </div>
              {onGoSurvey && <button onClick={() => onGoSurvey('table')} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent)', background: 'none', padding: 0, marginTop: 6 }}>Open the survey rows →</button>}
            </div>
          )}
        </>
      )}

      {askAdjust && (
        <Modal open width={520} title="Adjust the suggestions" onClose={() => setAskAdjust(false)}
          footer={<><Btn onClick={() => setAskAdjust(false)}>Cancel</Btn>
            <Btn variant="primary" disabled={!instruction.trim() || !!busy} onClick={() => { setAskAdjust(false); run('adjust', { instruction: instruction.trim() }) }}>Re-suggest</Btn></>}>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 10 }}>
            Tell the assistant what to prefer. It re-runs only the affected rows and still respects the hard capacity and savings constraints.
          </div>
          <textarea lang="en" value={instruction} onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. prefer Zamil over Basic where possible · re-suggest anything under 20% savings"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 70, border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, resize: 'vertical' }} />
        </Modal>
      )}
    </div>
  )
}
