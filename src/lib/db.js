import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabase'
import { toast } from './toast'

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

  const refetch = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    const base = supabase.from(table)
    const q = buildRef.current ? buildRef.current(base) : base.select('*')
    Promise.resolve(q).then(({ data, error }) => {
      if (!alive) return
      if (error) setState({ rows: [], loading: false, error })
      else setState({ rows: data || [], loading: false, error: null })
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

// One-shot query helper (no realtime) for detail views.
export async function fetchOne(table, build) {
  const base = supabase.from(table)
  const q = build ? build(base) : base.select('*')
  const { data, error } = await q
  if (error) { console.error('[IES] fetchOne', table, error); return null }
  return data
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
  if (opts.okMsg) toast(opts.okMsg)
  return { data }
}

export async function bgDelete(table, id, opts = {}) {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) {
    toast(opts.errMsg || `Couldn't delete — ${error.message}`, 'err')
    opts.rollback?.(error)
    return { error }
  }
  if (opts.okMsg) toast(opts.okMsg)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Photo upload to the private `images` bucket. 500 KB cap + image/* enforced
// client-side (mirrors the bucket policy). Namespaced by user + date.
// ---------------------------------------------------------------------------
export const MAX_IMAGE_BYTES = 512000

export async function uploadPhoto(file, userId) {
  if (!file.type.startsWith('image/')) { toast('Only image files are allowed', 'err'); return { error: 'mime' } }
  if (file.size > MAX_IMAGE_BYTES) { toast('Image exceeds the 500 KB limit', 'err'); return { error: 'size' } }
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const date = new Date().toISOString().slice(0, 10)
  const path = `${userId}/${date}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from('images').upload(path, file, { contentType: file.type, upsert: false })
  if (error) { toast('Upload failed — ' + error.message, 'err'); return { error } }
  return { path }
}

export async function signedUrl(path, expires = 3600) {
  if (!path) return null
  const { data, error } = await supabase.storage.from('images').createSignedUrl(path, expires)
  if (error) return null
  return data?.signedUrl || null
}

// ---------------------------------------------------------------------------
// Generic bucket helpers (Phase 4 — project-docs / building-photos /
// project-templates). uploadToBucket enforces an optional client-side size cap
// (mirror of the bucket policy) and namespaces objects by user + date.
// ---------------------------------------------------------------------------
export async function uploadToBucket(bucket, file, { userId = 'anon', maxBytes, prefix = '', label = '' } = {}) {
  if (maxBytes && file.size > maxBytes) {
    toast(`File exceeds the ${Math.round(maxBytes / 1024)} KB limit`, 'err')
    return { error: 'size' }
  }
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
  const date = new Date().toISOString().slice(0, 10)
  // optional label (e.g. the reference number) encoded into the path for traceability
  const stem = label ? label.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 60) + '-' : ''
  const path = `${prefix ? prefix + '/' : ''}${userId}/${date}/${stem}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (error) { toast('Upload failed — ' + error.message, 'err'); return { error } }
  return { path, size: file.size, mime: file.type }
}

export async function signedUrlFor(bucket, path, expires = 3600) {
  if (!path) return null
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expires)
  if (error) return null
  return data?.signedUrl || null
}
