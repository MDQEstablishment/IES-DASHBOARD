import { useLiveQuery } from '../lib/db'
import { supabase } from '../lib/supabase'
import { Drawer, Btn, inputStyle, Empty } from './ui'
import { toast } from '../lib/toast'

// 8S screen 5 — everything the certificates need that isn't per-certificate:
// who signs, how certificates cover buildings, and who receives them per
// building. The settings row itself is auto-created by CocHome on first open.
export default function CocSettings({ open, projectId, buildings, onClose }) {
  const { rows: settingsRows, refetch } = useLiveQuery('coc_project_settings',
    (q) => q.select('*').eq('project_id', projectId), [projectId])
  const settings = settingsRows[0]
  const { rows: assigns, refetch: refetchAssigns } = useLiveQuery('coc_beneficiary_assignments',
    (q) => q.select('*').eq('project_id', projectId), [projectId])
  const byBuilding = Object.fromEntries(assigns.map((a) => [a.building_id, a]))

  const saveSetting = async (patch) => {
    const { error } = await supabase.from('coc_project_settings').update(patch).eq('project_id', projectId)
    if (error) toast("Couldn't save — " + error.message, 'err')
    else { toast('Saved'); refetch() }
  }
  const saveSignatory = (key, field, value) => {
    const cur = settings?.[key] || {}
    if ((cur[field] || '') === value) return
    saveSetting({ [key]: { ...cur, [field]: value } })
  }
  const saveBeneficiary = async (buildingId, field, value) => {
    const cur = byBuilding[buildingId]
    if ((cur?.[field] || '') === value) return
    const { error } = await supabase.from('coc_beneficiary_assignments').upsert({
      project_id: projectId, building_id: buildingId,
      beneficiary_name: cur?.beneficiary_name || null,
      beneficiary_designation: cur?.beneficiary_designation || null,
      [field]: value || null,
    }, { onConflict: 'project_id,building_id' })
    if (error) toast("Couldn't save — " + error.message, 'err')
    else refetchAssigns()
  }

  const sigBlock = (key, title, hint) => (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 12.5 }}>{title}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>{hint}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <input lang="en" style={{ ...inputStyle, flex: 1.2, padding: '7px 10px', fontSize: 12.5 }} placeholder="Name"
          defaultValue={settings?.[key]?.name || ''} onBlur={(e) => saveSignatory(key, 'name', e.target.value.trim())} />
        <input lang="en" style={{ ...inputStyle, flex: 1, padding: '7px 10px', fontSize: 12.5 }} placeholder="Job title"
          defaultValue={settings?.[key]?.designation || ''} onBlur={(e) => saveSignatory(key, 'designation', e.target.value.trim())} />
      </div>
    </div>
  )

  return (
    <Drawer open={open} width={520} title="Certificate settings" subtitle="Signatures, coverage and recipients for this project's certificates" onClose={onClose}
      footer={<Btn variant="primary" onClick={onClose}>Done</Btn>}>
      {!settings ? <Empty icon="doc">Loading settings…</Empty> : (
        <>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', margin: '0 0 8px' }}>HOW CERTIFICATES COVER BUILDINGS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {[['concatenated', 'All buildings together', 'One set of certificates covers every building in the project.'],
              ['scattered', 'Each building separately', 'Every building gets its own set of certificates.']].map(([v, label, desc]) => (
              <label key={v} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid ' + (settings.layout_mode === v ? 'var(--accent)' : 'var(--line)'), background: settings.layout_mode === v ? '#F5EEDF' : '#fff', borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }}>
                <input type="radio" name="coc-cover" checked={settings.layout_mode === v} onChange={() => saveSetting({ layout_mode: v })} style={{ marginTop: 2 }} />
                <span><span style={{ fontWeight: 700, fontSize: 13 }}>{label}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-3)' }}>{desc}</span></span>
              </label>
            ))}
          </div>

          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', margin: '0 0 8px' }}>WHO SIGNS</div>
          {sigBlock('esco_signatory', `IES signatory`, 'Printed in the "implementing company" column of every certificate.')}
          {sigBlock('tarshid_spm', 'TARSHID project manager', 'Printed in the TARSHID column of every certificate.')}
          {sigBlock('tarshid_technical', 'TARSHID technical department', 'Kept on record; not printed on the certificate.')}

          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', margin: '16px 0 8px' }}>WHO RECEIVES — PER BUILDING</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 8 }}>The beneficiary representative printed on each building's certificates.</div>
          {buildings.length === 0 ? <Empty icon="buildings">No active buildings.</Empty> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {buildings.map((b) => (
                <div key={b.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 5 }}>{b.code}<span style={{ color: 'var(--text-3)', fontWeight: 400, fontFamily: 'var(--font)' }}> · {b.name}</span></div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input lang="en" style={{ ...inputStyle, flex: 1.2, padding: '6px 9px', fontSize: 12 }} placeholder="Representative name"
                      defaultValue={byBuilding[b.id]?.beneficiary_name || ''} onBlur={(e) => saveBeneficiary(b.id, 'beneficiary_name', e.target.value.trim())} />
                    <input lang="en" style={{ ...inputStyle, flex: 1, padding: '6px 9px', fontSize: 12 }} placeholder="Job title / department"
                      defaultValue={byBuilding[b.id]?.beneficiary_designation || ''} onBlur={(e) => saveBeneficiary(b.id, 'beneficiary_designation', e.target.value.trim())} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Drawer>
  )
}
