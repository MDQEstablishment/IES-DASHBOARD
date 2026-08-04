import { useMemo, useState } from 'react'
import { Btn, Empty } from './ui'
import Icon from './Icon'

// The coverage view — the pool of §1 rendered as it was drawn: rows are
// buildings, columns are ESMs, and every cell is one (building × ESM) pair.
//
// It answers "what is left?" at a glance, which the pipeline below it cannot:
// the pipeline lists certificates, and a certificate says nothing about the
// pairs nobody has certified yet. The summary line is always visible even when
// the matrix is folded away, because that one sentence is the answer most of
// the time.
//
// Five cell states, all read straight from coc_pool — this component decides
// nothing:
//   CODE     claimed by an issued lineage → opens that certificate
//   draft    claimed by a lineage whose head is still a draft
//   NN%      scope exists, installation incomplete
//   ready    offerable right now
//   —        no scope planned for this pair
const PAGE = 50

const pairPct = (p) => {
  const planned = Number(p.planned) || 0
  if (planned <= 0) return 0
  return Math.floor((100 * Math.min(Number(p.installed) || 0, planned)) / planned)
}

export default function CocCoverage({ pool, esmOpts, cocs, onOpenCoc }) {
  const [open, setOpen] = useState(true)
  const [page, setPage] = useState(0)

  const openCoc = (c) => onOpenCoc?.(c)
  const cocById = useMemo(() => Object.fromEntries((cocs || []).map((c) => [c.id, c])), [cocs])

  const esmCodes = useMemo(() => {
    const present = new Set(pool.map((p) => p.esm_code))
    const ordered = esmOpts.filter((e) => present.has(e.code)).map((e) => e.code)
    return [...ordered, ...[...present].filter((c) => !ordered.includes(c)).sort()]
  }, [pool, esmOpts])

  const buildings = useMemo(() => {
    const m = new Map()
    pool.forEach((p) => { if (!m.has(p.building_id)) m.set(p.building_id, { id: p.building_id, code: p.building_code, name: p.building_name }) })
    return [...m.values()].sort((a, b) => String(a.code).localeCompare(String(b.code)))
  }, [pool])

  const cellBy = useMemo(() => {
    const m = new Map()
    pool.forEach((p) => m.set(p.building_id + '|' + p.esm_code, p))
    return m
  }, [pool])

  const tally = useMemo(() => {
    let certified = 0, drafts = 0, ready = 0, notReady = 0
    pool.forEach((p) => {
      if (p.claim_root) { if (p.claim_status === 'draft') drafts++; else certified++ }
      else if (p.ready) ready++
      else notReady++
    })
    return { certified, drafts, ready, notReady, total: pool.length }
  }, [pool])

  if (!pool.length) return null

  const pages = Math.ceil(buildings.length / PAGE)
  const shown = pages > 1 ? buildings.slice(page * PAGE, page * PAGE + PAGE) : buildings

  const cell = (b, code) => {
    const p = cellBy.get(b.id + '|' + code)
    if (!p) return <span style={{ color: 'var(--text-faint)' }}>—</span>
    if (p.claim_root) {
      if (p.claim_status === 'draft') {
        return <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--radius-s)', color: 'var(--text-3)', background: 'var(--line-soft)' }}>draft</span>
      }
      const c = cocById[p.claim_coc]
      return (
        <button onClick={() => openCoc(c)} disabled={!c}
          style={{ fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--radius-s)', color: 'var(--accent)', background: 'var(--accent-tint)', border: 'none', cursor: c ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
          {c ? c.code : 'certified'}
        </button>
      )
    }
    if (!p.ready) return <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--warn)' }}>{pairPct(p)}%</span>
    return <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--radius-s)', color: 'var(--ok)', background: 'var(--ok-bg)' }}>ready</span>
  }

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-m)', marginBottom: 18 }}>
      <button onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ color: 'var(--text-3)', display: 'flex', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}><Icon name="chevronr" size={14} /></span>
        <span style={{ fontSize: 12.5 }}>
          <b>{tally.certified} of {tally.total} pairs certified</b>
          <span style={{ color: 'var(--text-3)' }}> · {tally.drafts} in drafts · {tally.ready} ready · {tally.notReady} not ready</span>
        </span>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--line)', padding: 13 }}>
          <div className="ies-table-wrap" style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 10px 8px 0', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>Building</th>
                  {esmCodes.map((c) => (
                    <th key={c} style={{ textAlign: 'center', padding: '6px 10px 8px', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((b) => (
                  <tr key={b.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                    <td style={{ padding: '6px 10px 6px 0', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{b.code}</span>
                      <span className="ies-ellipsis" style={{ color: 'var(--text-3)', marginLeft: 8, display: 'inline-block', maxWidth: 180, verticalAlign: 'bottom' }}>{b.name}</span>
                    </td>
                    {esmCodes.map((c) => (
                      <td key={c} style={{ padding: '6px 10px', textAlign: 'center' }}>{cell(b, c)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!shown.length && <Empty icon="buildings">No buildings in the pool.</Empty>}
          {pages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>
                {page * PAGE + 1}–{Math.min(buildings.length, page * PAGE + PAGE)} of {buildings.length}
              </span>
              <Btn style={pgBtn} disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Btn>
              <Btn style={pgBtn} disabled={page >= pages - 1} onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}>Next</Btn>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const pgBtn = { fontSize: 11.5, padding: '5px 10px' }
