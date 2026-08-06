import { useState } from 'react'
import { useLiveQuery, bgInsert, bgUpdate, uploadToBucket, openSigned } from '../lib/db'
import { Btn, Empty } from './ui'
import FileDropZone from './FileDropZone'
import { toast } from '../lib/toast'
import { num, fmtDateTime } from '../lib/format'
import { BUCKETS } from '../lib/buckets'

// 9F — versioned progress-report template. The owner designed the workbook
// (branded header, KPI + ESM cards, column and line charts, 395 formulas); the
// generator only writes input cells into the ACTIVE version, so the design is
// owned in Excel and never re-implemented in styling code. Prior versions kept.
const BUCKET = BUCKETS.REPORT_TEMPLATES

export default function ReportTemplate({ role }) {
  const canWrite = ['admin', 'pmo'].includes(role)
  const { rows, refetch } = useLiveQuery('report_templates', (q) =>
    q.select('*, uploader:profiles!report_templates_uploaded_by_fkey(full_name)').order('version', { ascending: false }))
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)

  const active = rows.find((r) => r.active)

  const upload = async () => {
    if (!file) return
    if (!/\.xlsx?$/i.test(file.name)) { toast('Upload the report workbook (.xlsx)', 'err'); return }
    setBusy(true)
    const version = (rows.reduce((a, r) => Math.max(a, r.version), 0) || 0) + 1
    const key = `templates/v${version}-${Date.now()}.xlsx`
    const { path, error: upErr } = await uploadToBucket(BUCKET, file, { key, maxBytes: 25 * 1024 * 1024 })
    if (upErr || !path) { setBusy(false); return }   // uploadToBucket toasts
    for (const r of rows.filter((r) => r.active)) await bgUpdate('report_templates', r.id, { active: false })
    const { error } = await bgInsert('report_templates',
      { version, storage_path: path, file_name: file.name, active: true },
      { okMsg: `Report template v${version} uploaded — generation will use it` })
    setBusy(false)
    if (!error) { setFile(null); refetch() }
  }

  const activate = async (r) => {
    for (const x of rows.filter((x) => x.active && x.id !== r.id)) await bgUpdate('report_templates', x.id, { active: false })
    const { error } = await bgUpdate('report_templates', r.id, { active: true }, { okMsg: `v${r.version} is now the active template` })
    if (!error) refetch()
  }

  return (
    <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16, overflow: 'hidden' }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Progress Report Template</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>
        The branded Excel progress report sent to the client. Generation on the Reports page fills the <b>active</b> version's input cells and leaves every formula, chart, colour and image untouched, so the workbook recomputes in Excel exactly as designed. Upload a new version to change the design — no code change needed.{!canWrite && ' Uploading is limited to PMO and admins.'}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', border: '1px solid var(--line)', borderRadius: 'var(--radius-s)', padding: '9px 12px', marginBottom: 14, background: active ? 'var(--ok-bg)' : 'var(--warn-bg)' }}>
        <span style={{ fontSize: 12.5, color: active ? 'var(--ok-deep)' : 'var(--warn-deep)' }}>
          {active ? <>Active template: <b>v{num(active.version)}</b> · {active.file_name || 'report.xlsx'} · uploaded {fmtDateTime(active.uploaded_at)}</>
            : <>No template uploaded yet — report generation is disabled until one is.</>}
        </span>
        {active && <Btn style={{ padding: '5px 10px', fontSize: 11.5, marginLeft: 'auto' }} onClick={() => openSigned(BUCKET, active.storage_path, 'template')}>Download</Btn>}
      </div>

      {canWrite && (
        <div style={{ marginBottom: 14 }}>
          <FileDropZone label="Upload a new template version (.xlsx)" accept=".xlsx,.xls" maxSizeMb={25}
            onFiles={(f) => setFile(f)} helperText="Stored as-is; only input cells are written at generation time" />
          <Btn variant="primary" disabled={!file || busy} onClick={upload}>{busy ? 'Uploading…' : 'Upload template'}</Btn>
        </div>
      )}

      {rows.length === 0 ? <Empty icon="doc">No template versions yet.</Empty> : (
        <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 560 }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
            <th style={{ padding: '8px 7px', fontWeight: 600 }}>Version</th>
            <th style={{ padding: '8px 7px', fontWeight: 600 }}>FILE</th>
            <th style={{ padding: '8px 7px', fontWeight: 600 }}>Uploaded</th>
            <th style={{ padding: '8px 7px', fontWeight: 600 }}>BY</th>
            <th style={{ padding: '8px 7px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--line)', opacity: r.active ? 1 : 0.65 }}>
                <td lang="en" dir="ltr" style={{ padding: '8px 7px', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                  v{num(r.version)}{r.active && <span style={{ marginLeft: 6, fontFamily: 'var(--mono)', fontSize: 8.5, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-s)', color: 'var(--ok-deep)', background: 'var(--ok-bg)' }}>Active</span>}
                </td>
                <td style={{ padding: '8px 7px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.file_name || ''}>{r.file_name || '—'}</td>
                <td style={{ padding: '8px 7px', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDateTime(r.uploaded_at)}</td>
                <td style={{ padding: '8px 7px', whiteSpace: 'nowrap' }}>{r.uploader?.full_name || '—'}</td>
                <td style={{ padding: '8px 7px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="ies-hover" onClick={() => openSigned(BUCKET, r.storage_path, 'template')} style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', padding: '4px 8px', borderRadius: 'var(--radius-s)' }}>Download</button>
                  {canWrite && !r.active && <button className="ies-hover" onClick={() => activate(r)} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', padding: '4px 8px', borderRadius: 'var(--radius-s)' }}>Make active</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  )
}
