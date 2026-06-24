import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import Icon from '../components/Icon'
import { Loading, Empty, Chip } from '../components/ui'
import { Can } from '../rbac'
import { useAuth } from '../rbac'
import { useLiveQuery, bgInsert, uploadToBucket } from '../lib/db'
import { supabase } from '../lib/supabase'
import { CAN_INSTALL } from '../lib/constants'
import { fmtShort } from '../lib/format'
import { compressImage } from '../lib/image'
import { useBreadcrumb } from '../breadcrumbs'

const DRAFT_KEY = 'ies.draft.daily'
const today = () => new Date().toISOString().slice(0, 10)

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayKey = (d) => new Date(d).toISOString().slice(0, 10)

export default function DailyProgress() {
  const { user, profile } = useAuth()
  const { id: routeProject, bid: routeBid } = useParams()
  const { setLabel } = useBreadcrumb()
  const { rows: buildings } = useLiveQuery('buildings', (q) => q.select('id,code,name,project_id').order('code'))

  const [tab, setTab] = useState('quick')         // 'quick' | 'batch' | 'import'
  const [bid, setBid] = useState('')
  const [scopeId, setScopeId] = useState('')
  const [esmCode, setEsmCode] = useState('')      // selected ESM chip filter
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [scopes, setScopes] = useState([])
  const [photoPath, setPhotoPath] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef(null)

  // today's entries by this user (for tally + today list)
  const { rows: todays, loading } = useLiveQuery('install_log',
    (q) => q.select('id,qty,note,qa_status,created_at,scope:building_item_scope(sub_type),building:buildings(code)')
      .eq('installed_by_id', user.id).eq('entry_date', today()).order('created_at', { ascending: false }))

  // 7-day rolling installs by ESM (all visible rows, RLS filtered)
  const { rows: recent } = useLiveQuery('install_log',
    (q) => q.select('qty,entry_date,scope:building_item_scope(project_esm:project_esms(esm:esms(code)))')
      .gte('entry_date', dayKey(Date.now() - 6 * 86400000)).order('entry_date'))

  // restore draft once
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
      if (d) { setBid(d.bid || ''); setScopeId(d.scopeId || ''); setQty(d.qty || ''); setNote(d.note || '') }
    } catch { /* ignore */ }
  }, [])

  // when reached via the nested building route, pre-select that building + label crumb
  useEffect(() => { if (routeBid) setBid(routeBid) }, [routeBid])
  useEffect(() => {
    if (!routeBid || !buildings.length) return
    const b = buildings.find((x) => x.id === routeBid)
    if (b) setLabel('building:' + routeBid, b.code)
  }, [routeBid, buildings, setLabel])

  // load scopes for the selected building (planned counts live here)
  useEffect(() => {
    if (!bid) { setScopes([]); return }
    supabase.from('building_item_scope')
      .select('id,sub_type,material_code,planned_qty,project_esm:project_esms(esm:esms(code,name))')
      .eq('building_id', bid).order('sub_type')
      .then(({ data }) => setScopes(data || []))
  }, [bid])

  // autosave draft every 2s while typing; subtle "draft saved" indicator
  useEffect(() => {
    setSaved(false)
    const t = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ bid, scopeId, qty, note }))
      setSaved(true)
    }, 2000)
    return () => clearTimeout(t)
  }, [bid, scopeId, qty, note])

  const [photoMeta, setPhotoMeta] = useState(null)
  const onPhoto = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true)
    const small = await compressImage(f, { maxBytes: 200000 })
    const { path } = await uploadToBucket('building-photos', small, { userId: user.id, prefix: bid || 'unscoped' })
    setUploading(false)
    if (path) { setPhotoPath(path); setPhotoMeta({ size: small.size, mime: small.type }) }
    if (fileRef.current) fileRef.current.value = ''
  }

  const submit = async () => {
    if (!bid || !scopeId || !qty || Number(qty) < 1) return
    setSubmitting(true)
    const sc = scopes.find((s) => s.id === scopeId)
    const { error } = await bgInsert('install_log', {
      entry_date: today(), building_id: bid, scope_id: scopeId, qty: Number(qty),
      source: 'quick_entry', installed_by_id: user.id, note: note || null,
      photos: photoPath ? [photoPath] : [],
    }, { okMsg: 'Logged ✓' })
    // Daily-report photo → building_photos, tagged source=daily_report + ESM + date (B.4)
    if (!error && photoPath) {
      await bgInsert('building_photos', {
        building_id: bid, storage_path: photoPath, source: 'daily_report',
        esm: sc?.project_esm?.esm?.code || null, taken_at: today() + 'T12:00:00',
        file_size_bytes: photoMeta?.size || null, mime_type: photoMeta?.mime || null, uploaded_by: user.id,
      })
    }
    setSubmitting(false)
    if (!error) {
      setScopeId(''); setEsmCode(''); setQty(''); setNote(''); setPhotoPath(null); setPhotoMeta(null)
      localStorage.removeItem(DRAFT_KEY); setSaved(false)
    }
  }

  // ESM chips derived from the chosen building's scope
  const esmChips = useMemo(() => {
    const seen = new Map()
    for (const s of scopes) {
      const code = s.project_esm?.esm?.code
      if (code && !seen.has(code)) seen.set(code, s.project_esm.esm)
    }
    return [...seen.values()]
  }, [scopes])

  // sub-types filtered by the chosen ESM chip (else all), each shows planned count
  const subScopes = useMemo(
    () => scopes.filter((s) => !esmCode || s.project_esm?.esm?.code === esmCode),
    [scopes, esmCode])

  // today's tally by ESM (from today's rows; sub-type → ESM via scope label is
  // unavailable here, so group by sub_type as the label, total is exact)
  const tally = useMemo(() => {
    const total = todays.reduce((a, t) => a + (t.qty || 0), 0)
    const byLabel = new Map()
    for (const t of todays) {
      const k = t.scope?.sub_type || '—'
      byLabel.set(k, (byLabel.get(k) || 0) + (t.qty || 0))
    }
    return { total, parts: [...byLabel.entries()].map(([label, qty]) => ({ label, qty })) }
  }, [todays])

  // 7-day chart: per day, qty split by ESM bucket
  const chartBars = useMemo(() => {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(Date.now() - i * 86400000)
      days.push({ key: dayKey(dt), dlabel: MON[dt.getMonth()] + ' ' + dt.getDate() })
    }
    const buckets = new Map(days.map((d) => [d.key, { ESM1: 0, ESM2: 0, ESM3: 0 }]))
    for (const r of recent) {
      const b = buckets.get(r.entry_date)
      if (!b) continue
      const code = r.scope?.project_esm?.esm?.code
      if (code && b[code] != null) b[code] += r.qty || 0
    }
    const max = Math.max(1, ...[...buckets.values()].map((b) => b.ESM1 + b.ESM2 + b.ESM3))
    return days.map((d) => {
      const b = buckets.get(d.key)
      const tot = b.ESM1 + b.ESM2 + b.ESM3
      const scale = 70 / max
      return {
        dlabel: d.dlabel, total: tot, offBg: tot ? '#F1F5F9' : '#FAFBFC',
        h1: Math.round(b.ESM1 * scale), h2: Math.round(b.ESM2 * scale), h3: Math.round(b.ESM3 * scale),
      }
    })
  }, [recent])

  const sel = scopes.find((s) => s.id === scopeId)

  return (
    <div data-screen-label="Project Daily Progress">
      {routeBid && (
        <Link to={`/projects/${routeProject}/buildings/${routeBid}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-3)', fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>
          <Icon name="chevronl" size={14} />Back to building
        </Link>
      )}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '2px', color: 'var(--text-3)' }}>FIELD EXECUTION · {profile?.full_name || 'Field'}</div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: '4px 0 0' }}>Daily Progress</h1>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>Install log across every building in this project — quick entry. Everything downstream reads from this one log.</div>
          </div>
          {saved && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ok)', whiteSpace: 'nowrap' }}>
              <Icon name="check" size={12} /> draft saved
            </span>
          )}
        </div>
      </div>

      {/* KPI row: today's tally · 7-day rolling · productivity */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)' }}>TODAY'S TALLY · {fmtShort(today())}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 30, fontWeight: 700, marginTop: 6 }}>{tally.total}<span style={{ fontSize: 13, color: 'var(--text-3)' }}> units</span></div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 11, fontFamily: 'var(--mono)', flexWrap: 'wrap' }}>
            {tally.parts.length === 0 && <span style={{ color: 'var(--text-3)' }}>no installs yet</span>}
            {tally.parts.map((t) => (
              <span key={t.label} style={{ color: 'var(--text-3)' }}>{t.label} <span style={{ color: 'var(--text)', fontWeight: 700 }}>{t.qty}</span></span>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 8 }}>{todays.length} entries today</div>
        </div>

        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)' }}>7-DAY ROLLING</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 78, marginTop: 12 }}>
            {chartBars.map((d, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: 70, background: d.offBg, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: d.h3, background: '#10B981' }} />
                  <div style={{ height: d.h2, background: '#F59E0B' }} />
                  <div style={{ height: d.h1, background: '#2563EB' }} />
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-3)' }}>{d.dlabel}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>
            <span><span style={{ color: '#2563EB' }}>■</span> Lighting</span>
            <span><span style={{ color: '#F59E0B' }}>■</span> Control</span>
            <span><span style={{ color: '#10B981' }}>■</span> AC</span>
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)' }}>PRODUCTIVITY</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
            <svg viewBox="0 0 64 64" style={{ width: 68, height: 68, flex: 'none' }}>
              <circle cx="32" cy="32" r="26" fill="none" stroke="#EFF2F6" strokeWidth="8" />
              <circle cx="32" cy="32" r="26" fill="none" stroke="#2563EB" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${Math.min(1, tally.total / 40) * 163.4} 163.4`} transform="rotate(-90 32 32)" />
            </svg>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 700, lineHeight: 1 }}>{tally.total}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 3 }}>units today</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)' }}>baseline 40</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab toggle: Quick entry / Batch grid */}
      <div style={{ display: 'flex', gap: 4, border: '1px solid var(--line)', borderRadius: 10, padding: 3, background: '#fff', width: 'max-content', marginBottom: 14 }}>
        {[['quick', 'Quick entry'], ['batch', 'Batch grid']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 7, cursor: 'pointer',
            color: tab === k ? '#fff' : 'var(--text-3)', background: tab === k ? 'var(--accent)' : 'transparent',
          }}><span>{l}</span></button>
        ))}
      </div>

      {tab === 'quick' && (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 18, maxWidth: 560 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Quick entry</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 16 }}>One install → one log row. Decrements stock, writes the activity log, and bumps every percentage.</div>

          <Can allow={CAN_INSTALL} fallback={
            <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Your role can view the log but not record installs.</div>
          }>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Date */}
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>Date</span>
                <input lang="en" value={today()} readOnly style={{ width: '100%', padding: '11px 12px', border: '1px solid var(--line)', borderRadius: 9, fontSize: 14, fontFamily: 'var(--mono)', background: '#FAFBFC' }} />
              </label>

              {/* Building */}
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>Building</span>
                <select value={bid} onChange={(e) => { setBid(e.target.value); setScopeId(''); setEsmCode('') }}
                  style={{ width: '100%', padding: '11px 12px', border: '1px solid var(--line)', borderRadius: 9, fontSize: 14, background: '#fff' }}>
                  <option value="">Select building…</option>
                  {buildings.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
                </select>
              </label>

              {/* ESM chips */}
              <div>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>ESM</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {esmChips.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{bid ? 'No scope on this building.' : 'Pick a building first.'}</span>}
                  {esmChips.map((e) => {
                    const on = esmCode === e.code
                    return (
                      <button key={e.code} onClick={() => { setEsmCode(on ? '' : e.code); setScopeId('') }}
                        className="ies-hover" style={{
                          flex: 1, minWidth: 120, padding: 12, borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                          border: `2px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? '#EFF6FF' : '#fff',
                        }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>{e.code}</div>
                        <div style={{ fontWeight: 600, fontSize: 12.5, marginTop: 2 }}>{e.name}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Sub-type (planned counts shown here) */}
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>Sub-type</span>
                <select value={scopeId} onChange={(e) => setScopeId(e.target.value)} disabled={!bid}
                  style={{ width: '100%', padding: '11px 12px', border: '1px solid var(--line)', borderRadius: 9, fontSize: 14, background: '#fff' }}>
                  <option value="">{bid ? 'Select sub-type…' : 'Pick a building first'}</option>
                  {subScopes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.project_esm?.esm?.code} · {s.sub_type} ({s.planned_qty} planned)
                    </option>
                  ))}
                </select>
              </label>

              {/* Qty installed */}
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>Qty installed</span>
                <input lang="en" value={qty} onChange={(e) => setQty(e.target.value)} type="text" inputMode="numeric" min="1"
                  placeholder={sel ? `e.g. 12 (of ${sel.planned_qty})` : 'e.g. 12'}
                  style={{ width: '100%', padding: '11px 12px', border: '1px solid var(--line)', borderRadius: 9, fontSize: 14 }} />
              </label>

              {/* Room / note */}
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>Room / location note</span>
                <input lang="en" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Floor 2 east"
                  style={{ width: '100%', padding: '11px 12px', border: '1px solid var(--line)', borderRadius: 9, fontSize: 14 }} />
              </label>

              {/* Photos */}
              <input lang="en" ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 11, borderRadius: 9, border: '1px dashed #CBD5E1', color: photoPath ? 'var(--ok)' : 'var(--text-3)', fontSize: 12.5, background: '#fff', cursor: 'pointer' }}>
                <Icon name="camera" size={15} />
                {uploading ? 'Uploading…' : photoPath ? '1 photo attached' : 'Add photos (auto-compressed · 500 KB)'}
              </button>

              {/* Submit */}
              <button onClick={submit} disabled={submitting || !bid || !scopeId || !qty}
                style={{ padding: 13, borderRadius: 10, background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: (submitting || !bid || !scopeId || !qty) ? 0.6 : 1 }}>
                {submitting ? 'Saving…' : 'Log install'}
              </button>
            </div>
          </Can>
        </div>
      )}

      {tab === 'batch' && (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16, maxWidth: 560 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Batch grid · end of day</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
            Use Quick entry to log individual installs. End-of-day batch grid is recorded one row per install via the same log.
          </div>
        </div>
      )}

      {/* Today's entries + per-ESM tally feed */}
      <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Today's entries</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>{todays.length} logged · {tally.total} units</div>
      </div>
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? <Loading /> : todays.length === 0 ? <Empty icon="daily">No install entries today yet.</Empty> : (
          <div className="ies-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 560 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)', background: '#FCFCFD' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>TIME</th>
                  <th style={{ padding: '10px 8px', fontWeight: 600 }}>BUILDING</th>
                  <th style={{ padding: '10px 8px', fontWeight: 600 }}>SUB-TYPE</th>
                  <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'right' }}>QTY</th>
                  <th style={{ padding: '10px 8px', fontWeight: 600 }}>LOCATION</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {todays.map((t) => (
                  <tr key={t.id} className="ies-row-hover" style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtShort(t.created_at)}</td>
                    <td style={{ padding: '10px 8px' }}><div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>{t.building?.code || '—'}</div></td>
                    <td style={{ padding: '10px 8px' }}>{t.scope?.sub_type || '—'}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ok)' }}>{t.qty}</td>
                    <td style={{ padding: '10px 8px', color: 'var(--text-3)' }}>{t.note || '—'}</td>
                    <td style={{ padding: '10px 14px' }}><Chip status={t.qa_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
