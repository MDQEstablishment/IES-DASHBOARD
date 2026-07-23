import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { ROSTER, DEMO_MODE, DEMO_PASSWORD } from './lib/constants'
import { toast } from './lib/toast'

// Declarative role-based access. Current role is pulled from the profiles row of
// the signed-in user. <Can allow={[...]}> renders children only for those roles.

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = still resolving
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session === undefined) return
    if (!session) { setProfile(null); return }
    let alive = true
    supabase.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data, error }) => {
        if (!alive) return
        if (error) console.warn('[IES] profile load failed', error.message)
        setProfile(data || null)
      })
    return () => { alive = false }
  }, [session])

  const signInWithRole = useCallback(async (role) => {
    const r = ROSTER[role]
    if (!r || !DEMO_MODE || !DEMO_PASSWORD) { toast('Demo sign-in is disabled in this build', 'err'); return }
    const { error } = await supabase.auth.signInWithPassword({ email: r.email, password: DEMO_PASSWORD })
    if (error) toast('Sign-in failed — ' + error.message, 'err')
  }, [])

  const signInEmail = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { toast('Sign-in failed — ' + error.message, 'err'); return false }
    return true
  }, [])

  const signOut = useCallback(async () => { await supabase.auth.signOut() }, [])

  const value = {
    session,
    user: session?.user || null,
    profile,
    role: profile?.role || null,
    authLoading: session === undefined,
    profileLoading: !!session && !profile,
    signInWithRole, signInEmail, signOut,
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
export const useRole = () => useContext(AuthCtx)?.role || null

export function can(role, allow) {
  if (!allow || allow.length === 0) return true
  return allow.includes(role)
}

// Renders children only when the current role is in `allow`.
export function Can({ allow, children, fallback = null }) {
  const role = useRole()
  return can(role, allow) ? children : fallback
}
