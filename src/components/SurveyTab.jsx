import { useState, useMemo } from 'react'
import { useAuth, can } from '../rbac'
import { useLiveQuery } from '../lib/db'
import { Btn, Loading, Empty } from './ui'
import { toast } from '../lib/toast'
import { num, fmtDateTime, localToday, localDayKey } from '../lib/format'
import { CAN_SURVEY, SURVEY_CATEGORIES } from '../lib/constants'
import { exportSurveyXlsx } from '../lib/surveyExport'
import SurveyDailyLog from './survey/DailyLog'
import SurveyEntriesTable from './survey/EntriesTable'
import SurveyEntryForm from './survey/EntryForm'

// 9B — the survey DAILY LOG. Two field teams log OLD equipment straight into the
// project; entries merge live (realtime) and are fully attributed.
export default function SurveyTab({ project, buildings }) {
  const { role, user } = useAuth()
  const canWrite = can(role, CAN_SURVEY)
  const canManageAll = ['pmo', 'admin'].includes(role) || (role === 'projm' && project.pm_id === user?.id)
  const [view, setView] = useState('log')     // 'log' | 'table'
  const [editing, setEditing] = useState(null) // null | {} (new) | row
  const [exporting, setExporting] = useState(false)

  // FK-hinted embeds: survey_entries has TWO FKs to profiles (created_by, updated_by)
  // and one to buildings — hint them so PostgREST doesn't 300 on ambiguity.
  const { rows: entries, loading } = useLiveQuery('survey_entries', (q) =>
    q.select('*, building:buildings!survey_entries_building_id_fkey(code,name), author:profiles!survey_entries_created_by_fkey(full_name), editor:profiles!survey_entries_updated_by_fkey(full_name)')
      .eq('project_id', project.id).order('created_at', { ascending: false }), [project.id])

  const stats = useMemo(() => {
    const surveyedB = new Set(entries.map((e) => e.building_id)).size
    const cats = {}; let today = 0
    entries.forEach((e) => { cats[e.category] = (cats[e.category] || 0) + (e.qty || 0); if (localDayKey(e.created_at) === localToday()) today++ })
    const last = entries[0]?.created_at
    return { surveyedB, cats, today, last, total: entries.length }
  }, [entries])

  const doExport = async () => {
    if (entries.length === 0) { toast('Nothing to export', 'err'); return }
    setExporting(true)
    try { await exportSurveyXlsx(entries, { projectName: project.name, projectCode: project.code }) }
    catch (e) { toast('Export failed — ' + (e?.message || ''), 'err') }
    setExporting(false)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
      {/* summary strip */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <Stat label="BUILDINGS SURVEYED" value={`${num(stats.surveyedB)} / ${num(buildings.length)}`} />
        <Stat label="ENTRIES" value={num(stats.total)} />
        <Stat label="ENTERED TODAY" value={num(stats.today)} highlight={stats.today > 0} />
        {SURVEY_CATEGORIES.map(([v, l]) => stats.cats[v] ? <Stat key={v} label={l.toUpperCase() + ' UNITS'} value={num(stats.cats[v])} /> : null)}
        <Stat label="LAST ACTIVITY" value={stats.last ? fmtDateTime(stats.last) : '—'} mono />
      </div>

      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
          {[['log', 'Daily Log'], ['table', 'All entries']].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={{ padding: '7px 14px', fontSize: 12.5, fontWeight: view === k ? 700 : 500, background: view === k ? '#F5EEDF' : '#fff', color: view === k ? 'var(--accent)' : 'var(--text-3)', border: 'none', cursor: 'pointer' }}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn icon="upload" disabled={exporting} onClick={doExport}>{exporting ? 'Exporting…' : 'Export Excel'}</Btn>
          {canWrite && <Btn variant="primary" icon="plus" onClick={() => setEditing({})}>Add entry</Btn>}
        </div>
      </div>

      {loading && entries.length === 0 ? <Loading /> : buildings.length === 0 ? (
        <Empty icon="buildings">Add a building to the project before surveying.</Empty>
      ) : view === 'log' ? (
        <SurveyDailyLog entries={entries} buildings={buildings} />
      ) : (
        <SurveyEntriesTable entries={entries} buildings={buildings} canManageAll={canManageAll} currentUserId={user?.id} onEdit={(row) => setEditing(row)} />
      )}

      {editing && (
        <SurveyEntryForm project={project} buildings={buildings} row={editing.id ? editing : null}
          onClose={() => setEditing(null)} onSaved={(close) => { if (close) setEditing(null) }} />
      )}
    </div>
  )
}

function Stat({ label, value, highlight, mono }) {
  return (
    <div style={{ flex: '1 1 130px', minWidth: 120, border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px', background: highlight ? '#F5EEDF' : 'var(--bg)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.5px', color: 'var(--text-3)' }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: mono ? 12.5 : 17, marginTop: 3, fontFamily: mono ? 'var(--mono)' : undefined }}>{value}</div>
    </div>
  )
}
