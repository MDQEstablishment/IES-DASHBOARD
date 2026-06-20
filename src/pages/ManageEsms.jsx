import { useState } from 'react'
import { Avatar, Chip, Card, PageTitle, Loading, Empty, Btn, Modal, Field, inputStyle } from '../components/ui'
import { useAuth, can, Can } from '../rbac'
import { useLiveQuery, bgInsert } from '../lib/db'
import { CAN_MOVE_MATERIAL } from '../lib/constants'
import { num, fmtShort } from '../lib/format'

// Stock-status pill logic (received vs threshold)
function stockStatus(received, threshold) {
  const inStock = received || 0
  const t = threshold || 0
  if (inStock < t) return { label: 'Reorder Needed', color: '#EF4444', bg: '#FEF2F2' }
  if (inStock < t * 1.5) return { label: 'Low', color: '#F59E0B', bg: '#FFFBEB' }
  return { label: 'Healthy', color: '#10B981', bg: '#ECFDF5' }
}

export default function ManageEsms() {
  const { user, role } = useAuth()
  const [mv, setMv] = useState(null) // material to record a movement for
  const canMove = can(role, CAN_MOVE_MATERIAL)

  const { rows: esms } = useLiveQuery('esms', (q) => q.select('*').order('code'))
  const { rows: materials, loading } = useLiveQuery('materials', (q) =>
    q.select('*,esm:esms(code,name)').order('code'))
  const { rows: moves } = useLiveQuery('material_movements', (q) =>
    q.select('*,material:materials(code),by:profiles!material_movements_moved_by_id_fkey(full_name)')
      .order('occurred_at', { ascending: false }).limit(20))

  return (
    <div>
      <PageTitle
        kicker="INVENTORY · ESM CATALOGUE"
        title="Materials"
        right={
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>
            {esms.length} ESMs · {materials.length} materials
          </div>
        }
      />

      {/* ESM catalogue cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 16 }}>
        {esms.map((e) => (
          <Card key={e.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{e.code}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: 'var(--text-3)', background: 'var(--bg)' }}>{e.unit}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{e.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
              {materials.filter((m) => m.esm_id === e.id).length} materials
            </div>
          </Card>
        ))}
      </div>

      {/* Materials inventory table */}
      <Card pad={0} style={{ overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Materials inventory</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '.5px' }}>PLANNED · REQUESTED · RECEIVED</div>
        </div>
        {loading ? (
          <Loading />
        ) : materials.length === 0 ? (
          <Empty icon="box">No materials.</Empty>
        ) : (
          <div className="ies-table-wrap">
            <table className="ies-tbl" style={{ minWidth: 880 }}>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Material</th>
                  <th>ESM</th>
                  <th style={{ textAlign: 'right' }}>Planned</th>
                  <th style={{ textAlign: 'right' }}>Requested</th>
                  <th style={{ textAlign: 'right' }}>Received</th>
                  <th style={{ textAlign: 'right' }}>Reorder at</th>
                  <th>Stock</th>
                  {canMove && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {materials.map((m) => {
                  const s = stockStatus(m.received, m.threshold)
                  return (
                    <tr key={m.id} className="ies-trow">
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{m.code}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{m.name}</div>
                        {m.brand_spec && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{m.brand_spec}</div>}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>{m.esm?.code || '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{num(m.planned)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{num(m.requested)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{num(m.received)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{num(m.threshold)}</td>
                      <td>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: s.color, background: s.bg, whiteSpace: 'nowrap' }}>{s.label}</span>
                      </td>
                      {canMove && (
                        <td>
                          <Btn icon="box" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setMv(m)}>Move</Btn>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Recent movements feed */}
      <Card pad={0} style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Recent movements</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '.5px' }}>REQUEST / RECEIPT LEDGER</div>
        </div>
        {moves.length === 0 ? (
          <Empty icon="box">No movements recorded.</Empty>
        ) : (
          <div className="ies-table-wrap">
            <table className="ies-tbl" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>SKU</th>
                  <th>Kind</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th>By</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={m.id} className="ies-trow">
                    <td style={{ fontFamily: 'var(--mono)', whiteSpace: 'nowrap', color: 'var(--text-3)' }}>{fmtShort(m.occurred_at)}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{m.material?.code || '—'}</td>
                    <td>
                      <Chip
                        label={m.kind === 'receipt' ? 'Receipt' : 'Request'}
                        color={m.kind === 'receipt' ? '#10B981' : '#2563EB'}
                        bg={m.kind === 'receipt' ? '#ECFDF5' : '#EFF6FF'}
                      />
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{num(m.qty)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar name={m.by?.full_name || 'system'} size={22} />
                        <span>{m.by?.full_name || 'system'}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-3)', fontSize: 11.5, maxWidth: 260 }}>{(m.note || '').replace(/^\[seed\]\s*/, '') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {mv && <MoveModal material={mv} user={user} onClose={() => setMv(null)} />}
    </div>
  )
}

function MoveModal({ material, user, onClose }) {
  const [kind, setKind] = useState('receipt')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!qty || Number(qty) < 1) return
    setBusy(true)
    const { error } = await bgInsert('material_movements', {
      material_id: material.id,
      kind,
      qty: Number(qty),
      note: note || null,
      moved_by_id: user.id,
    }, { okMsg: `${kind === 'receipt' ? 'Receipt' : 'Request'} recorded` })
    setBusy(false)
    if (!error) onClose()
  }

  return (
    <Modal
      open
      title={`Record movement · ${material.code}`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save} disabled={busy || !qty}>{busy ? 'Saving…' : 'Record'}</Btn>
        </>
      }
    >
      <Field label="Kind">
        <select style={inputStyle} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="receipt">Receipt (received)</option>
          <option value="request">Request (ordered)</option>
        </select>
      </Field>
      <Field label="Quantity">
        <input style={inputStyle} type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Note">
        <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="PO / DN reference…" />
      </Field>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Updates the material's running counters via the ledger trigger.</div>
    </Modal>
  )
}
