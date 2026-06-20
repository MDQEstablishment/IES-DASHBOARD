import { useEffect } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useBreadcrumb } from '../breadcrumbs'
import Icon from '../components/Icon'

// Building Detail — the level-3 drill-in (dc r_building, lines 415-638). Owns the
// nested sub-tab menu (Assets / Rooms / Materials / Documents / Photos / Activity)
// AND the deep-linkable install-log item route (…/install-log/:itemId).
// Tab bodies are wired to live data in the per-screen port (task #5); this file
// establishes the nested routing + nested menu + breadcrumb context the contract
// requires. Active tab + item id are derived from the URL so every view is
// deep-linkable and the breadcrumb reflects the real nesting depth.
const TABS = [
  { key: '', label: 'Assets', icon: 'tasks' },
  { key: 'rooms', label: 'Rooms', icon: 'buildings' },
  { key: 'materials', label: 'Materials', icon: 'materials' },
  { key: 'documents', label: 'Documents', icon: 'doc' },
  { key: 'photos', label: 'Photos', icon: 'camera' },
  { key: 'activity', label: 'Activity', icon: 'curve' },
]

export default function BuildingDetail() {
  const { id, bid } = useParams()
  const nav = useNavigate()
  const loc = useLocation()
  const { setLabel } = useBreadcrumb()

  // derive the active sub-route from the path tail after …/buildings/:bid/
  const base = `/projects/${id}/buildings/${bid}`
  const tail = loc.pathname.slice(loc.pathname.indexOf(base) + base.length).replace(/^\//, '')
  const seg = tail.split('/')
  const isInstallItem = seg[0] === 'install-log'
  const activeTab = isInstallItem ? '' : (seg[0] || '')
  const itemId = isInstallItem ? seg[1] : null

  useEffect(() => { setLabel('building:' + bid, bid) }, [bid, setLabel])
  useEffect(() => { if (itemId) setLabel('item:' + itemId, itemId) }, [itemId, setLabel])

  return (
    <div data-screen-label="Building Detail">
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '2px', color: 'var(--text-3)' }}>BUILDING · {id}</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 0' }}>{bid}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to={`${base}/daily`} className="ies-card-hover" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 13px', borderRadius: 9, border: '1px solid var(--line)', background: '#fff', fontWeight: 600, fontSize: 13 }}>
            <Icon name="daily" size={15} />Daily Progress
          </Link>
        </div>
      </div>

      {/* nested sub-tab menu (dc bTabs, line 428) */}
      <div className="ies-table-wrap" style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--line)', paddingBottom: 0, flexWrap: 'wrap' }}>
        {TABS.map((t) => {
          const on = activeTab === t.key
          return (
            <button key={t.key || 'assets'} onClick={() => nav(t.key ? `${base}/${t.key}` : base)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 13px', borderRadius: '8px 8px 0 0', fontSize: 13, fontWeight: on ? 700 : 500, color: on ? 'var(--accent)' : 'var(--text-3)', borderBottom: on ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -1 }}>
              <Icon name={t.icon} size={15} />{t.label}
            </button>
          )
        })}
      </div>

      {/* tab body */}
      {activeTab === '' && !itemId && (
        <Placeholder title="Assets · Daily Install Log" note="Per-sub-type install log with expand/collapse, install timeline, and the Add-today's-install modal (dc 431-556). Click an item below to drill to its install history.">
          <Link to={`${base}/install-log/I-481`} className="ies-card-hover" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 13px', borderRadius: 9, border: '1px solid var(--line)', background: '#fff', fontWeight: 600, fontSize: 13 }}>
            <Icon name="chevronr" size={15} />Open install item I-481
          </Link>
        </Placeholder>
      )}
      {itemId && (
        <Placeholder title={`Install Log Item · ${itemId}`} note="Level-4 drill-in: install history, photos, QA status and approve action for this line item (dc 517-556).">
          <Link to={base} style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 13 }}>← Back to Assets</Link>
        </Placeholder>
      )}
      {activeTab === 'rooms' && <Placeholder title="Rooms" note="Per-room item lists with add/edit (dc bld_isRooms, 557-593)." />}
      {activeTab === 'materials' && <Placeholder title="Materials Used vs Planned" note="Per-building material lines, four states (dc bld_isMaterials, 594-615)." />}
      {activeTab === 'documents' && <Placeholder title="Documents" note="Per-building document tracker (dc bld_isDocs, 616-619)." />}
      {activeTab === 'photos' && <Placeholder title="Site Photos" note="Photo grid + capture (dc bld_isPhotos, 620-623)." />}
      {activeTab === 'activity' && <Placeholder title="Activity Log" note="Per-building activity feed (dc bld_isActivity, 624-627)." />}
    </div>
  )
}

function Placeholder({ title, note, children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5, maxWidth: 640, marginBottom: children ? 14 : 0 }}>{note}</div>
      {children}
    </div>
  )
}
