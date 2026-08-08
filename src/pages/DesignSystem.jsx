import { Btn, Chip, Field, inputStyle } from '../components/ui'
import FileDropZone from '../components/FileDropZone'

// Sprint 8M — live token gallery for the IES Control visual redesign. Pure
// presentation: no queries, no state, no writes. Route: /design-system.
const COLORS = [
  ['Chrome Navy', 'var(--text)'], ['Navy Elevated', 'var(--text-2)'], ['Brass', 'var(--accent)'],
  ['Brass Hover', 'var(--accent-hover)'], ['Brass Bright', 'var(--brass-bright)'], ['Paper Canvas', 'var(--bg)'],
  ['Paper Raised', 'var(--raised)'], ['Paper Hover', 'var(--hover)'], ['Ink', 'var(--text)'],
  ['Ink Display', 'var(--text)'], ['Text Muted', 'var(--text-3)'], ['Text Faint', 'var(--text-faint)'],
  ['Border', 'var(--line)'], ['Border Soft', 'var(--line-soft)'], ['Border Control', 'var(--line-ctrl)'],
  ['Track', 'var(--track)'], ['OK', 'var(--ok)'], ['Warn', 'var(--warn)'], ['Bad', 'var(--bad)'],
  ['Info / ESM1 Steel', 'var(--esm1)'], ['ESM2 Violet', 'var(--esm2)'], ['ESM3 Teal', 'var(--esm3)'], ['Live', 'var(--live)'],
]
const BADGES = [
  ['ACTIVE', 'var(--ok)', 'var(--ok-bg)'], ['UNDER REVIEW', 'var(--warn)', 'var(--warn-bg)'],
  ['REJECTED', 'var(--bad)', 'var(--bad-bg)'], ['SUBMITTED', 'var(--info)', 'var(--info-bg)'],
  ['ESM1', 'var(--esm1)', 'var(--esm1-bg)'], ['ESM2', 'var(--esm2)', 'var(--esm2-bg)'], ['ESM3', 'var(--esm3)', 'var(--esm3-bg)'],
]
const Sect = ({ title, children }) => (
  <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 18, marginBottom: 16 }}>
    <div className="ies-kicker" style={{ marginBottom: 12 }}>{title}</div>
    {children}
  </div>
)

export default function DesignSystem() {
  return (
    <div data-screen-label="Design System">
      <div className="ies-kicker ies-kicker-brass">Design System</div>
      <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.3px', color: 'var(--ink-display)', margin: '4px 0 18px' }}>IES Control — Visual Tokens</h1>

      <Sect title="COLOR">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
          {COLORS.map(([name, hex]) => (
            <div key={name} style={{ border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-s)', overflow: 'hidden' }}>
              <div style={{ height: 44, background: hex, borderBottom: '1px solid var(--line-soft)' }} />
              <div style={{ padding: '6px 9px' }}>
                <div style={{ fontSize: 11.5, fontWeight: 600 }}>{name}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>{hex}</div>
              </div>
            </div>
          ))}
        </div>
      </Sect>

      <Sect title="TYPOGRAPHY">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.3px', color: 'var(--ink-display)' }}>Page title — IBM Plex Sans 700</div>
          <div style={{ fontSize: 34, fontWeight: 700, color: 'var(--ink-display)' }}>0,000<span style={{ fontSize: 16, color: 'var(--text-3)', fontWeight: 500 }}> units</span></div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Card heading — Plex Sans 700 · 14px</div>
          <div style={{ fontSize: 13 }}>Body / table cell — Plex Sans 400 · 13px · line-height 1.45. Engineers scan many rows, so density stays.</div>
          <div className="ies-kicker">KICKER / LABEL — PLEX MONO 600 · TRACKED 2.5PX</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>DATA — AAA-000-000 · 0000-00-00 · 0,000 · 00%</div>
        </div>
      </Sect>

      <Sect title="BUTTONS">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Btn variant="primary">Primary — brass</Btn>
          <Btn>Secondary</Btn>
          <Btn variant="ghost">Ghost</Btn>
          <Btn variant="danger">Danger</Btn>
          <Btn variant="primary" disabled>Disabled</Btn>
          <button style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 12.5, textDecoration: 'underline' }}>Inline action</button>
        </div>
      </Sect>

      <Sect title="BADGES">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {BADGES.map(([label, c, bg]) => (
            <span key={label} style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 4, color: c, background: bg }}>{label}</span>
          ))}
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, padding: '3px 11px', borderRadius: 999, color: 'var(--ok)', background: 'var(--ok-bg)' }}>ACTIVE · hero pill</span>
        </div>
      </Sect>

      <Sect title="PROGRESS">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
          {[['Brass — in progress', 'var(--accent)', 56, 8], ['Green — ≥90% / done', 'var(--ok)', 94, 8], ['Thin row bar', 'var(--accent)', 40, 6]].map(([label, color, w, h]) => (
            <div key={label}>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 4 }}>{label}</div>
              <div style={{ height: h, borderRadius: 2, background: 'var(--track)', overflow: 'hidden' }}><div style={{ height: '100%', width: w + '%', background: color }} /></div>
            </div>
          ))}
        </div>
      </Sect>

      <Sect title="TABLE">
        <table className="ies-tbl">
          <thead><tr><th>Code</th><th>Building</th><th>Status</th><th style={{ textAlign: 'right' }}>Progress</th></tr></thead>
          <tbody>
            <tr className="ies-trow"><td style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>AAA-001</td><td style={{ fontWeight: 600 }}>Sample Row One</td><td><Chip status="active" /></td><td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>00%</td></tr>
            <tr className="ies-trow"><td style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>AAA-002</td><td style={{ fontWeight: 600 }}>Sample Row Two</td><td><Chip status="pending" /></td><td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>00%</td></tr>
          </tbody>
        </table>
      </Sect>

      <Sect title="FORMS">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 640 }}>
          <Field label="Text input"><input lang="en" style={inputStyle} placeholder="Type here…" /></Field>
          <Field label="Select"><select style={inputStyle}><option>Option A</option><option>Option B</option></select></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 640, marginTop: 4 }}>
          <FileDropZone label="Drop zone — full" accept=".pdf" helperText="PDF · 25 MB cap" onFiles={() => {}} />
          <FileDropZone label="Drop zone — compact" compact multi accept="image/*" onFiles={() => {}} />
        </div>
      </Sect>

      <Sect title="CHAT BUBBLES">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380 }}>
          <div style={{ alignSelf: 'flex-start', fontSize: 12.5, background: 'var(--hover)', border: '1px solid var(--track)', borderRadius: 'var(--radius-m)', padding: '7px 10px' }}>Others — Paper Hover bubble</div>
          <div style={{ alignSelf: 'flex-end', fontSize: 12.5, background: 'var(--accent-tint)', border: '1px solid var(--warn-bg)', borderRadius: 'var(--radius-m)', padding: '7px 10px' }}>Own — brass-tint bubble</div>
        </div>
      </Sect>
    </div>
  )
}
