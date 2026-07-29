// Small formatting helpers. Mono/tabular numerals are applied via CSS (.num).

export function num(n) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toLocaleString('en-US')
}

// 9E — THE Arabic-digit coercion (Arabic-Indic ٠-٩ and Persian ۰-۹ -> Latin).
// This was copy-pasted into seven components before it was ever exported, and
// one of the copies (the TARSHID import) drifted to Arabic-Indic-only, letting
// Persian digits reach parseFloat as NaN. One definition now.
export const toLatin = (s) => String(s ?? '')
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))

export function pct(n) {
  if (n == null || isNaN(n)) return '0%'
  return Math.round(n) + '%'
}

// Local-day helpers. The app's "day" is the user's LOCAL day (site teams are
// UTC+3): `toISOString().slice(0,10)` is UTC and shifts entries logged between
// midnight and 3am local onto the previous day. Always Latin digits (String()).
const p2 = (n) => String(n).padStart(2, '0')
export function localDayKey(d) {
  const t = d instanceof Date ? d : new Date(d ?? Date.now())
  if (isNaN(t)) return ''
  return `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}`
}
export const localToday = () => localDayKey(new Date())

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtDate(d) {
  if (!d) return '—'
  const t = new Date(d)
  if (isNaN(t)) return '—'
  return `${t.getDate()} ${MON[t.getMonth()]} ${t.getFullYear()}`
}

export function fmtShort(d) {
  if (!d) return '—'
  const t = new Date(d)
  if (isNaN(t)) return '—'
  return `${t.getDate()} ${MON[t.getMonth()]}`
}

export function fmtDateTime(d) {
  if (!d) return '—'
  const t = new Date(d)
  if (isNaN(t)) return '—'
  const hh = String(t.getHours()).padStart(2, '0')
  const mm = String(t.getMinutes()).padStart(2, '0')
  return `${t.getDate()} ${MON[t.getMonth()]} · ${hh}:${mm}`
}

// Live header clock — built from String()/padStart (always Latin digits), never
// a locale formatter, so it stays English under any OS locale (e.g. ar-SA).
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export function fmtClock(d) {
  const t = d instanceof Date ? d : new Date(d)
  if (isNaN(t)) return '—'
  const p = (x) => String(x).padStart(2, '0')
  return `${DOW[t.getDay()]} ${p(t.getDate())} ${MON[t.getMonth()]} · ${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`
}

export function ago(d) {
  if (!d) return '—'
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  return `${days}d ago`
}

export function daysUntil(d) {
  if (!d) return null
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000)
}

export function initials(name) {
  if (!name) return '?'
  const p = String(name).trim().split(/\s+/)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || name[0].toUpperCase()
}

// 9D-5 — the JS mirror of the DB's room_key(): the one definition of "the same
// room". Must stay in lockstep with supabase/migrations/0098, because the UI
// uses it to tell the engineer whether the name they typed will MATCH an
// existing room or CREATE a new one — and the server then decides for real.
// Strips Arabic tatweel, folds Arabic-Indic and Persian digits to Latin,
// collapses whitespace, casefolds.
export function roomKey(name) {
  return toLatin(String(name ?? '').replace(/ـ/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}
