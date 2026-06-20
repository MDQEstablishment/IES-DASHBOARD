import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { statusMeta } from '../lib/constants'

// Real OpenStreetMap building markers (Phase 4). Numbered pin via divIcon to
// avoid Leaflet's bundler-broken default marker images. Popup shows building
// name, contractor name + phone, and status.
function numberedIcon(n, color = '#2563EB') {
  return L.divIcon({
    className: '',
    html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);box-shadow:0 2px 6px rgba(15,23,42,.35);display:flex;align-items:center;justify-content:center;border:2px solid #fff"><span style="transform:rotate(45deg);color:#fff;font:700 12px/1 'JetBrains Mono',monospace">${n}</span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -24],
  })
}

export default function BuildingsMap({ buildings = [] }) {
  const pts = buildings.filter((b) => b.location_lat != null && b.location_lng != null)
  if (!pts.length) {
    return (
      <div style={{ height: 360, borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>
        No geolocated buildings yet — add latitude/longitude to see them on the map.
      </div>
    )
  }
  const center = [
    pts.reduce((a, b) => a + Number(b.location_lat), 0) / pts.length,
    pts.reduce((a, b) => a + Number(b.location_lng), 0) / pts.length,
  ]
  return (
    <MapContainer center={center} zoom={pts.length > 1 ? 6 : 12} scrollWheelZoom={false}
      style={{ height: 360, width: '100%', borderRadius: 12, border: '1px solid var(--line)' }}>
      <TileLayer attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {pts.map((b, i) => {
        const [col] = statusMeta(b.status_override || 'pending')
        return (
          <Marker key={b.id} position={[Number(b.location_lat), Number(b.location_lng)]} icon={numberedIcon(i + 1, col)}>
            <Popup>
              <div style={{ fontFamily: 'var(--ui)', minWidth: 180 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#64748B' }}>{b.code}</div>
                <div style={{ fontWeight: 700, fontSize: 13, margin: '2px 0 6px' }}>{b.name}</div>
                <div style={{ fontSize: 12, color: '#334155' }}>🏗 {b.contractor_name || b.contractor || '—'}</div>
                {b.contractor_phone && <div style={{ fontSize: 12, color: '#334155' }}>📞 {b.contractor_phone}</div>}
                <div style={{ marginTop: 6, display: 'inline-block', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, color: col, background: statusMeta(b.status_override || 'pending')[1] }}>
                  {statusMeta(b.status_override || 'pending')[2]}
                </div>
              </div>
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
