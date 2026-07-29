import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useLiveQuery, bgUpdate } from '../../lib/db'
import { Btn, Empty, Loading } from '../ui'
import { toast } from '../../lib/toast'
import { num, toLatin } from '../../lib/format'

// 9D-2 — OPERATING HOURS capture (TARSHID Instr. Step 2). Rows are NEVER typed
// by hand: sync_operating_hours derives one row per (building, space type)
// from the survey. ESCO fills ONLY start/end/days/weeks + EFLH; hours/year and
// the TARSHID ref string are computed in the DB and shown read-only.
const digitsOnly = (s) => toLatin(s).replace(/[^\d.]/g, '')
const ctrl = { padding: '6px 8px', border: '1px solid var(--line-ctrl)', borderRadius: 6, background: '#fff', fontSize: 12, fontFamily: 'var(--mono)', boxSizing: 'border-box' }
const hhmm = (t) => (t ? String(t).slice(0, 5) : '')
const complete = (r) => r.start_time != null && r.end_time != null && r.days_per_week != null && r.weeks_per_year != null

// Locale-proof time entry (app convention: no native pickers — they render
// Arabic-Indic digits / 12h AM-PM on ar-locale devices). Accepts H, HH, H:MM,
// HH:MM; normalizes on blur; invalid input reverts with a toast.
function TimeInput({ value, onSave, disabled }) {
  const [v, setV] = useState(hhmm(value))
  useEffect(() => { setV(hhmm(value)) }, [value])
  const commit = () => {
    const raw = toLatin(v).replace(/[^\d:]/g, '').trim()
    if (raw === '') { if (value != null) onSave(null); return }
    const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(raw)
    const h = m ? parseInt(m[1], 10) : NaN, mi = m && m[2] != null ? parseInt(m[2], 10) : 0
    if (!m || h > 23 || mi > 59) { toast('Time must be HH:MM (24h)', 'err'); setV(hhmm(value)); return }
    const norm = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
    setV(norm)
    if (norm !== hhmm(value)) onSave(norm)
  }
  return <input lang="en" dir="ltr" inputMode="numeric" placeholder="HH:MM" value={v} disabled={disabled}
    onChange={(e) => setV(toLatin(e.target.value).replace(/[^\d:]/g, '').slice(0, 5))}
    onBlur={commit} style={{ ...ctrl, width: 62, textAlign: 'center' }} />
}

function IntInput({ value, min, max, width = 46, onSave, disabled, label }) {
  const [v, setV] = useState(value == null ? '' : String(value))
  useEffect(() => { setV(value == null ? '' : String(value)) }, [value])
  const commit = () => {
    const raw = digitsOnly(v)
    if (raw === '') { if (value != null) onSave(null); return }
    const n = parseInt(raw, 10)
    if (Number.isNaN(n) || n < min || n > max) { toast(`${label} must be ${min}–${max}`, 'err'); setV(value == null ? '' : String(value)); return }
    setV(String(n))
    if (n !== value) onSave(n)
  }
  return <input lang="en" dir="ltr" inputMode="numeric" value={v} disabled={disabled}
    onChange={(e) => setV(digitsOnly(e.target.value))} onBlur={commit}
    style={{ ...ctrl, width, textAlign: 'right' }} />
}

function EflhInput({ value, onSave, disabled }) {
  const [v, setV] = useState(value == null ? '' : String(value))
  useEffect(() => { setV(value == null ? '' : String(value)) }, [value])
  const commit = () => {
    const raw = digitsOnly(v)
    if (raw === '') { if (value != null) onSave(null); return }
    const n = parseFloat(raw)
    if (Number.isNaN(n) || n <= 0) { toast('EFLH must be a positive number', 'err'); setV(value == null ? '' : String(value)); return }
    if (n !== Number(value)) onSave(n)
  }
  return <input lang="en" dir="ltr" inputMode="decimal" value={v} disabled={disabled} placeholder="—"
    onChange={(e) => setV(digitsOnly(e.target.value))} onBlur={commit}
    style={{ ...ctrl, width: 70, textAlign: 'right' }} />
}

export default function OperatingHours({ project, canWrite }) {
  const { rows, loading, refetch } = useLiveQuery('v_operating_hours', (q) =>
    q.select('*').eq('project_id', project.id).order('building_code').order('space_type'), [project.id])
  const [building, setBuilding] = useState('all')
  const [status, setStatus] = useState('all') // all | nohours | noeflh
  const [syncing, setSyncing] = useState(false)
  // per-project guard: ProjectDetail is not remounted when navigating between
  // projects, so a plain boolean would skip the auto-sync for every project
  // after the first one visited
  const syncedRef = useRef(null)

  const sync = async (announce) => {
    setSyncing(true)
    const { data, error } = await supabase.rpc('sync_operating_hours', { p_project_id: project.id })
    setSyncing(false)
    if (error) { if (announce) toast("Couldn't sync — " + error.message, 'err'); return }
    if (data?.inserted > 0 || announce) toast(`${num(data?.inserted || 0)} new space${(data?.inserted || 0) === 1 ? '' : 's'} from the survey`)
    if (data?.inserted > 0 || announce) refetch()
  }
  // derive rows from the survey automatically on first open (writers only)
  useEffect(() => {
    if (canWrite && syncedRef.current !== project.id) { syncedRef.current = project.id; sync(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canWrite, project.id])

  const save = async (row, patch) => {
    const { error } = await bgUpdate('operating_hours', row.id, patch)
    if (!error) refetch()
  }

  const filtered = useMemo(() => rows.filter((r) => {
    if (building !== 'all' && r.building_id !== building) return false
    if (status === 'nohours' && complete(r)) return false
    if (status === 'noeflh' && r.eflh != null) return false
    return true
  }), [rows, building, status])

  const groups = useMemo(() => {
    const m = new Map()
    filtered.forEach((r) => {
      if (!m.has(r.building_id)) m.set(r.building_id, { id: r.building_id, code: r.building_code, name: r.building_name, residential: r.is_residential, rows: [] })
      m.get(r.building_id).rows.push(r)
    })
    return [...m.values()]
  }, [filtered])

  const withHours = rows.filter(complete).length
  const missingEflh = rows.filter((r) => r.eflh == null).length
  const bOpts = useMemo(() => {
    const seen = new Map()
    rows.forEach((r) => { if (!seen.has(r.building_id)) seen.set(r.building_id, r.building_code) })
    return [...seen.entries()]
  }, [rows])

  // copy-down: first complete row of the building becomes the template for ALL
  // its other spaces (hours only — EFLH stays per-space).
  const copyDown = async (g) => {
    const src = g.rows.find(complete)
    if (!src) { toast('Fill one complete row first (start, end, days, weeks)', 'err'); return }
    const targets = g.rows.filter((r) => r.id !== src.id)
    if (!targets.length) { toast('No other spaces in this building', 'err'); return }
    const patch = { start_time: src.start_time, end_time: src.end_time, days_per_week: src.days_per_week, weeks_per_year: src.weeks_per_year }
    let ok = 0
    for (let i = 0; i < targets.length; i += 8) {
      const res = await Promise.all(targets.slice(i, i + 8).map((t) => bgUpdate('operating_hours', t.id, patch)))
      ok += res.filter((r) => !r.error).length
    }
    toast(`Applied ${hhmm(src.start_time)}–${hhmm(src.end_time)} × ${num(src.days_per_week)}D × ${num(src.weeks_per_year)}W to ${num(ok)} space${ok === 1 ? '' : 's'}`)
    refetch()
  }

  const th = (t, right) => <th style={{ padding: '7px 6px', fontWeight: 600, whiteSpace: 'nowrap', textAlign: right ? 'right' : 'left' }}>{t}</th>

  return (
    <div>
      {/* completeness strip + toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <span lang="en" dir="ltr" style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--text-3)' }}>
          <b style={{ color: withHours === rows.length && rows.length > 0 ? 'var(--ok)' : 'var(--text)' }}>{num(withHours)}</b> of {num(rows.length)} spaces have hours
          {' · '}<b style={{ color: missingEflh > 0 ? '#B45309' : 'var(--ok)' }}>{num(missingEflh)}</b> missing EFLH
        </span>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <select style={{ ...ctrl, fontFamily: 'var(--font)' }} value={building} onChange={(e) => setBuilding(e.target.value)}>
            <option value="all">All buildings</option>
            {bOpts.map(([id, code]) => <option key={id} value={id}>{code}</option>)}
          </select>
          <select style={{ ...ctrl, fontFamily: 'var(--font)' }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All spaces</option>
            <option value="nohours">Missing hours</option>
            <option value="noeflh">Missing EFLH</option>
          </select>
          {canWrite && <Btn disabled={syncing} onClick={() => sync(true)}>{syncing ? 'Syncing…' : 'Sync from survey'}</Btn>}
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>
        Spaces are derived from survey room types — never typed here. Fill start/end (24h), days/week, weeks/year; hours/year and the TARSHID reference are computed. EFLH comes from TARSHID's regional calculator.
      </div>

      {loading && rows.length === 0 ? <Loading /> : rows.length === 0 ? (
        <Empty icon="daily">No spaces yet — survey entries with a room type create rows here{canWrite ? ' (auto-synced on open)' : ''}.</Empty>
      ) : filtered.length === 0 ? <Empty icon="daily">No spaces match this filter.</Empty> : groups.map((g) => (
        <div key={g.id} style={{ border: '1px solid var(--line)', borderRadius: 10, marginBottom: 12, overflow: 'hidden', opacity: g.residential ? 0.6 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{g.code}</span>
            <span style={{ fontWeight: 600, fontSize: 12.5 }}>{g.name}</span>
            {g.residential && <span title="Residential — excluded from TARSHID savings scope; hours stay editable" style={{ fontFamily: 'var(--mono)', fontSize: 8.5, fontWeight: 700, padding: '1px 6px', borderRadius: 5, color: '#A39D8E', background: '#F0EDE4' }}>RESIDENTIAL · EXCLUDED</span>}
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>{num(g.rows.filter(complete).length)}/{num(g.rows.length)} filled</span>
            {canWrite && g.rows.length > 1 && (
              <button className="ies-hover" title="Copy the first complete row's start/end/days/weeks to every other space in this building"
                onClick={() => copyDown(g)} style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', padding: '4px 9px', borderRadius: 6, border: '1px solid var(--line)', background: '#fff' }}>
                Apply same hours to all
              </button>
            )}
          </div>
          <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 760 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
              {th('SPACE TYPE')}{th('START')}{th('END')}{th('D/W', 1)}{th('W/Y', 1)}{th('HRS/YR', 1)}{th('TARSHID REF')}{th('EFLH', 1)}{th('NOTE')}
            </tr></thead>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '6px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {r.space_type}
                    {!r.has_entries && <span title="No survey entries carry this space type any more — the row is kept, nothing is deleted" style={{ marginLeft: 6, fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 5, color: '#A39D8E', background: '#F0EDE4' }}>NO ENTRIES</span>}
                  </td>
                  <td style={{ padding: '4px 6px' }}><TimeInput value={r.start_time} disabled={!canWrite} onSave={(v) => save(r, { start_time: v })} /></td>
                  <td style={{ padding: '4px 6px' }}><TimeInput value={r.end_time} disabled={!canWrite} onSave={(v) => save(r, { end_time: v })} /></td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}><IntInput value={r.days_per_week} min={1} max={7} label="Days/week" disabled={!canWrite} onSave={(v) => save(r, { days_per_week: v })} /></td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}><IntInput value={r.weeks_per_year} min={1} max={52} width={52} label="Weeks/year" disabled={!canWrite} onSave={(v) => save(r, { weeks_per_year: v })} /></td>
                  <td lang="en" dir="ltr" style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: r.hours_per_year != null ? 'var(--text)' : 'var(--text-3)' }}>{r.hours_per_year != null ? num(r.hours_per_year) : '—'}</td>
                  <td lang="en" dir="ltr" style={{ padding: '6px', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{r.ref_string || '—'}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}><EflhInput value={r.eflh} disabled={!canWrite} onSave={(v) => save(r, { eflh: v })} /></td>
                  <td style={{ padding: '4px 6px' }}>
                    <NoteInput value={r.note} disabled={!canWrite} onSave={(v) => save(r, { note: v })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      ))}
    </div>
  )
}

function NoteInput({ value, onSave, disabled }) {
  const [v, setV] = useState(value || '')
  useEffect(() => { setV(value || '') }, [value])
  return <input lang="en" value={v} disabled={disabled} placeholder="—"
    onChange={(e) => setV(e.target.value)}
    onBlur={() => { const t = v.trim() || null; if (t !== (value || null)) onSave(t) }}
    style={{ ...ctrl, fontFamily: 'var(--font)', width: '100%', minWidth: 110 }} />
}
