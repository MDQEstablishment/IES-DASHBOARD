import { useState } from 'react'
import Icon from './Icon'
import { Avatar, Btn } from './ui'
import { ROLE_ORDER, ROSTER, roleGradient, roleTitle } from '../lib/constants'
import { useAuth } from '../rbac'

export default function Login() {
  const { signInWithRole, signInEmail } = useAuth()
  const [busy, setBusy] = useState(null)
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')

  const pick = async (r) => { setBusy(r); await signInWithRole(r); setBusy(null) }
  const manual = async (e) => { e.preventDefault(); setBusy('manual'); await signInEmail(email.trim(), pw); setBusy(null) }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-head">
          <div className="flex center gap-3 mb-3">
            <div className="brand-mark" style={{ width: 40, height: 40 }}><span className="g">IES</span><span className="dot" /></div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>IES Programme Control</div>
              <div className="brand-sub" style={{ color: 'var(--text-3)' }}>Integrated Energy Solutions</div>
            </div>
          </div>
          <div className="kicker mb-2">Demo sign-in · pick a role</div>
          <div className="page-sub" style={{ marginTop: 0 }}>One click signs you in as that person. Switch any time from the sidebar.</div>
        </div>
        <div className="card-body">
          <div className="role-tiles">
            {ROLE_ORDER.map((r) => (
              <button key={r} className="role-tile" disabled={!!busy} onClick={() => pick(r)}>
                <Avatar name={ROSTER[r].name} gradient={roleGradient(r)} size={30} />
                <div className="grow truncate">
                  <div style={{ fontSize: 12.5, fontWeight: 600 }} className="truncate">{ROSTER[r].name}</div>
                  <div className="brand-sub" style={{ color: 'var(--text-3)' }}>{roleTitle(r)}</div>
                </div>
                {busy === r ? <span className="spinner" /> : <Icon name="ArrowUpRight" size={14} color="var(--text-4)" />}
              </button>
            ))}
          </div>

          <details style={{ marginTop: 16 }}>
            <summary className="kicker" style={{ cursor: 'pointer' }}>Or sign in manually</summary>
            <form onSubmit={manual} style={{ marginTop: 12 }}>
              <div className="field"><label>Email</label>
                <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@ies.demo.local" autoComplete="username" />
              </div>
              <div className="field"><label>Password</label>
                <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
              </div>
              <Btn variant="primary" type="submit" disabled={busy === 'manual'} className="w-full" style={{ width: '100%', justifyContent: 'center' }}>
                {busy === 'manual' ? 'Signing in…' : 'Sign in'}
              </Btn>
            </form>
          </details>
        </div>
      </div>
    </div>
  )
}
