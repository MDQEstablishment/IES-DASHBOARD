import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Modal, Btn, Field } from './ui'
import { toast } from '../lib/toast'
import { num } from '../lib/format'
import { findSheet, parseSheet, diffRows, upsertBatches, fetchAllRows, normModel } from '../lib/tarshidImport'

// 9D-1 — "Import from workbook": upload the TARSHID Survey&Savings xlsx or the
// ESCO Survey Working File; parse client-side (SheetJS, dynamic import like the
// survey export); PREVIEW new/updated/unchanged/unmatched; CONFIRM before any
// write; UPSERT in batches by (equipment_type, model_no); never deletes.
const REG_FIELDS = ['make', 'compressor_type', 'size_category', 'tr', 't1_btu', 't1_w', 't1_eer', 't3_btu', 't3_w', 't3_eer', 'equivalent_seer', 'surveyed_unit_description', 'equivalent_ac_model_description']
const BASE_FIELDS = ['description', 'make', 't1_btu', 't1_w', 't1_eer', 't3_btu', 't3_w', 't3_eer', 'equivalent_seer', 'nameplate_ref', 'datasheet_ref']
const COST_FIELDS = ['unit_cost', 'labor_cost', 'saso_cert_ref', 'datasheet_ref']

const KINDS = {
  oldreg: { title: 'Old Model Registry', table: 'old_model_registry', fields: REG_FIELDS, sheets: ['oldreg'] },
  baseline: { title: 'Baseline Units', table: 'approved_baseline_units', fields: BASE_FIELDS, sheets: ['baseline'] },
  costs: { title: 'Catalog costs (AC + Lighting)', sheets: ['costsAc', 'costsLight'] },
}

export default function TarshidImportModal({ kind, onClose, onDone }) {
  const cfg = KINDS[kind]
  const [fileName, setFileName] = useState('')
  const [plan, setPlan] = useState(null)   // preview plan (per target)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const fileRef = useRef(null)

  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setFileName(file.name); setErr(''); setPlan(null); setResult(null)
    setBusy(true)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer())
      if (kind === 'costs') {
        const targets = []
        for (const [sheetKind, table, modelCol] of [['costsAc', 'ac_catalog', 'model'], ['costsLight', 'lighting_catalog', 'model']]) {
          const name = findSheet(wb, sheetKind)
          if (!name) continue
          const parsed = parseSheet(XLSX, wb, name, 'costs')
          if (parsed.error) { setErr(parsed.error); setBusy(false); return }
          const { rows: cat, error } = await fetchAllRows(table, 'id,model,description,unit_cost,labor_cost,saso_cert_ref,datasheet_ref')
          if (error) { setErr("Couldn't load the catalog — " + error.message); setBusy(false); return }
          const byModel = new Map(cat.filter((c) => c[modelCol]).map((c) => [normModel(c[modelCol]).toLowerCase(), c]))
          const byDesc = new Map(cat.filter((c) => c.description).map((c) => [normModel(c.description).toLowerCase(), c]))
          const updates = [], unchanged = [], unmatched = []
          for (const r of parsed.rows) {
            const hit = (r.model_no && byModel.get(normModel(r.model_no).toLowerCase()))
              || (r.description && byDesc.get(normModel(r.description).toLowerCase()))
            if (!hit) { unmatched.push(r); continue }
            const patch = {}
            COST_FIELDS.forEach((f) => { if (r[f] != null && r[f] !== hit[f]) patch[f] = r[f] })
            if (Object.keys(patch).length) updates.push({ id: hit.id, patch })
            else unchanged.push(r)
          }
          targets.push({ table, sheetName: name, updates, unchanged, unmatched, total: parsed.rows.length })
        }
        if (!targets.length) { setErr("No 'Aprvd Project Unit' or 'Light Selection' sheet found in this workbook."); setBusy(false); return }
        setPlan({ kind: 'costs', targets })
      } else {
        const name = findSheet(wb, cfg.sheets[0])
        if (!name) { setErr(`No ${cfg.title} sheet found — expected e.g. ${kind === 'oldreg' ? "'Old_Model_Registry' / 'Old Model Registry'" : "'Aprvd Baseline Unit' (or the misspelled variant)"}.`); setBusy(false); return }
        const parsed = parseSheet(XLSX, wb, name, kind)
        if (parsed.error) { setErr(parsed.error); setBusy(false); return }
        const { rows: existing, error } = await fetchAllRows(cfg.table)
        if (error) { setErr("Couldn't load existing rows — " + error.message); setBusy(false); return }
        const d = diffRows(existing, parsed.rows, cfg.fields)
        setPlan({ kind, table: cfg.table, sheetName: name, ...d, total: parsed.rows.length })
      }
    } catch (ex) {
      setErr('Could not read the workbook — ' + (ex?.message || ex))
    }
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const doImport = async () => {
    if (!plan) return
    setBusy(true)
    if (plan.kind === 'costs') {
      const out = []
      for (const t of plan.targets) {
        let ok = 0, fail = 0
        for (let i = 0; i < t.updates.length; i += 10) {
          const res = await Promise.all(t.updates.slice(i, i + 10).map((u) =>
            supabase.from(t.table).update(u.patch).eq('id', u.id).select('id')))
          res.forEach(({ data, error }) => { if (error || !data?.length) fail++; else ok++ })
        }
        out.push({ table: t.table, ok, fail, unmatched: t.unmatched.length, unchanged: t.unchanged.length })
      }
      setResult({ kind: 'costs', out })
      toast('Costs import finished')
    } else {
      const rows = [...plan.toInsert, ...plan.toUpdate]
      const { error, written } = await upsertBatches(plan.table, rows)
      if (error) {
        setErr(`Import stopped after ${num(written)} of ${num(rows.length)} rows — ${error.message}`)
        setBusy(false); return
      }
      setResult({ kind: plan.kind, inserted: plan.toInsert.length, updated: plan.toUpdate.length, unchanged: plan.unchanged.length })
      toast(`${cfg.title}: ${num(plan.toInsert.length)} new · ${num(plan.toUpdate.length)} updated`)
    }
    setBusy(false)
    onDone?.()
  }

  const Stat = ({ n, l, warn }) => (
    <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '8px 14px', minWidth: 92, textAlign: 'center' }}>
      <div lang="en" dir="ltr" style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: warn ? '#B45309' : 'var(--text)' }}>{num(n)}</div>
      <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{l}</div>
    </div>
  )

  return (
    <Modal open width={620} title={`Import from workbook · ${cfg.title}`} onClose={onClose}
      footer={<>
        <Btn onClick={onClose}>{result ? 'Close' : 'Cancel'}</Btn>
        {plan && !result && (
          <Btn variant="primary" disabled={busy || (plan.kind === 'costs' ? plan.targets.every((t) => !t.updates.length) : !plan.toInsert.length && !plan.toUpdate.length)}
            onClick={doImport}>{busy ? 'Importing…' : 'Confirm import'}</Btn>
        )}
      </>}>
      <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 12 }}>
        Upload the TARSHID "AC Survey &amp; Savings" workbook or the ESCO Survey Working File. Sheets are located by name (both known spellings), the header row is detected automatically, and nothing is written until you confirm. Existing rows are never deleted — this import only adds and updates.
      </div>
      <Field label="Workbook (.xlsx)">
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFile} style={{ display: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Btn icon="upload" disabled={busy} onClick={() => fileRef.current?.click()}>{busy && !plan ? 'Reading…' : fileName ? 'Change file' : 'Choose workbook'}</Btn>
          <span style={{ fontSize: 12.5, color: fileName ? 'var(--text)' : 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName || 'No file chosen'}</span>
        </div>
      </Field>

      {err && <div style={{ background: '#F9ECEA', border: '1px solid #EBCFC9', borderRadius: 6, padding: 10, fontSize: 12.5, color: '#96271E', marginTop: 6 }}>{err}</div>}

      {plan && !result && plan.kind !== 'costs' && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>Sheet <b style={{ color: 'var(--text)' }}>{plan.sheetName}</b> — {num(plan.total)} data rows parsed. Review, then confirm:</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Stat n={plan.toInsert.length} l="new" />
            <Stat n={plan.toUpdate.length} l="updated" />
            <Stat n={plan.unchanged.length} l="unchanged" />
          </div>
        </div>
      )}
      {plan && !result && plan.kind === 'costs' && plan.targets.map((t) => (
        <div key={t.table} style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>Sheet <b style={{ color: 'var(--text)' }}>{t.sheetName}</b> → {t.table === 'ac_catalog' ? 'AC & Package catalog' : 'Lighting catalog'} — {num(t.total)} rows:</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Stat n={t.updates.length} l="will update costs" />
            <Stat n={t.unchanged.length} l="unchanged" />
            <Stat n={t.unmatched.length} l="unmatched" warn={t.unmatched.length > 0} />
          </div>
          {t.unmatched.length > 0 && (
            <div style={{ fontSize: 11, color: '#96271E', marginTop: 6, maxHeight: 90, overflowY: 'auto' }}>
              Unmatched (no catalog item by model or description): {t.unmatched.slice(0, 8).map((u) => u.model_no || u.description).join(' · ')}{t.unmatched.length > 8 ? ` · +${num(t.unmatched.length - 8)} more` : ''}
            </div>
          )}
        </div>
      ))}

      {result && result.kind !== 'costs' && (
        <div style={{ background: '#E9F3EE', border: '1px solid #BFDFCF', borderRadius: 8, padding: 12, fontSize: 12.5, color: '#175A3E', marginTop: 10 }} lang="en" dir="ltr">
          Done — <b>{num(result.inserted)}</b> new, <b>{num(result.updated)}</b> updated, {num(result.unchanged)} unchanged.
        </div>
      )}
      {result && result.kind === 'costs' && result.out.map((o) => (
        <div key={o.table} style={{ background: '#E9F3EE', border: '1px solid #BFDFCF', borderRadius: 8, padding: 12, fontSize: 12.5, color: '#175A3E', marginTop: 10 }} lang="en" dir="ltr">
          {o.table === 'ac_catalog' ? 'AC & Package' : 'Lighting'}: <b>{num(o.ok)}</b> updated{o.fail ? <>, <b style={{ color: '#96271E' }}>{num(o.fail)}</b> failed</> : ''}, {num(o.unchanged)} unchanged, {num(o.unmatched)} unmatched.
        </div>
      ))}
    </Modal>
  )
}
