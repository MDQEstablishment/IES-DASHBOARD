import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { bgUpdate, bgDelete } from '../lib/db'
import { Btn, Empty } from './ui'
import Icon from './Icon'
import { toast } from '../lib/toast'
import { num, toLatin } from '../lib/format'
import { proposeSelection, verifyAiSelection, selectionDescription, MAX_SELECTION_ROWS } from '../lib/savingSheet'

// 9D-4b — the project's OWN material-submittal shortlist, written to
// 'Aprvd Project Unit' B2:N21. The payback formula VLOOKUPs against column B,
// so description strings here are the contract with AC_Savings column W.
// Only B/C/D (+M/N) are ours; E and F:L are the workbook's formulas.
const numFilter = (s) => toLatin(s).replace(/[^\d.]/g, '')
const cell = { padding: '5px 7px', border: '1px solid var(--line-ctrl)', borderRadius: 'var(--radius-s)', background: 'var(--surface-1)', fontSize: 12, boxSizing: 'border-box' }

function CostInput({ value, onSave, disabled }) {
  const [v, setV] = useState(value == null ? '' : String(value))
  useEffect(() => { setV(value == null ? '' : String(value)) }, [value])
  return (
    <input lang="en" dir="ltr" inputMode="decimal" value={v} disabled={disabled} placeholder="—"
      onChange={(e) => setV(numFilter(e.target.value))}
      onBlur={() => {
        const raw = numFilter(v)
        const n = raw === '' ? null : parseFloat(raw)
        if (n != null && (Number.isNaN(n) || n < 0)) { toast('Cost must be a positive number', 'err'); setV(value == null ? '' : String(value)); return }
        if (n !== (value == null ? null : Number(value))) onSave(n)
      }}
      style={{ ...cell, width: 88, textAlign: 'right', fontFamily: 'var(--mono)' }} />
  )
}

// `selection` is owned by SavingSheetTab (one live subscription feeds both this
// table and the readiness report); `refetch` re-reads it after every write.
export default function ProjectUnitSelection({ project, rows, acCatalog, consts, canManage, selection, refetch }) {
  const [busy, setBusy] = useState(false)
  const [proposal, setProposal] = useState(null)
  const [asking, setAsking] = useState(false)      // agent request in flight
  const [askOpen, setAskOpen] = useState(false)
  const [instruction, setInstruction] = useState('')

  const used = selection.filter((s) => s.description).length
  const unpriced = selection.filter((s) => s.description && (s.unit_cost == null || s.labor_cost == null))
  const catById = useMemo(() => new Map(acCatalog.map((c) => [c.id, c])), [acCatalog])

  // Deterministic proposal — the same engine that re-verifies any AI answer.
  const suggest = () => {
    if (!consts) return
    const p = proposeSelection({ rows, acCatalog, consts })
    if (p.chosen.length === 0) {
      toast(p.impossible.length ? 'No compliant catalog unit exists for these surveyed rows' : 'Nothing to select yet — map replacements first', 'err')
      return
    }
    setProposal(p)
  }

  // Direction (b) of the brief — "just give me a selection". The agent
  // consolidates and applies the ESCO's preference; verifyAiSelection then
  // re-runs OUR math over every pick before any of it reaches the screen.
  const askAgent = async () => {
    if (!consts) return
    setAsking(true)
    const { data, error } = await supabase.functions.invoke('saving-sheet-agent', {
      body: { project_id: project.id, job: 'select', instruction: instruction.trim() || undefined },
    })
    setAsking(false)
    if (error || data?.error) {
      let msg = data?.message || 'The assistant is unavailable right now — “Suggest selection” still works offline.'
      try { const j = await error?.context?.json?.(); if (j?.message) msg = j.message } catch { /* keep default */ }
      toast(msg, 'err'); return
    }
    const v = verifyAiSelection({ aiSelection: data.selection || [], groupIndex: data.group_index || [], rows, acCatalog, consts })
    if (v.chosen.length === 0) { toast('The assistant found nothing that passes our capacity and savings checks', 'err'); return }
    setAskOpen(false)
    setProposal({ ...v, note: data.note || '', usedAi: data.used_ai !== false, asked: data.stats?.asked ?? 0 })
    const tin = data.stats?.tokens_in || 0, tout = data.stats?.tokens_out || 0
    toast(data.used_ai === false
      ? 'Resolved without asking the model (no AI cost)'
      : `${num(data.stats?.groups || 0)} unit group${(data.stats?.groups || 0) === 1 ? '' : 's'} · ${num(tin)} in / ${num(tout)} out tokens`)
  }

  const applyProposal = async () => {
    if (!proposal) return
    setBusy(true)
    // replace the AI/auto rows, keep human-entered rows untouched at the top
    const humanRows = selection.filter((s) => s.source === 'human' && s.description)
    const keep = humanRows.slice(0, MAX_SELECTION_ROWS)
    const keepCat = new Set(keep.map((k) => k.catalog_item_id).filter(Boolean))
    const fresh = proposal.chosen.filter((c) => !keepCat.has(c.catalog_item_id))
    const final = [...keep.map((k) => ({ ...k, _keep: true })), ...fresh].slice(0, MAX_SELECTION_ROWS)

    // clear the auto rows, then write the new set in row order
    for (const s of selection) {
      if (s.source === 'human' && s.description) continue
      await bgDelete('project_unit_selection', s.id)
    }
    let n = 0, lastErr = null
    for (let i = 0; i < final.length; i++) {
      const row_no = i + 1
      const item = final[i]
      if (item._keep) {
        if (item.row_no !== row_no) await bgUpdate('project_unit_selection', item.id, { row_no })
        continue
      }
      const { error } = await supabase.from('project_unit_selection').insert({
        project_id: project.id, row_no, catalog_item_id: item.catalog_item_id, description: item.description,
        unit_cost: item.unit_cost, labor_cost: item.labor_cost, saso_ref: item.saso_ref,
        // only genuinely AI-authored picks are recorded as 'ai' — the
        // deterministic engine's picks are the platform's own (audited SRC chip)
        datasheet_ref: item.datasheet_ref, source: item.from_ai ? 'ai' : 'human', reason: item.reason,
      })
      if (!error) n++
      else lastErr = error
    }
    setBusy(false); setProposal(null); refetch()
    if (lastErr) toast(`${num(n)} of ${num(final.filter((f) => !f._keep).length)} added — last error: ${lastErr.message}`, 'err')
    else toast(`${num(n)} model${n === 1 ? '' : 's'} added to the project selection`)
  }

  const patch = async (row, p) => { const { error } = await bgUpdate('project_unit_selection', row.id, p); if (!error) refetch() }
  const removeRow = async (row) => { const { error } = await bgDelete('project_unit_selection', row.id); if (!error) refetch() }
  const addBlank = async () => {
    const next = Math.max(0, ...selection.map((s) => s.row_no)) + 1
    if (next > MAX_SELECTION_ROWS) { toast(`The sheet only holds ${MAX_SELECTION_ROWS} models (VLOOKUP range B2:N21)`, 'err'); return }
    const { error } = await supabase.from('project_unit_selection').insert({ project_id: project.id, row_no: next, source: 'human' })
    if (error) { toast("Couldn't add a row — " + error.message, 'err'); return }
    refetch()
  }

  return (
    <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Project unit selection</div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--text-3)' }}>
          {num(used)} / {num(MAX_SELECTION_ROWS)} MODELS · WRITES 'Aprvd Project Unit' B2:N21
        </span>
        {canManage && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Btn disabled={busy || asking} onClick={suggest} title="Runs in-app, instantly, at no cost">Suggest selection</Btn>
            <Btn disabled={busy || asking} onClick={() => setAskOpen((v) => !v)} title="Ask the assistant to consolidate, with a preference in your own words">
              {asking ? 'Asking…' : 'Ask the assistant'}
            </Btn>
            <Btn disabled={busy || asking || used >= MAX_SELECTION_ROWS} onClick={addBlank}>Add row</Btn>
          </div>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>
        The models this project standardises on, with its negotiated prices. Fewer distinct models means better pricing and simpler procurement, so the suggestion consolidates: the smallest set that still gives every surveyed unit a compliant replacement (±{consts ? num(consts.capacity_tolerance_pct) : 10}% capacity, ≥{consts ? num(consts.min_savings_pct) : 15}% savings). Type, make, model, BTU, TR, SEER and C&amp;H fill themselves in the workbook from the description — we only write description, costs and references. Prices default from the catalog and can be overridden here without touching the global catalog.
      </div>

      {unpriced.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--warn-bg)', border: '1px solid #EBDCB2', color: 'var(--warn-deep)', borderRadius: 'var(--radius-s)', padding: '8px 12px', fontSize: 12.5, marginBottom: 10 }}>
          <Icon name="alert" size={14} /><span><b>{num(unpriced.length)}</b> row{unpriced.length === 1 ? '' : 's'} missing prices — payback cannot be computed until Unit Cost and labor Cost are filled.</span>
        </div>
      )}

      {askOpen && canManage && (
        <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-s)', padding: 12, marginBottom: 12, background: 'var(--bg-2, #FAF9F6)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 7 }}>
            Say what matters for this project and the assistant will consolidate around it — “as few models as possible”, “prefer one make”, “keep the cheapest that still qualifies”. Leave it blank to just get the tightest shortlist. Whatever it proposes is re-checked against our own capacity and savings math before you see it.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={instruction} onChange={(e) => setInstruction(e.target.value)} maxLength={300}
              placeholder="Optional — e.g. standardise on one make where possible"
              onKeyDown={(e) => { if (e.key === 'Enter' && !asking) askAgent() }}
              style={{ ...cell, flex: 1, minWidth: 240 }} />
            <Btn variant="primary" disabled={asking} onClick={askAgent}>{asking ? 'Asking…' : 'Ask'}</Btn>
            <Btn disabled={asking} onClick={() => setAskOpen(false)}>Cancel</Btn>
          </div>
        </div>
      )}

      {proposal && (
        <div style={{ border: '1px solid #BFDFCF', background: 'var(--ok-bg)', borderRadius: 'var(--radius-s)', padding: 12, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--ok-deep)', marginBottom: 6 }}>
            Proposed shortlist — {num(proposal.chosen.length)} model{proposal.chosen.length === 1 ? '' : 's'} cover every compliant surveyed unit
            {proposal.usedAi && <span style={{ marginLeft: 6, fontFamily: 'var(--mono)', fontSize: 8.5, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-s)', color: 'var(--esm2)', background: 'var(--esm2-bg)' }}>ASSISTANT · VERIFIED</span>}
          </div>
          {proposal.note && <div style={{ fontSize: 11.5, color: 'var(--ok-deep)', marginBottom: 6 }}>{proposal.note}</div>}
          <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 620 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
              <th style={{ padding: '6px', fontWeight: 600 }}>MODEL</th>
              <th style={{ padding: '6px', fontWeight: 600, textAlign: 'right' }}>COVERS</th>
              <th style={{ padding: '6px', fontWeight: 600, textAlign: 'right' }}>UNIT COST</th>
              <th style={{ padding: '6px', fontWeight: 600 }}>WHY</th>
            </tr></thead>
            <tbody>
              {proposal.chosen.map((c, i) => (
                <tr key={i} style={{ borderTop: '1px solid #BFDFCF' }}>
                  <td style={{ padding: '6px', fontWeight: 600, maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.description}>{c.description}</td>
                  <td lang="en" dir="ltr" style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{num(c.units)}</td>
                  <td lang="en" dir="ltr" style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)', color: c.unit_cost == null ? 'var(--warn)' : undefined }}>{c.unit_cost == null ? 'needs price' : num(c.unit_cost)}</td>
                  <td style={{ padding: '6px', color: 'var(--text-3)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.reason}>{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {proposal.dropped?.length > 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--warn-deep)', marginTop: 6 }}>
              {proposal.dropped.map((d, i) => (
                <div key={i}>{d.partial ? 'Narrowed' : 'Dropped'} — {d.description}: {d.why}. {d.partial ? '' : 'Replaced by our own best pick.'}</div>
              ))}
            </div>
          )}
          {proposal.impossible.length > 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--bad-deep)', marginTop: 6 }}>
              {num(proposal.impossible.length)} surveyed line{proposal.impossible.length === 1 ? '' : 's'} have no compliant catalog unit at all — they stay unmapped and out of the savings total.
            </div>
          )}
          {proposal.overflow && (
            <div style={{ fontSize: 11.5, color: 'var(--bad-deep)', marginTop: 6 }}>
              More than {MAX_SELECTION_ROWS} models would be needed. The workbook VLOOKUP only covers rows 2–21, so {num(proposal.uncovered.length)} line{proposal.uncovered.length === 1 ? '' : 's'} remain uncovered — consolidate or split the project.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Btn onClick={() => setProposal(null)}>Discard</Btn>
            <Btn variant="primary" disabled={busy} onClick={applyProposal}>{busy ? 'Applying…' : `Accept ${num(proposal.chosen.length)} model${proposal.chosen.length === 1 ? '' : 's'}`}</Btn>
          </div>
        </div>
      )}

      {selection.length === 0 ? (
        <Empty icon="materials">No models selected yet — use “Suggest selection”, or add rows by hand.</Empty>
      ) : (
        <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 820 }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
            <th style={{ padding: '7px 6px', fontWeight: 600, width: 30 }}>#</th>
            <th style={{ padding: '7px 6px', fontWeight: 600 }}>DESCRIPTION (COL B — VLOOKUP KEY)</th>
            <th style={{ padding: '7px 6px', fontWeight: 600, textAlign: 'right' }}>UNIT COST</th>
            <th style={{ padding: '7px 6px', fontWeight: 600, textAlign: 'right' }}>LABOR COST</th>
            <th style={{ padding: '7px 6px', fontWeight: 600 }}>SASO REF</th>
            <th style={{ padding: '7px 6px', fontWeight: 600 }}>DATASHEET</th>
            <th style={{ padding: '7px 6px', fontWeight: 600 }}>SRC</th>
            {canManage && <th style={{ padding: '7px 6px', fontWeight: 600, textAlign: 'right' }} />}
          </tr></thead>
          <tbody>
            {selection.map((s) => {
              const cat = s.catalog_item_id ? catById.get(s.catalog_item_id) : null
              return (
                <tr key={s.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td lang="en" dir="ltr" style={{ padding: '6px', fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{num(s.row_no)}</td>
                  <td style={{ padding: '6px', maxWidth: 300 }}>
                    {canManage ? (
                      <select value={s.catalog_item_id || ''} style={{ ...cell, width: '100%' }}
                        onChange={(e) => {
                          const c = catById.get(e.target.value)
                          patch(s, c ? {
                            catalog_item_id: c.id, description: selectionDescription(c), source: 'human',
                            unit_cost: s.unit_cost ?? c.unit_cost ?? null, labor_cost: s.labor_cost ?? c.labor_cost ?? null,
                            saso_ref: s.saso_ref ?? c.saso_cert_ref ?? null, datasheet_ref: s.datasheet_ref ?? c.datasheet_ref ?? null,
                          } : { catalog_item_id: null, description: null })
                        }}>
                        <option value="">Select an approved model…</option>
                        {acCatalog.map((c) => <option key={c.id} value={c.id}>{selectionDescription(c)}</option>)}
                      </select>
                    ) : <span title={s.description || ''}>{s.description || '—'}</span>}
                    {s.reason && <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2 }} title={s.reason}>{s.reason}</div>}
                  </td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}><CostInput value={s.unit_cost} disabled={!canManage} onSave={(v) => patch(s, { unit_cost: v })} /></td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}><CostInput value={s.labor_cost} disabled={!canManage} onSave={(v) => patch(s, { labor_cost: v })} /></td>
                  <td style={{ padding: '4px 6px' }}>
                    <input lang="en" defaultValue={s.saso_ref || ''} disabled={!canManage} placeholder="—"
                      onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (s.saso_ref || null)) patch(s, { saso_ref: v }) }}
                      style={{ ...cell, width: '100%', minWidth: 90 }} />
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input lang="en" defaultValue={s.datasheet_ref || ''} disabled={!canManage} placeholder="—"
                      onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (s.datasheet_ref || null)) patch(s, { datasheet_ref: v }) }}
                      style={{ ...cell, width: '100%', minWidth: 90 }} />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 8.5, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-s)',
                      color: s.source === 'human' ? 'var(--ok-deep)' : 'var(--esm2)', background: s.source === 'human' ? 'var(--ok-bg)' : 'var(--esm2-bg)' }}>
                      {s.source === 'human' ? 'ESCO' : 'AI'}
                    </span>
                  </td>
                  {canManage && (
                    <td style={{ padding: '6px', textAlign: 'right' }}>
                      <button className="ies-hover" title="Remove" onClick={() => removeRow(s)} style={{ padding: 4, borderRadius: 'var(--radius-s)', color: 'var(--bad)' }}><Icon name="x" size={13} /></button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table></div>
      )}
    </div>
  )
}
