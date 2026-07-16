import { useState } from 'react'
import FileDropZone from './FileDropZone'
import { useLiveQuery, uploadToBucket, signedUrlFor } from '../lib/db'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { compressImage } from '../lib/image'
import { Empty, Btn, inputStyle } from './ui'
import DateInput from './DateInput'
import { fmtDate } from '../lib/format'

// Small uppercase field caption to match the Claude Design mockup.
const Lbl = ({ children }) => <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.5px', color: 'var(--text-3)', marginBottom: 5 }}>{children}</span>

// Sprint 8I/8J — per-building Daily Progress logger. A "Log today's work" pad (one
// MANPOWER + DATE for the batch, then one line per material installed) saved
// all-or-nothing through the log_daily_progress RPC, which consumes from the
// project warehouse and hard-blocks any line that would over-draw stock. Below,
// a collapsible Daily Log history of past batches.
const ESM_ORDER = (c) => ({ ESM1: 1, ESM2: 2, ESM3: 3 }[c] || 9)
// Colored ESM pills (8J-2): ESM1 indigo, ESM2 violet, ESM3 teal.
const ESM_PILL = { ESM1: { c: '#3E5C8A', bg: '#EBF0F7' }, ESM2: { c: '#6D5A8E', bg: '#F0EDF6' }, ESM3: { c: '#2A7A72', bg: '#E8F3F1' } }
const esmPill = (code) => ESM_PILL[code] || { c: '#8A8577', bg: '#F0EDE4' }
const num = (v) => (v == null ? 0 : Number(v))
const today = () => new Date().toISOString().slice(0, 10)
const ACCEPT = '.jpg,.jpeg,.png,.heic,.heif,image/*'

function EsmBadge({ code, style }) {
  const p = esmPill(code)
  return <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, color: p.c, background: p.bg, borderRadius: 6, padding: '3px 8px', ...style }}>{code || 'ESM'}</span>
}

export default function DailyProgress({ buildingId, projectId, buildingCode, canWrite, user }) {
  const { rows: materials } = useLiveQuery('materials', (q) =>
    q.select('id,code,name,unit,brand,esm_id,esm:esms(code,name),category:material_categories(id,code,name_en,is_active,esm_id)').order('name'))
  const { rows: rooms } = useLiveQuery('rooms', (q) => q.select('id,name,floor').eq('building_id', buildingId).order('name'), [buildingId])
  const { rows: scopes } = useLiveQuery('building_item_scope', (q) => q.select('material_code,planned_qty').eq('building_id', buildingId), [buildingId])
  const { rows: ledger } = useLiveQuery('stock_ledger', (q) =>
    q.select('variant_id,delta,reason').eq('building_id', buildingId).eq('reason', 'consumption_out'), [buildingId])
  const { rows: stock } = useLiveQuery('project_warehouse_stock', (q) => q.select('variant_id,qty_on_hand').eq('project_id', projectId), [projectId])
  const { rows: batches, refetch } = useLiveQuery('daily_progress_batch', (q) =>
    q.select('*,creator:profiles!daily_progress_batch_created_by_fkey(full_name),lines:daily_progress_line(id,qty,photos,esm_id,material:materials(name,code,unit,esm:esms(code)),room:rooms(name))')
      .eq('building_id', buildingId).order('date', { ascending: false }), [buildingId])

  const matById = Object.fromEntries(materials.map((m) => [m.id, m]))
  // active-category variants grouped ESM → category, for the dropdown
  const optGroups = []
  const activeMats = materials.filter((m) => m.category && m.category.is_active !== false)
  const groupKey = {}
  activeMats.forEach((m) => {
    const k = (m.esm?.code || 'ZZ') + '|' + (m.category?.code || '')
    if (!groupKey[k]) { groupKey[k] = { esm: m.esm?.code, cat: m.category?.name_en, items: [] }; optGroups.push(groupKey[k]) }
    groupKey[k].items.push(m)
  })
  optGroups.sort((a, b) => ESM_ORDER(a.esm) - ESM_ORDER(b.esm) || (a.cat || '').localeCompare(b.cat || ''))

  // planned per variant code (this building) + installed per variant (consumption) + available (project warehouse)
  const plannedByCode = {}; scopes.forEach((s) => { plannedByCode[s.material_code] = (plannedByCode[s.material_code] || 0) + num(s.planned_qty) })
  const installedByVar = {}; ledger.forEach((r) => { installedByVar[r.variant_id] = (installedByVar[r.variant_id] || 0) + (-num(r.delta)) })
  const availByVar = {}; stock.forEach((r) => { availByVar[r.variant_id] = (availByVar[r.variant_id] || 0) + num(r.qty_on_hand) })

  const [manpower, setManpower] = useState('')
  const [date, setDate] = useState(today())
  const [lines, setLines] = useState([])
  const [busy, setBusy] = useState(false)

  const addLine = () => setLines((ls) => [...ls, { key: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())), materialId: '', qty: '', roomId: '', files: [] }])
  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const rmLine = (key) => setLines((ls) => ls.filter((l) => l.key !== key))

  const validLines = lines.filter((l) => l.materialId && num(l.qty) > 0)
  const totalUnits = validLines.reduce((a, l) => a + num(l.qty), 0)
  const canSave = canWrite && validLines.length > 0 && !busy

  const save = async () => {
    if (!canSave) return
    setBusy(true)
    try {
      const payload = []
      for (const l of validLines) {
        const paths = []
        for (const f of l.files) {
          const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
          const isImg = /^(jpg|jpeg|png)$/.test(ext)
          const blob = isImg ? await compressImage(f, { maxBytes: 400000 }).catch(() => f) : f
          const uuid = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())
          const { path } = await uploadToBucket('daily-progress-photos', blob, { userId: user.id, key: `${buildingId}/${date}/${uuid}.${ext}` })
          if (path) paths.push(path)
        }
        const m = matById[l.materialId]
        payload.push({ material_id: l.materialId, esm_id: m?.esm_id || null, room_id: l.roomId || null, qty: num(l.qty), photos: paths })
      }
      const { data, error } = await supabase.rpc('log_daily_progress', {
        p_building_id: buildingId, p_date: date, p_manpower: manpower ? parseInt(manpower, 10) : null, p_lines: payload,
      })
      if (error) { toast(`Couldn't save — ${error.message}`, 'err'); setBusy(false); return }
      if (!data?.ok) {
        if (data?.error === 'insufficient_stock') {
          const m = matById[data.material_id]
          toast(`${m?.name || 'Material'} — only ${data.available} in stock, need ${data.requested}`, 'err')
        } else { toast(`Couldn't save — ${data?.error || 'unknown error'}`, 'err') }
        setBusy(false); return
      }
      toast(`✓ Logged ${data.lines} line${data.lines === 1 ? '' : 's'} · ${data.units} units consumed from warehouse`)
      setLines([]); setManpower('')
      refetch && refetch()
    } catch (e) {
      toast(`Couldn't save — ${e.message || e}`, 'err')
    }
    setBusy(false)
  }

  const mono = { fontFamily: 'var(--mono)' }
  return (
    <>
      {/* ── LOG TODAY'S WORK PAD ─────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 20, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Log today’s work · {buildingCode}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>One manpower count + date for the day; add a line per material installed. Saving consumes from the project warehouse.</div>
          </div>
          <div style={{ width: 110 }}>
            <Lbl>Manpower</Lbl>
            <input lang="en" style={inputStyle} type="text" inputMode="numeric" min="0" value={manpower} onChange={(e) => setManpower(e.target.value)} placeholder="e.g. 6" disabled={!canWrite} />
          </div>
          <div style={{ width: 150 }}>
            <Lbl>Date</Lbl>
            <DateInput style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} disabled={!canWrite} />
          </div>
          <Btn variant="primary" icon="check" onClick={save} disabled={!canSave}>{busy ? 'Saving…' : 'Save day’s log'}</Btn>
        </div>

        {!canWrite ? <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Read-only — your role can view the log but not record work.</div> : (<>
          <Btn icon="plus" style={{ padding: '7px 11px', fontSize: 12, marginBottom: lines.length ? 12 : 0 }} onClick={addLine}>Add sub-type</Btn>
          {lines.length === 0 && (
            <div style={{ marginTop: 10, padding: '14px 16px', border: '1px dashed var(--line)', borderRadius: 10, background: '#FCFBF7', fontSize: 12.5, color: 'var(--text-3)' }}>
              ↑ {batches.length === 0 ? 'No work logged yet' : 'Nothing added for today yet'} — start by adding a sub-type above.
            </div>
          )}

          {lines.map((l) => {
            const m = matById[l.materialId]
            const planned = m ? (plannedByCode[m.code] || 0) : 0
            const installed = m ? (installedByVar[m.id] || 0) : 0
            const rem = Math.max(0, planned - installed)
            const pct = planned ? Math.round((installed / planned) * 100) : 0
            const avail = m ? (availByVar[m.id] || 0) : 0
            const over = m && num(l.qty) > avail
            return (
              <div key={l.key} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14, marginBottom: 10, background: '#FCFBF7' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <EsmBadge code={m?.esm?.code} style={{ marginTop: 22 }} />
                  <div style={{ flex: 2, minWidth: 200 }}>
                    <Lbl>Material</Lbl>
                    <select style={inputStyle} value={l.materialId} onChange={(e) => setLine(l.key, { materialId: e.target.value })}>
                      <option value="">Select material…</option>
                      {optGroups.map((g) => (
                        <optgroup key={(g.esm || '') + g.cat} label={`${g.esm || '—'} · ${g.cat || ''}`}>
                          {g.items.map((it) => <option key={it.id} value={it.id}>{it.name}{it.brand ? ` · ${it.brand}` : ''}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    {m && <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 3 }}>{[m.brand, m.unit].filter(Boolean).join(' · ') || m.code}</div>}
                  </div>
                  <div style={{ width: 90 }}>
                    <Lbl>Qty today</Lbl>
                    <input lang="en" style={{ ...inputStyle, borderColor: over ? 'var(--bad)' : undefined }} type="text" inputMode="numeric" min="1" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} placeholder="0" />
                  </div>
                  <div style={{ flex: 1, minWidth: 130 }}>
                    <Lbl>Location</Lbl>
                    <select style={inputStyle} value={l.roomId} onChange={(e) => setLine(l.key, { roomId: e.target.value })}>
                      <option value="">{rooms.length ? '—' : 'No rooms defined'}</option>
                      {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}{r.floor ? ` (${r.floor})` : ''}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: 170 }}>
                    <Lbl>Photos</Lbl>
                    <FileDropZone compact multi accept={ACCEPT} maxSizeMb={10} onFiles={(files) => setLine(l.key, { files })} helperText="JPG, PNG or HEIC" />
                  </div>
                  <button title="Remove line" onClick={() => rmLine(l.key)} style={{ marginTop: 22, width: 28, height: 28, borderRadius: 7, border: '1px solid var(--line)', background: '#fff', color: 'var(--bad)', fontWeight: 700, cursor: 'pointer' }}>×</button>
                </div>
                {/* read-only progress strip with bar */}
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', gap: 16, ...mono, fontSize: 11, color: 'var(--text-3)', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>Planned <b style={{ color: 'var(--text)' }}>{planned}</b></span>
                    <span>Installed <b style={{ color: 'var(--ok)' }}>{installed}</b></span>
                    <span>Rem <b style={{ color: 'var(--text)' }}>{rem}</b></span>
                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>{pct}%</span>
                    <span style={{ marginLeft: 'auto', color: over ? 'var(--bad)' : 'var(--text-3)' }}>Warehouse: {avail}{over ? ` · need ${num(l.qty)}` : ''}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 4, background: '#EDEAE0', overflow: 'hidden', marginTop: 6 }}>
                    <div style={{ height: '100%', width: Math.min(100, pct) + '%', background: pct >= 90 ? '#217A54' : 'var(--accent)' }} />
                  </div>
                </div>
              </div>
            )
          })}

          {/* footer total */}
          <div style={{ borderTop: '1px solid var(--line)', marginTop: lines.length ? 4 : 12, paddingTop: 10, ...mono, fontSize: 12, color: 'var(--text-3)' }}>
            Ready to save: <b style={{ color: 'var(--text)' }}>{totalUnits}</b> unit{totalUnits === 1 ? '' : 's'} across <b style={{ color: 'var(--text)' }}>{validLines.length}</b> line{validLines.length === 1 ? '' : 's'}
          </div>
        </>)}
      </div>

      {/* ── DAILY LOG HISTORY ─────────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Daily Log <span style={{ ...mono, fontSize: 10, color: 'var(--text-3)', marginLeft: 6 }}>HISTORY</span></div>
        {batches.length === 0 ? <Empty icon="daily">No work logged in this building yet.</Empty> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {batches.map((b) => <HistoryRow key={b.id} batch={b} /> )}
          </div>
        )}
      </div>
    </>
  )
}

function HistoryRow({ batch }) {
  const [open, setOpen] = useState(false)
  const lines = batch.lines || []
  const units = lines.reduce((a, l) => a + Number(l.qty || 0), 0)
  const workers = batch.manpower || 0
  const perWorker = workers ? Math.round(units / workers) : '—'
  const esms = [...new Set(lines.map((l) => l.material?.esm?.code).filter(Boolean))].sort()
  const mono = { fontFamily: 'var(--mono)' }

  const viewPhoto = async (p) => { const url = await signedUrlFor('daily-progress-photos', p); if (url) window.open(url, '_blank', 'noopener') }

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
      <button onClick={() => setOpen((o) => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: open ? '#FAF8F2' : '#fff', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ ...mono, fontWeight: 700, fontSize: 12.5, minWidth: 110 }}>{fmtDate(batch.date)}</span>
        <span style={{ display: 'flex', gap: 4 }}>{esms.map((e) => <EsmBadge key={e} code={e} />)}</span>
        <span style={{ ...mono, fontSize: 11.5, color: 'var(--text-3)', marginLeft: 'auto' }}>{units} units · {lines.length} line{lines.length === 1 ? '' : 's'} · {workers} worker{workers === 1 ? '' : 's'} · {perWorker}/worker</span>
        <span style={{ color: 'var(--text-3)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--line)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ ...mono, fontSize: 10, color: 'var(--text-3)', textAlign: 'left' }}>
              <th style={{ padding: '7px 12px', fontWeight: 600 }}>MATERIAL</th><th style={{ padding: '7px 8px', fontWeight: 600, textAlign: 'right' }}>QTY</th>
              <th style={{ padding: '7px 8px', fontWeight: 600 }}>ROOM</th><th style={{ padding: '7px 8px', fontWeight: 600 }}>PHOTOS</th>
            </tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <EsmBadge code={l.material?.esm?.code} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{l.material?.name || '—'}</div>
                        {l.material?.unit && <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{l.material.unit}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '8px 8px', textAlign: 'right', ...mono, fontWeight: 700 }}>{l.qty}</td>
                  <td style={{ padding: '8px 8px', color: 'var(--text-3)' }}>{l.room?.name || '—'}</td>
                  <td style={{ padding: '8px 8px' }}>
                    {Array.isArray(l.photos) && l.photos.length
                      ? l.photos.map((p, i) => <button key={i} onClick={() => viewPhoto(p)} style={{ marginRight: 6, fontSize: 11.5, color: 'var(--accent)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>📎 {i + 1}</button>)
                      : <span style={{ color: 'var(--text-3)' }}>—</span>}
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
