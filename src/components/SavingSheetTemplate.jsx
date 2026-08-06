import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLiveQuery, bgInsert, bgUpdate, uploadToBucket, openSigned } from '../lib/db'
import { Btn, Empty } from './ui'
import FileDropZone from './FileDropZone'
import { toast } from '../lib/toast'
import { num, fmtDateTime } from '../lib/format'
import { BUCKETS } from '../lib/buckets'

// 9D-3 — versioned TARSHID workbook template. Generation always fills the
// ACTIVE version's file: the layout is never hardcoded, so a template revision
// from TARSHID is an upload, not a code change. Prior versions are kept.
const BUCKET = BUCKETS.SAVING_SHEET_TEMPLATES

export default function SavingSheetTemplate({ role }) {
  const canWrite = ['admin', 'pmo'].includes(role)
  const { rows, refetch } = useLiveQuery('saving_sheet_templates', (q) =>
    q.select('*, uploader:profiles!saving_sheet_templates_uploaded_by_fkey(full_name)').order('version', { ascending: false }))
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)

  const active = rows.find((r) => r.active)

  const upload = async () => {
    if (!file) return
    if (!/\.xlsx?$/i.test(file.name)) { toast('Upload the TARSHID workbook (.xlsx)', 'err'); return }
    setBusy(true)
    const version = (rows.reduce((a, r) => Math.max(a, r.version), 0) || 0) + 1
    const key = `templates/v${version}-${Date.now()}.xlsx`
    const { path, error: upErr } = await uploadToBucket(BUCKET, file, { key, maxBytes: 25 * 1024 * 1024 })
    if (upErr || !path) { setBusy(false); return }   // uploadToBucket toasts
    // previous versions stay in the table (history) but lose `active`
    for (const r of rows.filter((r) => r.active)) await bgUpdate('saving_sheet_templates', r.id, { active: false })
    const { error } = await bgInsert('saving_sheet_templates',
      { version, storage_path: path, file_name: file.name, active: true },
      { okMsg: `Template v${version} uploaded — generation will use it` })
    setBusy(false)
    if (!error) { setFile(null); refetch() }
  }

  const download = async (r) => {
    await openSigned(BUCKET, r.storage_path, 'template')
  }

  const activate = async (r) => {
    for (const x of rows.filter((x) => x.active && x.id !== r.id)) await bgUpdate('saving_sheet_templates', x.id, { active: false })
    const { error } = await bgUpdate('saving_sheet_templates', r.id, { active: true }, { okMsg: `v${r.version} is now the active template` })
    if (!error) refetch()
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16, overflow: 'hidden' }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Saving Sheet Template</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>
        The real TARSHID "AC Survey &amp; Savings" workbook. Generation fills the <b>active</b> version's input cells and leaves every formula and reference sheet untouched, so the file recomputes in Excel. Upload a new version whenever TARSHID revises the template — older versions are kept.{!canWrite && ' Uploading is limited to PMO and admins.'}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px', marginBottom: 14, background: active ? '#E9F3EE' : '#FAF3E3' }}>
        <span style={{ fontSize: 12.5, color: active ? '#175A3E' : '#854D0E' }}>
          {active ? <>Active template: <b>v{num(active.version)}</b> · {active.file_name || 'workbook.xlsx'} · uploaded {fmtDateTime(active.uploaded_at)}</>
            : <>No template uploaded yet — saving-sheet generation is disabled until one is.</>}
        </span>
        {active && <Btn style={{ padding: '5px 10px', fontSize: 11.5, marginLeft: 'auto' }} onClick={() => download(active)}>Download</Btn>}
      </div>

      {canWrite && (
        <div style={{ marginBottom: 14 }}>
          <FileDropZone label="Upload a new template version (.xlsx)" accept=".xlsx,.xls" maxSizeMb={25}
            onFiles={(f) => setFile(f)} helperText="The workbook is stored as-is; only input cells are written at generation time" />
          <Btn variant="primary" disabled={!file || busy} onClick={upload}>{busy ? 'Uploading…' : 'Upload template'}</Btn>
        </div>
      )}

      {rows.length === 0 ? <Empty icon="doc">No template versions yet.</Empty> : (
        <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 560 }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
            <th style={{ padding: '8px 7px', fontWeight: 600 }}>VERSION</th>
            <th style={{ padding: '8px 7px', fontWeight: 600 }}>FILE</th>
            <th style={{ padding: '8px 7px', fontWeight: 600 }}>UPLOADED</th>
            <th style={{ padding: '8px 7px', fontWeight: 600 }}>BY</th>
            <th style={{ padding: '8px 7px', fontWeight: 600, textAlign: 'right' }}>ACTIONS</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--line)', opacity: r.active ? 1 : 0.65 }}>
                <td lang="en" dir="ltr" style={{ padding: '8px 7px', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                  v{num(r.version)}{r.active && <span style={{ marginLeft: 6, fontFamily: 'var(--mono)', fontSize: 8.5, fontWeight: 700, padding: '1px 6px', borderRadius: 5, color: '#1D6A49', background: '#E9F3EE' }}>ACTIVE</span>}
                </td>
                <td style={{ padding: '8px 7px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.file_name || ''}>{r.file_name || '—'}</td>
                <td style={{ padding: '8px 7px', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDateTime(r.uploaded_at)}</td>
                <td style={{ padding: '8px 7px', whiteSpace: 'nowrap' }}>{r.uploader?.full_name || '—'}</td>
                <td style={{ padding: '8px 7px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="ies-hover" onClick={() => download(r)} style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', padding: '4px 8px', borderRadius: 6 }}>Download</button>
                  {canWrite && !r.active && <button className="ies-hover" onClick={() => activate(r)} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', padding: '4px 8px', borderRadius: 6 }}>Make active</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  )
}
