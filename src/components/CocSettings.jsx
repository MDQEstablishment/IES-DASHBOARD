import { useLiveQuery } from '../lib/db'
import { supabase } from '../lib/supabase'
import { Drawer, Btn, Empty } from './ui'
import { toast } from '../lib/toast'

// 8S screen 5 → trimmed in 8U. Certificate settings now carry ONLY what the ESCO
// legitimately owns: how certificates cover buildings (all-together vs per-
// building). Signer identities and beneficiary representatives were removed —
// signing is TARSHID's scope, done on paper after this tool produces the PDF.
// The settings row itself is auto-created by CocHome on first open.
export default function CocSettings({ open, projectId, onClose }) {
  const { rows: settingsRows, refetch } = useLiveQuery('coc_project_settings',
    (q) => q.select('*').eq('project_id', projectId), [projectId])
  const settings = settingsRows[0]

  const saveSetting = async (patch) => {
    const { error } = await supabase.from('coc_project_settings').update(patch).eq('project_id', projectId)
    if (error) toast("Couldn't save — " + error.message, 'err')
    else { toast('Saved'); refetch() }
  }

  return (
    <Drawer open={open} width={520} title="Certificate settings" subtitle="How this project's certificates cover its buildings" onClose={onClose}
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
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
            Signatures are added by TARSHID after the certificate is issued — the generated PDF leaves the الاعتماد (Approval) block blank to be signed.
          </div>
        </>
      )}
    </Drawer>
  )
}
