import { useRef, useState } from 'react'
import { Modal, Field, inputStyle, Btn } from './ui'
import Icon from './Icon'
import { supabase } from '../lib/supabase'
import { parseWorkbook } from '../lib/buildingImport'
import { downloadTemplate } from '../lib/buildingTemplateLink'
import { toast } from '../lib/toast'

// ONE panel, ONE primary action.
//
// This replaced three sibling buttons in the project header (Add building,
// Download template, Import Excel) and, in the first design, a One Building /
// From Excel segmented control inside the dialog. The owner rejected the
// segment, and he was right: a toggle asks the person to declare which mode
// they are in before they have done anything, and it left two half-forms
// stacked on screen competing for the same primary button.
//
// What replaced it is a single panel where the PRIMARY ACTION FOLLOWS THE
// EVIDENCE. Type a name and the button says Add Building. Choose a file and the
// file takes over — the fields recede (dimmed, not hidden, so it is visible
// what the file replaced) and the button becomes Import N Buildings. Remove the
// file and the panel hands itself back. There is never a moment with two
// enabled primaries, and nothing has to be chosen up front.
//
// Both routes call import_buildings(), so a typed building and an imported one
// are the same row with the same code, defaults and audit entry.
export default function AddBuildingsModal({ projectId, onClose, onDone }) {
  const fileRef = useRef(null)
  const [f, setF] = useState({ name: '', lat: '', lng: '', notes: '' })
  const [file, setFile] = useState(null)      // { name, rows, unknown, skippedExample }
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  const fileMode = !!file
  const finished = !!result

  const onPick = async (e) => {
    const picked = e.target.files?.[0]
    e.target.value = ''                        // re-picking the same file must work
    if (!picked) return
    setError(''); setResult(null)
    try {
      const { rows, unknown, skippedExample } = parseWorkbook(await picked.arrayBuffer())
      if (!rows.length) {
        setError('No data rows found in that file. The header row was read, but every row under it was empty.')
        return
      }
      setFile({ name: picked.name, rows, unknown, skippedExample })
    } catch (err) {
      setError(err.message || 'That file could not be read.')
    }
  }

  const clearFile = () => { setFile(null); setResult(null); setError('') }

  const submit = async () => {
    if (finished) { onClose(); return }
    setBusy(true); setError('')
    const rows = fileMode
      ? file.rows.map(({ name, lat, lng, notes }) => ({ name, lat, lng, notes }))
      : [{ name: f.name, lat: f.lat, lng: f.lng, notes: f.notes }]
    const { data, error: rpcErr } = await supabase.rpc('import_buildings', {
      p_project_id: projectId,
      p_rows: rows,
      p_source: fileMode ? 'import' : 'app',
      p_file_name: fileMode ? file.name : null,
    })
    setBusy(false)
    if (rpcErr) { setError(rpcErr.message || 'The buildings could not be added.'); return }
    onDone?.()

    if (!fileMode) {
      const row = data?.[0]
      if (row?.outcome !== 'accepted') { setError(row?.reason || 'The building was not added.'); return }
      toast(`Building added · ${row.code}`)
      onClose()
      return
    }
    const withRow = (data || []).map((d) => ({ ...d, sheetRow: file.rows[d.row_index - 1]?._sheetRow ?? d.row_index }))
    setResult({
      accepted: withRow.filter((d) => d.outcome === 'accepted'),
      held: withRow.filter((d) => d.outcome === 'held'),
    })
  }

  const primaryLabel = finished ? 'Done'
    : fileMode ? `Import ${file.rows.length} Building${file.rows.length === 1 ? '' : 's'}`
    : 'Add Building'
  const primaryOff = busy || (!fileMode && !f.name.trim())

  return (
    <Modal open width={560} title="Add Buildings" onClose={onClose}
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={submit} disabled={primaryOff}>{busy ? 'Working…' : primaryLabel}</Btn>
      </>}>

      {/* The manual half recedes rather than disappearing when a file takes
          over, so it stays visible what the file is standing in for. */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 12,
        opacity: fileMode ? 0.32 : 1, filter: fileMode ? 'saturate(0.4)' : 'none',
        pointerEvents: fileMode ? 'none' : 'auto', transition: 'opacity .22s ease, filter .22s ease',
      }}>
        <Field label="Building Name">
          <input style={inputStyle} value={f.name} disabled={fileMode}
            onChange={(e) => set('name', e.target.value)} placeholder="Name exactly as supplied" />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
          <Field label="Latitude">
            <input lang="en" style={inputStyle} value={f.lat} disabled={fileMode}
              onChange={(e) => set('lat', e.target.value)} placeholder={'24.7136 or 24°42\'49"N'} />
          </Field>
          <Field label="Longitude">
            <input lang="en" style={inputStyle} value={f.lng} disabled={fileMode}
              onChange={(e) => set('lng', e.target.value)} placeholder={'46.6753 or 46°40\'31"E'} />
          </Field>
        </div>
        <Field label="Notes">
          <input style={inputStyle} value={f.notes} disabled={fileMode}
            onChange={(e) => set('notes', e.target.value)} placeholder="Anything from the handover list" />
        </Field>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 13, margin: '14px 0', opacity: fileMode ? 0.4 : 1 }}>
        <hr style={{ flex: 1, border: 0, borderTop: '1px solid var(--line)' }} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.14em', color: 'var(--text-faint)' }}>OR</span>
        <hr style={{ flex: 1, border: 0, borderTop: '1px solid var(--line)' }} />
      </div>

      {/* Recessed utility rail — quieter than the form above it, never a rival */}
      <div style={{
        background: fileMode ? 'var(--accent-tint)' : 'var(--raised)',
        border: `1px solid ${fileMode ? 'rgba(160,118,43,0.34)' : 'var(--line-soft)'}`,
        borderRadius: 'var(--radius-m)', padding: 11, display: 'flex', gap: 9,
        transition: 'background .22s ease, border-color .22s ease',
      }}>
        <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" onChange={onPick} style={{ display: 'none' }} />
        {!fileMode ? (
          <>
            <Btn icon="download" style={{ flex: 1, background: 'transparent' }} onClick={downloadTemplate}>Download Template</Btn>
            <Btn icon="upload" style={{ flex: 1, background: 'transparent' }} onClick={() => fileRef.current?.click()}>Choose File…</Btn>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '2px 2px 2px 4px' }}>
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
              {file.rows.length} row{file.rows.length === 1 ? '' : 's'}
            </span>
            {!finished && (
              <button aria-label="Remove file" onClick={clearFile}
                style={{ marginLeft: 'auto', width: 26, height: 26, borderRadius: 'var(--radius-s)', color: 'var(--text-3)', fontSize: 15, lineHeight: 1, flex: 'none' }}>×</button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 'var(--radius-m)', background: 'var(--bad-tint)', color: 'var(--bad)', fontSize: 13, lineHeight: 1.55 }}>
          {error}
        </div>
      )}

      {result && <ImportReport result={result} file={file} />}
    </Modal>
  )
}

// Held rows first, on purpose: "48 of 50 imported" hides the only two rows
// anyone needs to act on.
function ImportReport({ result, file }) {
  const total = result.accepted.length + result.held.length
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', gap: 9 }}>
        <Stat label="Rows read" value={total} />
        <Stat label="Imported" value={result.accepted.length} tone="good" />
        <Stat label="Held" value={result.held.length} tone={result.held.length ? 'bad' : undefined} />
      </div>

      {result.held.length > 0 && (
        <Section title={`Held — ${result.held.length} row${result.held.length === 1 ? '' : 's'} not imported`}>
          {result.held.map((h) => <Line key={h.row_index} left={`Row ${h.sheetRow}`} right={h.reason} tone="bad" />)}
        </Section>
      )}

      {result.accepted.length > 0 && (
        <Section title={`Imported — ${result.accepted.length}`}>
          {result.accepted.slice(0, 200).map((a) => (
            <Line key={a.row_index} left={a.code} right={a.reason || 'Added.'} tone={a.reason ? 'warn' : 'good'} />
          ))}
          {result.accepted.length > 200 && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '6px 10px' }}>
              …and {result.accepted.length - 200} more. All {result.accepted.length} were imported; this list is shortened for display only.
            </div>
          )}
        </Section>
      )}

      {file.skippedExample.length > 0 && (
        <Note>The template’s example row was still in the file (row {file.skippedExample.join(', ')}) and was skipped.</Note>
      )}
      {file.unknown.length > 0 && (
        <Note>Columns we did not recognise were ignored: {file.unknown.join(', ')}.</Note>
      )}
    </div>
  )
}

const Stat = ({ label, value, tone }) => (
  <div style={{ flex: 1, background: 'var(--raised)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-m)', padding: '10px 12px' }}>
    <div style={{ fontFamily: 'var(--mono)', fontSize: 21, fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', color: tone === 'good' ? 'var(--good)' : tone === 'bad' ? 'var(--bad)' : 'var(--text)' }}>{value}</div>
    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{label}</div>
  </div>
)

const Section = ({ title, children }) => (
  <div style={{ marginTop: 13 }}>
    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>{title}</div>
    <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-m)' }}>{children}</div>
  </div>
)

const Line = ({ left, right, tone }) => (
  <div style={{ display: 'flex', gap: 10, padding: '8px 11px', borderBottom: '1px solid var(--line-soft)', fontSize: 12.5, alignItems: 'baseline' }}>
    <span style={{ fontFamily: 'var(--mono)', minWidth: 104, flex: 'none', fontSize: 11.5, color: tone === 'bad' ? 'var(--bad)' : 'var(--text-2)' }}>{left}</span>
    <span style={{ color: tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--warn)' : 'var(--text-3)' }}>{right}</span>
  </div>
)

const Note = ({ children }) => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--text-3)', marginTop: 8 }}>
    <Icon name="info" size={14} /><span style={{ lineHeight: 1.5 }}>{children}</span>
  </div>
)
