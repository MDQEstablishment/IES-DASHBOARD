import { useState, useEffect, useRef } from 'react'
import { PageHead, Card, Field, Btn, Pill, Empty, Loading } from '../components/ui'
import Icon from '../components/Icon'
import { useAuth, Can } from '../rbac'
import { useLiveQuery, bgInsert, uploadPhoto } from '../lib/db'
import { supabase } from '../lib/supabase'
import { CAN_INSTALL } from '../lib/constants'
import { fmtShort } from '../lib/format'

const DRAFT_KEY = 'ies.draft.daily'
const today = () => new Date().toISOString().slice(0, 10)

export default function DailyProgress() {
  const { user, profile, role } = useAuth()
  const { rows: buildings } = useLiveQuery('buildings', (q) => q.select('id,code,name,project_id').order('code'))

  const [bid, setBid] = useState('')
  const [scopeId, setScopeId] = useState('')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [scopes, setScopes] = useState([])
  const [photoPath, setPhotoPath] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef(null)

  // today's entries by this user
  const { rows: todays, loading } = useLiveQuery('install_log',
    (q) => q.select('id,qty,note,qa_status,created_at,building:buildings(code,name),scope:building_item_scope(sub_type)')
      .eq('installed_by_id', user.id).eq('entry_date', today()).order('created_at', { ascending: false }))

  // restore draft once
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
      if (d) { setBid(d.bid || ''); setScopeId(d.scopeId || ''); setQty(d.qty || ''); setNote(d.note || '') }
    } catch { /* ignore */ }
  }, [])

  // load scopes for selected building
  useEffect(() => {
    if (!bid) { setScopes([]); return }
    supabase.from('building_item_scope')
      .select('id,sub_type,material_code,planned_qty,project_esm:project_esms(esm:esms(code,name))')
      .eq('building_id', bid).order('sub_type')
      .then(({ data }) => setScopes(data || []))
  }, [bid])

  // autosave draft every 2s while typing
  useEffect(() => {
    setSaved(false)
    const t = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ bid, scopeId, qty, note }))
      setSaved(true)
    }, 2000)
    return () => clearTimeout(t)
  }, [bid, scopeId, qty, note])

  const onPhoto = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true)
    const { path } = await uploadPhoto(f, user.id)
    setUploading(false)
    if (path) setPhotoPath(path)
    if (fileRef.current) fileRef.current.value = ''
  }

  const submit = async () => {
    if (!bid || !scopeId || !qty || Number(qty) < 1) return
    setSubmitting(true)
    const { error } = await bgInsert('install_log', {
      entry_date: today(), building_id: bid, scope_id: scopeId, qty: Number(qty),
      source: 'quick_entry', installed_by_id: user.id, note: note || null,
      photos: photoPath ? [photoPath] : [],
    }, { okMsg: 'Logged ✓' })
    setSubmitting(false)
    if (!error) {
      setScopeId(''); setQty(''); setNote(''); setPhotoPath(null)
      localStorage.removeItem(DRAFT_KEY); setSaved(false)
    }
  }

  const sel = scopes.find((s) => s.id === scopeId)

  return (
    <>
      <PageHead kicker="Field · log today's work" title="Daily Progress"
        sub={`${profile?.full_name} · ${today()} · quick install entry`}
        actions={saved ? <span className="draft-flag flex center gap-1"><Icon name="Check" size={12} /> draft saved</span> : null} />

      <div className="pad-grid">
        <Can allow={CAN_INSTALL} fallback={
          <Card title="Log today's work">
            <Empty icon="ClipboardList">Daily logging is for field roles (engineers & managers). You can review today's site activity on the right.</Empty>
          </Card>
        }>
          <Card title="Log today's work" meta="quick entry">
            <Field label="Building">
              <select className="select" value={bid} onChange={(e) => { setBid(e.target.value); setScopeId('') }}>
                <option value="">Select a building…</option>
                {buildings.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
              </select>
            </Field>
            <Field label="Scope item (ESM)">
              <select className="select" value={scopeId} onChange={(e) => setScopeId(e.target.value)} disabled={!bid}>
                <option value="">{bid ? 'Select scope item…' : 'Pick a building first'}</option>
                {scopes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.project_esm?.esm?.code} · {s.sub_type} ({s.planned_qty} planned)
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex gap-3">
              <div className="grow"><Field label="Quantity installed">
                <input className="input num" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)}
                  placeholder={sel ? `of ${sel.planned_qty}` : '0'} />
              </Field></div>
              <div style={{ width: 140 }}><Field label="Unit">
                <input className="input" value={sel ? (sel.material_code || '') : ''} readOnly placeholder="—" />
              </Field></div>
            </div>
            <Field label="Note (optional)">
              <textarea className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth recording…" />
            </Field>
            <div className="flex center between mt-2">
              <div className="flex center gap-2">
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
                <Btn icon="Camera" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? 'Uploading…' : photoPath ? 'Photo attached' : 'Add photo'}
                </Btn>
                {photoPath && <span className="pill pill-green">1 photo</span>}
              </div>
              <Btn variant="primary" icon="Check" onClick={submit} disabled={submitting || !bid || !scopeId || !qty}>
                {submitting ? 'Saving…' : 'Log entry'}
              </Btn>
            </div>
            <div className="draft-flag mt-3">Saved to your install log · awaiting QA approval · 500 KB photo limit.</div>
          </Card>
        </Can>

        <Card title="Today's entries" meta={`${todays.length} logged`}>
          {loading ? <Loading /> : todays.length === 0 ? <Empty icon="ClipboardList">No entries logged today yet.</Empty> : (
            <div className="col gap-2">
              {todays.map((t) => (
                <div key={t.id} className="flex center between" style={{ padding: '8px 10px', border: '1px solid var(--border-soft)', borderRadius: 6 }}>
                  <div className="grow truncate">
                    <div style={{ fontWeight: 600, fontSize: 12.5 }} className="truncate">{t.building?.code} · {t.scope?.sub_type || 'scope'}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{t.note || 'No note'} · {fmtShort(t.created_at)}</div>
                  </div>
                  <div className="flex center gap-2">
                    <span className="num" style={{ fontWeight: 600 }}>{t.qty}</span>
                    <Pill status={t.qa_status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
