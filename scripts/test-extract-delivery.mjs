#!/usr/bin/env node
/**
 * Sprint 8D — end-to-end smoke test for the delivery-note extraction pipeline.
 *
 * Signs in as a write-role demo user, uploads the seed fixture to the
 * `delivery-notes` bucket, invokes the `extract-delivery-pdf` Edge Function, and
 * prints the extracted header, the per-line catalog matches, and (from the
 * pdf_extraction_log) the token counts + cost of the call.
 *
 * Run locally (needs outbound network to *.supabase.co):
 *   VITE_SUPABASE_URL=... VITE_SUPABASE_PUBLISHABLE_KEY=... VITE_DEMO_PASSWORD=... \
 *   TEST_EMAIL=omar.zaki@ies.demo.local TEST_PROJECT_ID=<uuid> \
 *   node scripts/test-extract-delivery.mjs
 *
 * (Falls back to reading .env.production for the three VITE_* values.)
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let env = { ...process.env }
try {
  for (const l of readFileSync(join(ROOT, '.env.production'), 'utf8').split('\n')) {
    const i = l.indexOf('='); if (i < 0) continue
    const k = l.slice(0, i).trim(); if (!env[k]) env[k] = l.slice(i + 1).trim()
  }
} catch { /* env vars only */ }

const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_PUBLISHABLE_KEY, pwd = env.VITE_DEMO_PASSWORD
const email = env.TEST_EMAIL || 'omar.zaki@ies.demo.local'
const projectId = env.TEST_PROJECT_ID
if (!url || !key || !pwd || !projectId) { console.error('Missing env (need VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_DEMO_PASSWORD, TEST_PROJECT_ID).'); process.exit(1) }

const sb = createClient(url, key)
const { data: auth, error: aerr } = await sb.auth.signInWithPassword({ email, password: pwd })
if (aerr) { console.error('Sign-in failed:', aerr.message); process.exit(1) }
console.log('Signed in as', auth.user.email)

const path = `${projectId}/test-${Date.now()}.pdf`
const bytes = readFileSync(join(ROOT, 'seeds/fixtures/sample-delivery-note.pdf'))
const up = await sb.storage.from('delivery-notes').upload(path, bytes, { contentType: 'application/pdf', upsert: true })
if (up.error) { console.error('Upload failed:', up.error.message); process.exit(1) }
console.log('Uploaded', path)

const t0 = Date.now()
const { data, error } = await sb.functions.invoke('extract-delivery-pdf', { body: { project_id: projectId, pdf_path: path } })
console.log(`Extraction took ${((Date.now() - t0) / 1000).toFixed(1)}s`)
if (error) { console.error('Function error:', error.message); try { console.error(await error.context?.json?.()) } catch { /* ignore */ } process.exit(1) }

const e = data.extracted
console.log('\nHEADER:', { supplier: e.supplier, po_ref: e.po_ref, invoice_no: e.invoice_no, delivery_date: e.delivery_date, confidence: e.confidence })
console.log('\nLINES:')
for (const l of data.lines_with_matches) {
  console.log(`  ${l.matched ? '✓' : '⚠'} [${l.match_type || 'none'}] qty=${l.qty} ${l.unit || ''} | ${l.material_code || '-'} → ${l.catalog_code || 'UNMATCHED'} (${l.catalog_name || l.material_description})`)
}
const matched = data.lines_with_matches.filter((l) => l.matched).length
console.log(`\n${matched}/${data.lines_with_matches.length} lines matched.`)
