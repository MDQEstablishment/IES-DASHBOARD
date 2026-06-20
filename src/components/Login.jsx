import { useState } from 'react'
import { Spinner } from './ui'
import { ROLE_CARDS, ROLE_FULL, DEMO_PASSWORD, ROSTER } from '../lib/constants'
import { useAuth } from '../rbac'

function KsaMap() {
  return (
    <svg viewBox="0 0 200 200" style={{ position: 'absolute', right: -30, bottom: 40, width: 320, height: 320, opacity: 0.16 }}>
      <path d="M40 60 L120 40 L165 70 L160 120 L130 160 L80 165 L55 130 L35 95 Z" fill="none" stroke="#3B82F6" strokeWidth="1.5" />
      <circle cx="95" cy="130" r="4" fill="#F59E0B" />
      <circle cx="95" cy="130" r="11" fill="none" stroke="#F59E0B" strokeWidth="1" />
    </svg>
  )
}

export default function Login() {
  const { signInWithRole, signInEmail } = useAuth()
  const [busy, setBusy] = useState(null)
  const [email, setEmail] = useState(ROSTER.pmo.email)
  const [pw, setPw] = useState(DEMO_PASSWORD)

  const pick = async (r) => { setBusy(r); await signInWithRole(r); setBusy(null) }
  const manual = async () => { setBusy('manual'); await signInEmail(email.trim(), pw); setBusy(null) }

  return (
    <div className="ies-login" style={{ position: 'fixed', inset: 0, display: 'grid', gridTemplateColumns: '1.1fr 1fr', fontFamily: 'var(--ui)' }}>
      <div className="ies-loginleft" style={{ position: 'relative', background: '#0F172A', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 48 }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.5, background: 'radial-gradient(900px 600px at 70% 30%,rgba(37,99,235,.28),transparent 60%),radial-gradient(700px 500px at 20% 90%,rgba(245,158,11,.12),transparent 55%)' }} />
        <KsaMap />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 9, background: '#1E293B', border: '1px solid #334155', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontWeight: 700, color: '#fff', fontSize: 14, letterSpacing: '.5px' }}>IES<span style={{ position: 'absolute', top: 5, right: 5, width: 6, height: 6, borderRadius: '50%', background: '#F59E0B' }} /></div>
          <div><div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Integrated Energy Solutions</div><div style={{ color: '#64748B', fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '2px', marginTop: 2 }}>PROGRAMME CONTROL · RETROFIT</div></div>
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ fontFamily: 'var(--mono)', color: '#3B82F6', fontSize: 11, letterSpacing: '3px', marginBottom: 14 }}>ASIR REGION · KSA</div>
          <div style={{ color: '#fff', fontSize: 30, fontWeight: 800, lineHeight: 1.15, maxWidth: 420 }}>Building-first control for government energy-retrofit programmes.</div>
          <div style={{ color: '#94A3B8', fontSize: 14, marginTop: 16, maxWidth: 420 }}>Survey to handover. Every ESM, every building, every role — one console.</div>
        </div>
        <div style={{ position: 'relative', fontFamily: 'var(--mono)', color: '#475569', fontSize: 11, letterSpacing: '2px' }}>BUILD 2.0</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, overflowY: 'auto', background: 'var(--bg)' }}>
        <div style={{ width: '100%', maxWidth: 440 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '2px', color: 'var(--text-3)' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />VAULT SSO</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: '10px 0 4px' }}>Sign in to IES</h1>
          <p style={{ color: 'var(--text-3)', margin: '0 0 22px' }}>Use your corporate credentials, or pick a demo role below.</p>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', padding: '11px 12px', border: '1px solid var(--line)', borderRadius: 8, background: '#fff', fontSize: 14, marginBottom: 14 }} />
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>Password</label>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && manual()} style={{ width: '100%', padding: '11px 12px', border: '1px solid var(--line)', borderRadius: 8, background: '#fff', fontSize: 14, marginBottom: 16 }} />
          <button onClick={manual} disabled={!!busy} style={{ width: '100%', padding: 12, borderRadius: 8, background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy ? 0.7 : 1 }}>{busy === 'manual' ? <Spinner size={16} /> : 'Sign in'}</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0 16px', color: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '1px' }}><span style={{ flex: 1, height: 1, background: 'var(--line)' }} />OR PICK A DEMO ROLE<span style={{ flex: 1, height: 1, background: 'var(--line)' }} /></div>
          <div className="ies-rolecards" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {ROLE_CARDS.map(([key, short, desc]) => (
              <button key={key} className="ies-card-hover" disabled={!!busy} onClick={() => pick(key)} style={{ textAlign: 'left', padding: '10px 11px', border: '1px solid var(--line)', borderRadius: 9, background: '#fff', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '1px', color: 'var(--accent)' }}>{busy === key ? 'SIGNING IN…' : ROLE_FULL[key].toUpperCase()}</span>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{short}</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.3 }}>{desc}</span>
              </button>
            ))}
          </div>
          <div style={{ fontFamily: 'var(--mono)', color: 'var(--text-3)', fontSize: 10.5, letterSpacing: '2px', marginTop: 20, textAlign: 'center' }}>BUILD 2.0 · DEMO ENVIRONMENT</div>
        </div>
      </div>
    </div>
  )
}
