// Small formatting helpers. Mono/tabular numerals are applied via CSS (.num).

export function money(n, { m = false } = {}) {
  if (n == null || isNaN(n)) return '—'
  if (m) return 'SAR ' + (n / 1_000_000).toFixed(1) + 'M'
  return 'SAR ' + Number(n).toLocaleString('en-US')
}

export function num(n) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toLocaleString('en-US')
}

export function pct(n) {
  if (n == null || isNaN(n)) return '0%'
  return Math.round(n) + '%'
}

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
