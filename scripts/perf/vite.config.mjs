import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..', '..')

// Importing the real page pulls in src/lib/supabase, which constructs its client
// at module scope and throws without a URL and key. The harness never calls it —
// TeamPerformance touches no network — but the module still has to load.
//
// These come from the repo's committed .env.production, which exists precisely
// because both values are public by design (the publishable key is RLS-protected
// and ships in the browser bundle). Nothing secret is being injected here: the
// demo password is deliberately absent from that file and is not needed, since
// this harness never signs in.
const env = loadEnv('production', ROOT, 'VITE_')

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  server: { fs: { allow: [ROOT] } },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || ''),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(env.VITE_SUPABASE_PUBLISHABLE_KEY || ''),
  },
})
