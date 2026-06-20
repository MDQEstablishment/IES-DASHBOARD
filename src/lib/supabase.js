import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  // Surfaced clearly in the console rather than failing with a cryptic null error.
  console.error('[IES] Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — check .env')
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'ies.auth',
  },
  realtime: { params: { eventsPerSecond: 5 } },
})
