import { useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useLiveQuery } from '../lib/db'
import { Empty } from './ui'
import { toast } from '../lib/toast'
import { num, toLatin } from '../lib/format'

// 9D-6 — the approved lamp is a project decision, exactly like the AC unit, so
// it left the field form with it. There is no approved registry of EXISTING
// fittings (old_model_registry is AC-shaped: TR, T1 BTU, equivalent SEER), so
// lighting is surveyed as wattage + nameplate photo and mapped here instead:
// one decision per distinct surveyed fitting, applied to every row that shares
// it, rather than the same choice retyped in every room.
const UNIT_WORDS = new Set(['w', 'watt', 'watts', 'lm', 'lumen', 'lumens', 'k'])
const ctrl = { padding: '7px 10px', border: '1px solid var(--line-ctrl)', borderRadius: 'var(--radius-s)', background: 'var(--surface-1)', fontSize: 12.5, width: '100%', boxSizing: 'border-box' }

const groupKey = (e) => [e.equipment_type, e.make, e.model, e.wattage].map((v) => String(v ?? '').trim().toLowerCase()).join('|')
const groupLabel = (e) => [e.equipment_type, e.make, e.model, e.wattage != null ? `${num(e.wattage)} W` : null].filter(Boolean).join(' · ') || 'Unidentified fitting'

export default function LightingReplacements({ project, entries, onChanged }) {
  const { rows: catalog } = useLiveQuery('lighting_catalog', (q) =>
    q.select('id,lamp_type,model,brand,shape_size_base,dimensions,wattage_w,lumens_lm,cct_k,unit_cost,labor_cost')
      .eq('is_active', true).order('sr_no', { nullsFirst: false }))
  const [busy, setBusy] = useState(null)

  const groups = useMemo(() => {
    const m = new Map()
    entries.filter((e) => e.category === 'lighting').forEach((e) => {
      const k = groupKey(e)
      if (!m.has(k)) m.set(k, { key: k, label: groupLabel(e), wattage: e.wattage, ids: [], units: 0, mapped: new Set() })
      const g = m.get(k)
      g.ids.push(e.id); g.units += e.qty || 1; g.mapped.add(e.catalog_item_id || null)
    })
    return [...m.values()].sort((a, b) => b.units - a.units)
  }, [entries])

  const catById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog])

  const apply = async (g, catalogItemId) => {
    setBusy(g.key)
    const { data, error } = await supabase.from('survey_entries')
      .update({ catalog_item_id: catalogItemId || null }).in('id', g.ids).select('id')
    setBusy(null)
    if (error) { toast("Couldn't map — " + error.message, 'err'); return }
    const n = data?.length || 0
    toast(n === g.ids.length
      ? `${num(n)} lighting row${n === 1 ? '' : 's'} mapped`
      : `${num(n)} of ${num(g.ids.length)} mapped — the rest are no longer yours to edit`, n === g.ids.length ? undefined : 'err')
    onChanged?.()
  }

  if (groups.length === 0) return null

  return (
    <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Lighting replacements</div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--radius-s)', color: 'var(--esm2)', background: 'var(--esm2-bg)' }}>PROJECT DECISION</span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>
        One approved lamp per distinct surveyed fitting, applied to every row that shares it. The field survey records what is installed; choosing the replacement is commercial and belongs here.
      </div>
      <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
        <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
          <th style={{ padding: '7px 6px', fontWeight: 600 }}>SURVEYED FITTING</th>
          <th style={{ padding: '7px 6px', fontWeight: 600, textAlign: 'right' }}>ROWS</th>
          <th style={{ padding: '7px 6px', fontWeight: 600, textAlign: 'right' }}>UNITS</th>
          <th style={{ padding: '7px 6px', fontWeight: 600 }}>APPROVED REPLACEMENT</th>
        </tr></thead>
        <tbody>
          {groups.map((g) => {
            const ids = [...g.mapped]
            const single = ids.length === 1 ? ids[0] : null
            const mixed = ids.length > 1
            return (
              <tr key={g.key} style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ padding: '6px', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.label}>{g.label}</td>
                <td lang="en" dir="ltr" style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{num(g.ids.length)}</td>
                <td lang="en" dir="ltr" style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{num(g.units)}</td>
                <td style={{ padding: '6px', minWidth: 260 }}>
                  <LampPicker catalog={catalog} refWatt={g.wattage} busy={busy === g.key}
                    chosen={single ? catById.get(single) || null : null} mixed={mixed}
                    onPick={(id) => apply(g, id)} onClear={() => apply(g, null)} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table></div>
      {catalog.length === 0 && <div style={{ marginTop: 10 }}><Empty icon="box">The approved lighting catalog is empty — import it in Settings → Approved Equipment.</Empty></div>}
    </div>
  )
}

// Wattage-aware search, kept from the form it replaced: '18', '18w', 'LED',
// 'Philips' all work, numbers matching wattage or lumens within ±10%.
function LampPicker({ catalog, refWatt, chosen, mixed, onPick, onClear, busy }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)

  const labelOf = (r) => [r.lamp_type, r.wattage_w != null ? `${num(r.wattage_w)} W` : null, r.brand, r.model].filter(Boolean).join(' · ')
  const titleOf = (r) => [r.shape_size_base, r.dimensions, r.cct_k].filter(Boolean).join(' — ')

  const matches = useMemo(() => {
    const norm = (s) => toLatin(String(s ?? '')).toLowerCase()
    const hayOf = (r) => norm([r.lamp_type, r.model, r.brand, r.shape_size_base].filter(Boolean).join(' '))
    const numsOf = (r) => [r.wattage_w, r.lumens_lm].filter((v) => v != null).map(Number)
    const tokens = norm(q).split(/\s+/).filter(Boolean).filter((t) => !UNIT_WORDS.has(t))
      .map((t) => { const m = /^(\d+(?:\.\d+)?)(w|watts?|lm)$/.exec(t); return m ? m[1] : t })
    const hit = (r, t) => {
      if (hayOf(r).includes(t)) return true
      const n = /^\d+(?:\.\d+)?$/.test(t) ? parseFloat(t) : NaN
      if (Number.isNaN(n)) return false
      return numsOf(r).some((v) => v >= n * 0.9 && v <= n * 1.1)
    }
    let list = tokens.length ? catalog.filter((r) => tokens.every((t) => hit(r, t))) : [...catalog]
    const ref = refWatt == null ? NaN : parseFloat(toLatin(String(refWatt)))
    if (!Number.isNaN(ref)) {
      // a retrofit lamp is normally a LOWER wattage, so rank by closeness but
      // never hide the higher ones — the ESCO decides, we only order the list
      list.sort((a, b) => {
        const da = a.wattage_w == null ? Infinity : Math.abs(Number(a.wattage_w) - ref)
        const db = b.wattage_w == null ? Infinity : Math.abs(Number(b.wattage_w) - ref)
        return da - db
      })
    }
    return list.slice(0, 10)
  }, [catalog, q, refWatt])

  if (chosen) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--line)', borderRadius: 'var(--radius-s)', padding: '5px 9px', background: 'var(--ok-bg)' }} title={titleOf(chosen)}>
        <span lang="en" dir="ltr" style={{ fontSize: 12, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelOf(chosen)}</span>
        <button type="button" disabled={busy} onClick={onClear} style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: 'var(--bad)', background: 'none', flex: 'none' }}>{busy ? '…' : 'Change'}</button>
      </div>
    )
  }
  return (
    <div style={{ position: 'relative' }}>
      <input lang="en" style={ctrl} value={q} disabled={busy}
        placeholder={mixed ? 'Mixed — pick one to apply to all rows' : 'Search type, brand or wattage — e.g. LED, Philips, 18…'}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && (matches.length > 0 || q.trim() !== '') && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 4, background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-2)', overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
          {matches.length > 0 ? matches.map((r) => (
            <button key={r.id} type="button" title={titleOf(r)} onMouseDown={(e) => { e.preventDefault(); onPick(r.id); setOpen(false); setQ('') }}
              className="ies-row-hover" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', fontSize: 12, background: 'none', cursor: 'pointer' }}>
              <span lang="en" dir="ltr">{labelOf(r)}</span>
            </button>
          )) : <div style={{ padding: '9px 12px', fontSize: 12, color: 'var(--text-3)' }}>No match — try type, brand, or wattage (e.g. LED, Philips, 18).</div>}
        </div>
      )}
    </div>
  )
}
