import { useState } from 'react'
import { Spinner } from './ui'
import { ROLE_CARDS, ROLE_FULL, DEMO_MODE, DEMO_PASSWORD, ROSTER } from '../lib/constants'
import { useAuth } from '../rbac'

function KsaMap() {
  return (
    <svg viewBox="0 0 200 200" style={{ position: 'absolute', right: -30, bottom: 40, width: 320, height: 320, opacity: 0.16 }}>
      <path d="M40 60 L120 40 L165 70 L160 120 L130 160 L80 165 L55 130 L35 95 Z" fill="none" stroke="var(--brass-bright)" strokeWidth="1.5" />
      <circle cx="95" cy="130" r="4" fill="var(--warn)" />
      <circle cx="95" cy="130" r="11" fill="none" stroke="var(--warn)" strokeWidth="1" />
    </svg>
  )
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
    <div className="ies-login" style={{ position: 'fixed', inset: 0, display: 'grid', gridTemplateColumns: '1.1fr 1fr', fontFamily: 'var(--ui)' }}>
      <div className="ies-loginleft" style={{ position: 'relative', background: 'var(--logo-navy)', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 48 }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.5, background: 'radial-gradient(900px 600px at 70% 30%,rgba(160,118,43,.28),transparent 60%),radial-gradient(700px 500px at 20% 90%,rgba(245,158,11,.12),transparent 55%)' }} />
        <KsaMap />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-s)', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(240,237,227,.22)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--surface-1)', fontSize: 14, letterSpacing: '.5px' }}>IES<span style={{ position: 'absolute', top: 5, right: 5, width: 6, height: 6, borderRadius: '50%', background: 'var(--warn)' }} /></div>
          <div><div style={{ color: 'var(--on-navy)', fontWeight: 700, fontSize: 15 }}>Integrated Energy Solutions</div><div style={{ color: 'var(--on-navy-2)', fontSize: 12, marginTop: 2 }}>Programme control · Retrofit</div></div>
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ fontFamily: 'var(--mono)', color: 'var(--brass-bright)', fontSize: 11, letterSpacing: '3px', marginBottom: 14 }}>Asir Region · KSA</div>
          <div style={{ color: 'var(--surface-1)', fontSize: 30, fontWeight: 800, lineHeight: 1.15, maxWidth: 420 }}>Building-first control for government energy-retrofit programmes.</div>
          <div style={{ color: 'var(--on-navy-2)', fontSize: 14, marginTop: 16, maxWidth: 420 }}>Survey to handover. Every ESM, every building, every role — one console.</div>
        </div>
        <div style={{ position: 'relative', fontFamily: 'var(--mono)', color: 'var(--on-navy-2)', fontSize: 11 }}>Build 2.0</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, overflowY: 'auto', background: 'var(--bg)' }}>
        <div style={{ width: '100%', maxWidth: 440 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-3)' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />Vault SSO</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: '10px 0 4px' }}>Sign in to IES</h1>
          <p style={{ color: 'var(--text-3)', margin: '0 0 22px' }}>{DEMO_MODE ? 'Use your corporate credentials, or pick a demo role below.' : 'Use your corporate credentials.'}</p>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>Email</label>
          <input lang="en" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', padding: '11px 12px', border: '1px solid var(--line)', borderRadius: 'var(--radius-s)', background: 'var(--surface-1)', fontSize: 14, marginBottom: 14 }} />
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>Password</label>
          <input lang="en" type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && manual()} style={{ width: '100%', padding: '11px 12px', border: '1px solid var(--line)', borderRadius: 'var(--radius-s)', background: 'var(--surface-1)', fontSize: 14, marginBottom: 16 }} />
          <button onClick={manual} disabled={!!busy} style={{ width: '100%', padding: 12, borderRadius: 'var(--radius-s)', background: 'var(--accent)', color: 'var(--surface-1)', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy ? 0.7 : 1 }}>{busy === 'manual' ? <Spinner size={16} /> : 'Sign in'}</button>
          {DEMO_MODE && (<>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0 16px', color: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--mono)' }}><span style={{ flex: 1, height: 1, background: 'var(--line)' }} />Or pick a demo role<span style={{ flex: 1, height: 1, background: 'var(--line)' }} /></div>
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
