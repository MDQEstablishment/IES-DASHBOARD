import { useState } from 'react'
import { PageHead, Card, Pill, Loading, Empty, Btn, Modal, Field, Bar } from '../components/ui'
import { useAuth, can, Can } from '../rbac'
import { useLiveQuery, bgInsert } from '../lib/db'
import { CAN_MOVE_MATERIAL, PMO_ADMIN } from '../lib/constants'
import { num, fmtShort } from '../lib/format'

export default function ManageEsms() {
  const { user, role } = useAuth()
  const [mv, setMv] = useState(null) // material to record a movement for
  const { rows: esms } = useLiveQuery('esms', (q) => q.select('*').order('code'))
  const { rows: materials, loading } = useLiveQuery('materials', (q) => q.select('*,esm:esms(code,name)').order('code'))
  const { rows: moves } = useLiveQuery('material_movements',
    (q) => q.select('*,material:materials(code),by:profiles!material_movements_moved_by_id_fkey(full_name)').order('occurred_at', { ascending: false }).limit(20))

  return (
    <>
      <PageHead kicker="Inventory · ESM catalogue" title="Manage ESMs"
        sub={`${esms.length} ESMs · ${materials.length} materials`} />

      <div className="grid mb-4" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {esms.map((e) => (
          <Card key={e.id} title={e.code} meta={e.unit}>
            <div style={{ fontWeight: 600 }}>{e.name}</div>
            <div className="muted mt-2" style={{ fontSize: 12 }}>{materials.filter((m) => m.esm_id === e.id).length} materials</div>
          </Card>
        ))}
      </div>

      <Card title="Materials inventory" meta="ordered · received · on-hand" pad={false} style={{ marginBottom: 16 }}>
        {loading ? <Loading /> : materials.length === 0 ? <Empty icon="Boxes">No materials.</Empty> : (
          <table className="tbl">
            <thead><tr><th>SKU</th><th>Material</th><th>ESM</th><th className="right">Planned</th><th className="right">Requested</th><th className="right">Received</th><th className="right">Reorder at</th><th>State</th><Can allow={CAN_MOVE_MATERIAL}><th>Action</th></Can></tr></thead>
            <tbody>
              {materials.map((m) => {
                const low = m.received < m.threshold
                return (
                  <tr key={m.id}>
                    <td className="num" style={{ fontWeight: 600 }}>{m.code}</td>
                    <td>{m.name}<div className="muted" style={{ fontSize: 11 }}>{m.brand_spec}</div></td>
                    <td className="muted">{m.esm?.code}</td>
                    <td className="right num">{num(m.planned)}</td>
                    <td className="right num">{num(m.requested)}</td>
                    <td className="right num">{num(m.received)}</td>
                    <td className="right num muted">{num(m.threshold)}</td>
                    <td>{low ? <span className="pill pill-red">reorder</span> : <span className="pill pill-green">ok</span>}</td>
                    <Can allow={CAN_MOVE_MATERIAL}><td><Btn className="btn-sm" icon="Package" onClick={() => setMv(m)}>Move</Btn></td></Can>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Recent movements" meta="request / receipt ledger" pad={false}>
        {moves.length === 0 ? <Empty icon="Activity">No movements recorded.</Empty> : (
          <table className="tbl">
            <thead><tr><th>When</th><th>SKU</th><th>Kind</th><th className="right">Qty</th><th>By</th><th>Note</th></tr></thead>
            <tbody>
              {moves.map((m) => (
                <tr key={m.id}>
                  <td className="num muted">{fmtShort(m.occurred_at)}</td>
                  <td className="num">{m.material?.code}</td>
                  <td><span className={`pill ${m.kind === 'receipt' ? 'pill-green' : 'pill-blue'}`}>{m.kind}</span></td>
                  <td className="right num">{num(m.qty)}</td>
                  <td className="muted">{m.by?.full_name || 'system'}</td>
                  <td className="muted truncate" style={{ maxWidth: 260, fontSize: 11.5 }}>{(m.note || '').replace('[seed] ', '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {mv && <MoveModal material={mv} user={user} onClose={() => setMv(null)} />}
    </>
  )
}

function MoveModal({ material, user, onClose }) {
  const [kind, setKind] = useState('receipt'); const [qty, setQty] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!qty || Number(qty) < 1) return
    setBusy(true)
    const { error } = await bgInsert('material_movements', {
      material_id: material.id, kind, qty: Number(qty), note: note || null, moved_by_id: user.id,
    }, { okMsg: `${kind === 'receipt' ? 'Receipt' : 'Request'} recorded ✓` })
    setBusy(false); if (!error) onClose()
  }
  return (
    <Modal open title={`Record movement · ${material.code}`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save} disabled={busy || !qty}>{busy ? 'Saving…' : 'Record'}</Btn></>}>
      <div className="flex gap-3">
        <div className="grow"><Field label="Kind"><select className="select" value={kind} onChange={(e) => setKind(e.target.value)}><option value="receipt">Receipt (received)</option><option value="request">Request (ordered)</option></select></Field></div>
        <div className="grow"><Field label="Quantity"><input className="input num" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /></Field></div>
      </div>
      <Field label="Note"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="PO / DN reference…" /></Field>
      <div className="draft-flag">Updates the material's running counters via the ledger trigger.</div>
    </Modal>
  )
}
