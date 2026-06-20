import { useAuth } from '../rbac'

// Reports (dc r_reports, lines 917-950). Materials Consumption · Tarsheed
// (locked placeholder per brief) · Employee Performance (PMO+CEO only) ·
// ESM-vs-Plan. Full charts wired to lib/db.js in the per-screen port (task #4).
export default function Reports() {
  const { role } = useAuth()
  const empAllowed = role === 'pmo' || role === 'ceo'

  return (
    <div data-screen-label="Reports">
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '2px', color: 'var(--text-3)' }}>PROGRAMME REPORTS</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 0' }}>Reports</h1>
      </div>
      <div className="ies-2col" style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 14 }}>
        <Section title="Materials Consumption" tag="CONSUMED VS PLANNED" note="Per-material consumption bars (dc consBars, 924-931)." />
        <Section title="Tarsheed Export" tag="LOCKED · AWAITING FORMAT" note="Placeholder card per brief — wired once the client Excel format arrives." />
      </div>
      <div style={{ marginTop: 14 }}>
        {empAllowed
          ? <Section title="Employee Performance" tag="PMO + CEO" note="Per-employee throughput table (dc empPerf, 933-948)." />
          : <Section title="Employee Performance" tag="RESTRICTED" note="Visible to PMO and CEO only — your role cannot view this report." />}
      </div>
      <div style={{ marginTop: 14 }}>
        <Section title="ESM Progress vs Plan" tag="DESIGNER SUGGESTION" note="ESM-level actual-vs-plan comparison." />
      </div>
    </div>
  )
}

function Section({ title, tag, note }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)' }}>{tag}</div>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>{note}</div>
    </div>
  )
}
