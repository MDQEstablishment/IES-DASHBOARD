import { useRef, useState } from 'react'
import { Modal, Btn } from './ui'
import Icon from './Icon'
import { supabase } from '../lib/supabase'
import { parseWorkbook } from '../lib/buildingImport'
import { toast } from '../lib/toast'

// Excel import for the building list.
//
// The rule this screen exists to keep: NOTHING IS SILENTLY DROPPED. Every row
// of the file comes back as accepted or held, with a reason in words the person
// who filled the sheet can act on. A count of "48 imported" from a 50-row file
// is the failure mode — the two missing rows are the only ones anybody cares
// about, so they are what this shows first.
export default function BuildingImportModal({ projectId, onClose, onDone }) {
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)   // { accepted[], held[], unknown[], skippedExample[] }

  const run = async (file) => {
    setError(''); setResult(null); setFileName(file.name); setBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const { rows, unknown, skippedExample } = parseWorkbook(buf)
      if (!rows.length) {
        setError('No data rows found in that file. The header row was read, but every row under it was empty.')
        setBusy(false); return
      }
      const { data, error: rpcErr } = await supabase.rpc('import_buildings', {
        p_project_id: projectId,
        p_rows: rows.map(({ name, lat, lng, notes }) => ({ name, lat, lng, notes })),
        p_source: 'import',
        p_file_name: file.name,
      })
      if (rpcErr) throw rpcErr

      // stitch the sheet's own row numbers back on, so a held row can be found
      const withSheetRow = (data || []).map((d) => ({ ...d, sheetRow: rows[d.row_index - 1]?._sheetRow ?? d.row_index }))
      setResult({
        accepted: withSheetRow.filter((d) => d.outcome === 'accepted'),
        held: withSheetRow.filter((d) => d.outcome === 'held'),
        unknown, skippedExample,
      })
      onDone?.()
    } catch (e) {
      setError(e.message || 'That file could not be read.')
    } finally {
      setBusy(false)
    }
  }

  const onPick = (e) => { const f = e.target.files?.[0]; if (f) run(f) }

  const total = result ? result.accepted.length + result.held.length : 0

  return (
    <Modal open width={720} title="Import buildings from Excel" onClose={onClose}
      footer={<Btn onClick={onClose}>{result ? 'Done' : 'Cancel'}</Btn>}>

      {!result && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 0, lineHeight: 1.6 }}>
            Choose the filled template. Every row comes back accepted or held with a reason —
            nothing is imported silently, and duplicates are never merged.
          </p>
          <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" onChange={onPick} style={{ display: 'none' }} />
          <Btn icon="upload" variant="primary" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Reading…' : 'Choose file'}
          </Btn>
          {fileName && <span style={{ marginLeft: 10, fontSize: 12.5, color: 'var(--text-3)' }}>{fileName}</span>}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 'var(--radius-m)', background: 'var(--bad-tint)', color: 'var(--bad)', fontSize: 13, lineHeight: 1.55 }}>
          {error}
        </div>
      )}

      {result && (
        <div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <Stat label="Rows read" value={total} />
            <Stat label="Imported" value={result.accepted.length} tone="good" />
            <Stat label="Held" value={result.held.length} tone={result.held.length ? 'bad' : undefined} />
          </div>

          {/* Held first, deliberately: they are the only rows needing a decision. */}
          {result.held.length > 0 && (
            <Section title={`Held — ${result.held.length} row${result.held.length === 1 ? '' : 's'} not imported`}>
              {result.held.map((h) => (
                <Line key={h.row_index} left={`Row ${h.sheetRow}`} right={h.reason} tone="bad" />
              ))}
            </Section>
          )}

          {result.accepted.length > 0 && (
            <Section title={`Imported — ${result.accepted.length}`}>
              {result.accepted.slice(0, 200).map((a) => (
                <Line key={a.row_index} left={a.code} right={a.reason || 'Added.'} tone={a.reason ? 'warn' : 'good'} />
              ))}
              {result.accepted.length > 200 && (
                <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '6px 2px' }}>
                  …and {result.accepted.length - 200} more. All {result.accepted.length} were imported;
                  this list is shortened for display only.
                </div>
              )}
            </Section>
          )}

          {result.skippedExample.length > 0 && (
            <Note>The template’s example row was still in the file (row {result.skippedExample.join(', ')}) and was skipped.</Note>
          )}
          {result.unknown.length > 0 && (
            <Note>Columns we did not recognise were ignored: {result.unknown.join(', ')}. Nothing was lost from the columns above.</Note>
          )}
        </div>
      )}
    </Modal>
  )
}

const Stat = ({ label, value, tone }) => (
  <div style={{ flex: '1 1 120px', background: 'var(--surface-2)', borderRadius: 'var(--radius-m)', padding: '10px 12px' }}>
    <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 800, color: tone === 'good' ? 'var(--good)' : tone === 'bad' ? 'var(--bad)' : 'var(--text)' }}>{value}</div>
    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{label}</div>
  </div>
)

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>{title}</div>
    <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-m)' }}>{children}</div>
  </div>
)

const Line = ({ left, right, tone }) => (
  <div style={{ display: 'flex', gap: 10, padding: '7px 10px', borderBottom: '1px solid var(--line-soft)', fontSize: 12.5 }}>
    <span style={{ fontFamily: 'var(--mono)', minWidth: 110, color: tone === 'bad' ? 'var(--bad)' : 'var(--text-2)' }}>{left}</span>
    <span style={{ color: tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--warn)' : 'var(--text-3)' }}>{right}</span>
  </div>
)

const Note = ({ children }) => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--text-3)', marginTop: 8 }}>
    <Icon name="info" size={14} /><span style={{ lineHeight: 1.5 }}>{children}</span>
  </div>
)
