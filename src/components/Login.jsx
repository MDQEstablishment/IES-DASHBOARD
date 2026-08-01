import { useState } from 'react'
import { Spinner } from './ui'
import { ROLE_CARDS, ROLE_FULL, DEMO_MODE, DEMO_PASSWORD, ROSTER } from '../lib/constants'
import { useAuth } from '../rbac'

// 9M — the owner's approved sign-in design, ported.
//
// VISUAL LAYER ONLY. useAuth, signInEmail, signInWithRole, the busy state and
// its opacity:.7 treatment, the DEMO_MODE role cards, Enter-to-submit and the
// footer copy are byte-for-byte the behaviour that shipped before; only the
// markup around them changed.
//
// COLOURS: the design package is warm navy + brass and hard-codes its hexes.
// Every one of them here resolves to a token instead, and three of the
// package's values turned out to BE the platform's tokens already — its brass
// base/bright/deep (#A0762B / #C29A4B / #8A6524) are exactly --accent /
// --brass-bright / --accent-hover, confirmed by reading index.css rather than
// assuming. The rail needed a second dark surface for its gradient, which is
// the one new token this sprint adds (--logo-navy-2).
//
// Anything requiring alpha lives in index.css, where color-mix can supply it
// from a token — so this file carries zero colour literals, where the version
// it replaces carried five.
//
// FONTS: the package's IBM Plex <link> is deliberately NOT here. A
// render-blocking Google Fonts request on the screen 9K(4) cut to ~206 kB
// would be a regression. The headline uses the app's own Inter (--ui); the
// kicker and footers use --mono, which is a system stack and costs nothing.

// The circuit network: three static paths, the same three overlaid with a
// travelling dash, and four pulsing junctions. Durations and negative delays
// are the package's, so the three currents never march in step.
const PATHS = [
  'M-20,200 H180 V480 H420 V300 H760',
  'M-20,700 H120 V540 H360 V760 H760',
  'M200,-20 V150 H520 V680 H760',
]
const NODES = [[180, 480], [420, 300], [360, 760], [520, 150]]

function CircuitField() {
  return (
    <svg viewBox="0 0 740 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <g fill="none" stroke="var(--brass-bright)" strokeOpacity="0.3" strokeWidth="1.4">
        {PATHS.map((d) => <path key={d} d={d} />)}
      </g>
      <g fill="none" stroke="var(--brass-bright)" strokeWidth="2" strokeDasharray="14 300" opacity="0.9">
        {PATHS.map((d, i) => <path key={d} d={d} className={`ies-flow-${i + 1}`} />)}
      </g>
      <g fill="var(--brass-bright)">
        {NODES.map(([cx, cy], i) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.4"
            className={'ies-node' + (i ? ` ies-node-${i + 1}` : '')} />
        ))}
      </g>
    </svg>
  )
}

const fieldStyle = {
  width: '100%', boxSizing: 'border-box', height: 46, padding: '0 18px',
  border: '1px solid var(--line-ctrl)', borderRadius: 99, background: 'var(--surface-1)',
  fontSize: 14, color: 'var(--text)',
}
const labelStyle = {
  display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 7,
}

export default function Login() {
  const { signInWithRole, signInEmail } = useAuth()
  const [busy, setBusy] = useState(null)
  // Prefill only in demo builds; production shows a plain empty sign-in form.
  const [email, setEmail] = useState(DEMO_MODE ? ROSTER.pmo.email : '')
  const [pw, setPw] = useState(DEMO_MODE ? DEMO_PASSWORD : '')

  const pick = async (r) => { setBusy(r); await signInWithRole(r); setBusy(null) }
  const manual = async () => { setBusy('manual'); await signInEmail(email.trim(), pw); setBusy(null) }

  return (
    <div className="ies-login" data-screen-label="Sign in"
      style={{ position: 'fixed', inset: 0, display: 'grid', gridTemplateColumns: '1.1fr 1fr', fontFamily: 'var(--ui)' }}>

      {/* ── left rail ─────────────────────────────────────────────────── */}
      <div className="ies-loginleft ies-login-rail" style={{
        position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', padding: 48,
      }}>
        <CircuitField />
        <div className="ies-login-vignette" />

        <div className="ies-up" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 9, background: 'var(--logo-navy-2)',
            border: '1px solid var(--brass-bright)', position: 'relative', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)',
            fontWeight: 700, color: 'var(--on-navy)', fontSize: 12, letterSpacing: '.5px',
          }}>
            IES
            <span className="ies-login-dot" style={{
              position: 'absolute', top: 5, right: 5, width: 6, height: 6,
              borderRadius: '50%', background: 'var(--brass-bright)',
            }} />
          </div>
          <div>
            <div style={{ color: 'var(--on-navy)', fontWeight: 700, fontSize: 15 }}>Integrated Energy Solutions</div>
            <div style={{ color: 'var(--on-navy-2)', fontSize: 12, marginTop: 2 }}>Programme control · Retrofit</div>
          </div>
        </div>

        <div style={{ position: 'relative', maxWidth: 560 }}>
          <div className="ies-up-2" style={{
            fontFamily: 'var(--mono)', fontSize: 11.5, letterSpacing: '4px', color: 'var(--brass-bright)',
          }}>KINGDOM OF SAUDI ARABIA</div>
          <h1 className="ies-up-3" style={{
            fontSize: 44, lineHeight: 1.12, fontWeight: 700, color: 'var(--on-navy)',
            letterSpacing: '-1px', margin: '16px 0 0',
          }}>Efficiency for a Sustainable Future</h1>
        </div>

        <div className="ies-fade" style={{
          position: 'relative', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--on-navy-2)',
        }}>Build 2.0</div>
      </div>

      {/* ── right panel ───────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40,
        overflowY: 'auto', background: 'var(--bg)',
      }}>
        <div className="ies-up-4" style={{ width: '100%', maxWidth: 440 }}>
          {/* Owner's standing ruling: the Vault SSO line stays. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-3)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />Vault SSO
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.5px', margin: '10px 0 6px' }}>Sign in to IES</h1>
          <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '0 0 24px' }}>
            {DEMO_MODE ? 'Use your corporate credentials, or pick a demo role below.' : 'Use your corporate credentials.'}
          </p>

          <label style={{ display: 'block', marginBottom: 16 }}>
            <span style={labelStyle}>Email</span>
            <input lang="en" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@ies.sa" style={fieldStyle} />
          </label>
          <label style={{ display: 'block', marginBottom: 24 }}>
            <span style={labelStyle}>Password</span>
            <input lang="en" type="password" value={pw} onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && manual()} placeholder="••••••••" style={fieldStyle} />
          </label>

          <button onClick={manual} disabled={!!busy} className="ies-login-btn" style={{
            width: '100%', height: 48, border: 'none', borderRadius: 99, color: 'var(--surface-1)',
            fontSize: 14.5, fontWeight: 700, position: 'relative', overflow: 'hidden',
            boxShadow: 'var(--shadow-2)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8, opacity: busy ? 0.7 : 1,
          }}>
            {busy === 'manual' ? <Spinner size={16} /> : 'Sign in'}
            <span className="ies-login-shimmer" />
          </button>

          {DEMO_MODE && (<>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0 16px', color: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--mono)' }}>
              <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />Or pick a demo role<span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            </div>
            <div className="ies-rolecards" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {ROLE_CARDS.map(([key, short, desc]) => (
                <button key={key} className="ies-card-hover" disabled={!!busy} onClick={() => pick(key)} style={{ textAlign: 'left', padding: '10px 11px', border: '1px solid var(--line)', borderRadius: 'var(--radius-s)', background: 'var(--surface-1)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 12, color: 'var(--accent)' }}>{busy === key ? 'SIGNING IN…' : ROLE_FULL[key].toUpperCase()}</span>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{short}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.3 }}>{desc}</span>
                </button>
              ))}
            </div>
          </>)}

          <div style={{ fontFamily: 'var(--mono)', color: 'var(--text-3)', fontSize: 10.5, marginTop: 20, textAlign: 'center' }}>{DEMO_MODE ? 'BUILD 2.0 · DEMO ENVIRONMENT' : 'BUILD 2.0'}</div>
        </div>
      </div>
    </div>
  )
}
