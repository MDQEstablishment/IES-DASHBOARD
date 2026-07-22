import { useState, useMemo } from 'react'
import { Empty } from '../ui'
import Icon from '../Icon'
import DateInput from '../DateInput'
import { num, fmtDate } from '../../lib/format'
import { SURVEY_CATEGORIES } from '../../lib/constants'

const CAT_LABEL = Object.fromEntries(SURVEY_CATEGORIES)
const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10)
const todayKey = () => new Date().toISOString().slice(0, 10)

// Daily log: the end-of-day meeting as a screen. Entries grouped day -> contributor -> rows.
export default function SurveyDailyLog({ entries, buildings }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [person, setPerson] = useState('all')
  const [building, setBuilding] = useState('all')
  const [category, setCategory] = useState('all')
  const [collapsed, setCollapsed] = useState({}) // dayKey -> bool

  const people = useMemo(() => {
    const m = {}
    entries.forEach((e) => { if (e.created_by) m[e.created_by] = e.author?.full_name || 'Unknown' })
    return Object.entries(m).sort((a, b) => a[1].localeCompare(b[1]))
  }, [entries])

  const filtered = useMemo(() => entries.filter((e) => {
    const d = dayKey(e.created_at)
    if (from && d < from) return false
    if (to && d > to) return false
    if (person !== 'all' && e.created_by !== person) return false
    if (building !== 'all' && e.building_id !== building) return false
    if (category !== 'all' && e.category !== category) return false
    return true
  }), [entries, from, to, person, building, category])

  // group day -> contributor
  const days = useMemo(() => {
    const byDay = {}
    filtered.forEach((e) => {
      const d = dayKey(e.created_at)
      byDay[d] = byDay[d] || { day: d, rows: [], byPerson: {}, units: 0, cats: {} }
      byDay[d].rows.push(e)
      const pid = e.created_by || '—'
      byDay[d].byPerson[pid] = byDay[d].byPerson[pid] || { name: e.author?.full_name || 'Unknown', rows: [], units: 0 }
      byDay[d].byPerson[pid].rows.push(e)
      byDay[d].byPerson[pid].units += e.qty || 0
      byDay[d].units += e.qty || 0
      byDay[d].cats[e.category] = (byDay[d].cats[e.category] || 0) + (e.qty || 0)
    })
    return Object.values(byDay).sort((a, b) => (a.day < b.day ? 1 : -1))
  }, [filtered])

  const sel = { ...ctrl }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>FROM</span>
        <DateInput style={{ ...sel, width: 150 }} value={from} onChange={(e) => setFrom(e.target.value)} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>TO</span>
        <DateInput style={{ ...sel, width: 150 }} value={to} onChange={(e) => setTo(e.target.value)} />
        <select style={sel} value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="all">Everyone</option>
          {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select style={sel} value={building} onChange={(e) => setBuilding(e.target.value)}>
          <option value="all">All buildings</option>
          {buildings.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
        </select>
        <select style={sel} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All categories</option>
          {SURVEY_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {days.length === 0 ? <Empty icon="daily">No survey entries for this filter.</Empty> : days.map((d) => {
        const open = !(collapsed[d.day] ?? false)
        return (
          <div key={d.day} style={{ border: '1px solid var(--line)', borderRadius: 10, marginBottom: 12, overflow: 'hidden', background: '#fff' }}>
            <button onClick={() => setCollapsed((p) => ({ ...p, [d.day]: open }))}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 14px', background: d.day === todayKey() ? '#F5EEDF' : 'var(--bg)', cursor: 'pointer', border: 'none' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <Icon name={open ? 'chevron' : 'chevronr'} size={14} />
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>{fmtDate(d.day)}{d.day === todayKey() && <span style={{ marginLeft: 7, fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 5, color: '#A0762B', background: '#EFE3C8' }}>TODAY</span>}</span>
              </span>
              <span style={{ display: 'flex', gap: 12, alignItems: 'center', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>
                <span>{num(d.rows.length)} entries</span><span>{num(d.units)} units</span>
                <span style={{ display: 'flex', gap: 5 }}>{Object.entries(d.cats).map(([c, n]) => <span key={c} style={{ padding: '1px 7px', borderRadius: 10, background: '#fff', border: '1px solid var(--line)' }}>{CAT_LABEL[c] || c} {num(n)}</span>)}</span>
              </span>
            </button>
            {open && (
              <div style={{ padding: '4px 14px 12px' }}>
                {Object.entries(d.byPerson).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([pid, p]) => (
                  <div key={pid} style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <span style={{ fontWeight: 700, fontSize: 12.5 }}>{p.name}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)' }}>{num(p.rows.length)} entries · {num(p.units)} units</span>
                    </div>
                    <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 560 }}>
                      <tbody>
                        {p.rows.map((e) => (
                          <tr key={e.id} style={{ borderTop: '1px solid var(--line)' }}>
                            <td style={{ padding: '6px 7px', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{e.building?.code || '—'}</td>
                            <td style={{ padding: '6px 7px', whiteSpace: 'nowrap' }}>{[e.floor, e.room_name].filter(Boolean).join(' · ') || '—'}</td>
                            <td style={{ padding: '6px 7px' }}><span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '1px 7px', borderRadius: 6, color: '#A0762B', background: '#F5EEDF' }}>{CAT_LABEL[e.category] || e.category}</span></td>
                            <td style={{ padding: '6px 7px', color: 'var(--text-2)' }}>{[e.make, e.model, e.category === 'ac' && e.tr ? `${num(e.tr)} TR` : e.category === 'lighting' && e.wattage ? `${num(e.wattage)} W` : ''].filter(Boolean).join(' ') || e.equipment_type || '—'}</td>
                            <td style={{ padding: '6px 7px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11 }}>×{num(e.qty)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const ctrl = { padding: '8px 10px', border: '1px solid var(--line-ctrl)', borderRadius: 6, background: '#fff', fontSize: 12.5 }
