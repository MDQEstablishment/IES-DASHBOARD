import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabase'
import { toast } from './toast'
import { BUCKETS } from './buckets'

// ---------------------------------------------------------------------------
// useLiveQuery: fetch a table + auto-refetch on any realtime change to it.
// `build` receives the base query: (from) => from.select('...').order('...').
// `deps` re-runs the fetch when filter inputs change.
// ---------------------------------------------------------------------------
export function useLiveQuery(table, build, deps = []) {
  const [state, setState] = useState({ rows: [], loading: true, error: null })
  const [tick, setTick] = useState(0)
  const buildRef = useRef(build)
  buildRef.current = build
  const lastErrRef = useRef(null)

  const refetch = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    const base = supabase.from(table)
    const q = buildRef.current ? buildRef.current(base) : base.select('*')
    Promise.resolve(q).then(({ data, error }) => {
      if (!alive) return
      if (error) {
        // Surface load failures instead of rendering a false empty state
        // (RLS denials / bad embeds looked identical to "no data"). Toast only
        // when the error CHANGES so realtime-triggered refetches don't spam.
        console.error('[IES] useLiveQuery', table, error)
        if (lastErrRef.current !== error.message) {
          lastErrRef.current = error.message
          toast(`Couldn't load ${table.replace(/_/g, ' ')} — ${error.message}`, 'err')
        }
        setState({ rows: [], loading: false, error })
      } else {
        lastErrRef.current = null
        setState({ rows: data || [], loading: false, error: null })
      }
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, tick, ...deps])

  // realtime: any insert/update/delete on the table triggers a refetch
  useEffect(() => {
    const ch = supabase
      .channel(`rt:${table}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => setTick((t) => t + 1))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [table])

  return { ...state, refetch }
}

// ---------------------------------------------------------------------------
// Background write helpers — optimistic by convention: the caller mutates local
// state first and passes a `rollback` to restore it if the server rejects.
// Errors surface as a toast; success is silent unless `okMsg` is given.
// ---------------------------------------------------------------------------
export async function bgInsert(table, values, opts = {}) {
  const { data, error } = await supabase.from(table).insert(values).select()
  if (error) {
    toast(opts.errMsg || `Couldn't save — ${error.message}`, 'err')
    opts.rollback?.(error)
    return { error }
  }
  if (opts.okMsg) toast(opts.okMsg)
  return { data }
}

export async function bgUpdate(table, id, patch, opts = {}) {
  const { data, error } = await supabase.from(table).update(patch).eq('id', id).select()
  if (error) {
    toast(opts.errMsg || `Couldn't update — ${error.message}`, 'err')
    opts.rollback?.(error)
    return { error }
  }
  // RLS can match 0 rows and return no error — a silent no-op, not success.
  // Callers used to check data.length themselves (only 2 of ~20 did); now the
  // no-op is surfaced here so a denied write never shows a success toast.
  if (!data || data.length === 0) {
    const err = { message: 'no rows updated (permission or missing row)', code: 'rls-noop' }
    console.warn('[IES] bgUpdate 0 rows', table, id)
    toast(opts.errMsg || "Change didn't persist — you may not have permission", 'err')
    opts.rollback?.(err)
    return { data, error: err }
  }
  if (opts.okMsg) toast(opts.okMsg)
  return { data }
}

export async function bgDelete(table, id, opts = {}) {
  const { data, error } = await supabase.from(table).delete().eq('id', id).select()
  if (error) {
    toast(opts.errMsg || `Couldn't delete — ${error.message}`, 'err')
    opts.rollback?.(error)
    return { error }
  }
  // Same silent-no-op guard as bgUpdate (RLS matched nothing).
  if (!data || data.length === 0) {
    const err = { message: 'no rows deleted (permission or missing row)', code: 'rls-noop' }
    console.warn('[IES] bgDelete 0 rows', table, id)
    toast(opts.errMsg || "Delete didn't persist — you may not have permission", 'err')
    opts.rollback?.(err)
    return { error: err }
  }
  if (opts.okMsg) toast(opts.okMsg)
  return { ok: true }
}

export async function signedUrl(path, expires = 3600) {
  if (!path) return null
  const { data, error } = await supabase.storage.from(BUCKETS.IMAGES).createSignedUrl(path, expires)
  if (error) return null
  return data?.signedUrl || null
}

// ---------------------------------------------------------------------------
// Generic bucket helpers (Phase 4 — project-docs / building-photos /
// project-templates). uploadToBucket enforces an optional client-side size cap
// (mirror of the bucket policy) and namespaces objects by user + date.
// ---------------------------------------------------------------------------
export async function uploadToBucket(bucket, file, { userId = 'anon', maxBytes, prefix = '', label = '', key = '' } = {}) {
  if (maxBytes && file.size > maxBytes) {
    toast(`File exceeds the ${Math.round(maxBytes / 1024)} KB limit`, 'err')
    return { error: 'size' }
  }
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
  const date = new Date().toISOString().slice(0, 10)
  // `key` = an explicit, deterministic path (e.g. {project}/{kind}/{ref}.pdf) — no
  // random suffix; otherwise fall back to the dated/random path. `label` (a ref no)
  // is encoded into the fallback path for traceability.
  const stem = label ? label.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 60) + '-' : ''
  const path = key || `${prefix ? prefix + '/' : ''}${userId}/${date}/${stem}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type || undefined, upsert: !!key })
  if (error) { toast('Upload failed — ' + error.message, 'err'); return { error } }
  return { path, size: file.size, mime: file.type }
}

export async function signedUrlFor(bucket, path, expires = 3600) {
  if (!path) return null
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expires)
  if (error) return null
  return data?.signedUrl || null
}

// 9E — open a storage object in a new tab. This two-liner had drifted into
// nine copies (two of which failed silently, one bypassing signedUrlFor).
export async function openSigned(bucket, path, label = 'file') {
  const url = await signedUrlFor(bucket, path, 3600)
  if (url) window.open(url, '_blank', 'noopener')
  else toast(`Couldn't open the ${label}`, 'err')
}

// 9E — trigger a client-side file download. Four copies existed with four
// different URL-revoke strategies; remove-then-revoke is the safe order.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}
