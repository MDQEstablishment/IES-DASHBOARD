import { useState, Fragment } from 'react'
import Icon from '../components/Icon'
import { Avatar, Chip, Card, PageTitle, Loading, Empty, Btn, Modal, Field, inputStyle } from '../components/ui'
import { useAuth, can } from '../rbac'
import { useLiveQuery, bgInsert, bgUpdate } from '../lib/db'
import { CAN_MOVE_MATERIAL } from '../lib/constants'
import { num, fmtShort } from '../lib/format'
import MainWarehouse from '../components/MainWarehouse'

// Materials (dc r_materials, 883-916). Stock grouped per-ESM; in-stock = received
// − consumed and shortage = max(0, planned − received) are computed at read (no
// stored columns). Movements ledger kept below as the Request/Receipt feature.
function statusOf(inStock, threshold) {
  const t = threshold || 0
  if (inStock < t) return { label: 'Reorder', color: '#EF4444', bg: '#FEF2F2' }
  if (inStock < t * 1.5) return { label: 'Low', color: '#F59E0B', bg: '#FFFBEB' }
  return { label: 'Healthy', color: '#10B981', bg: '#ECFDF5' }
}

export default function ManageEsms() {
  const { user, role } = useAuth()
  const [mv, setMv] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const canMove = can(role, CAN_MOVE_MATERIAL)

  const { rows: esms } = useLiveQuery('esms', (q) => q.select('*').order('code'))
  const { rows: activeCats } = useLiveQuery('material_categories', (q) => q.select('id,code,name_en,esm_id,is_active').eq('is_active', true).order('code'))
  const { rows: materials, loading } = useLiveQuery('materials', (q) => q.select('*,esm:esms(code,name),category:material_categories(id,code,name_en,is_active)').order('code'))
  const { rows: scopes } = useLiveQuery('building_item_scope', (q) => q.select('id,material_code'))
  const { rows: install } = useLiveQuery('install_log', (q) => q.select('scope_id,qty'))
  const { rows: moves } = useLiveQuery('material_movements', (q) =>
    q.select('*,material:materials(code),by:profiles!material_movements_moved_by_id_fkey(full_name)')
      .order('occurred_at', { ascending: false }).limit(20))

  // consumed per material code = Σ installed qty over scopes that consume that code
  const scopeMat = {}; scopes.forEach((s) => { scopeMat[s.id] = s.material_code })
  const consumedByCode = {}; install.forEach((r) => { const c = scopeMat[r.scope_id]; if (c) consumedByCode[c] = (consumedByCode[c] || 0) + (r.qty || 0) })

  const decorate = (m) => {
    const requested = m.requested || 0, received = m.received || 0, planned = m.planned || 0, threshold = m.threshold || 0
    const shortage = Math.max(0, planned - received)
    const consumed = consumedByCode[m.code] || 0
    const inStock = received - consumed
    return { ...m, requested, received, shortage, consumed, inStock, threshold, st: statusOf(inStock, threshold) }
  }

  const decorated = materials.map(decorate)
  const lowCount = decorated.filter((m) => m.inStock < m.threshold).length

  // Sprint 8H — group each ESM's variants by category (Main + Accessories pair,
  // active only) and then by display name; brands of the same name collapse into
  // one row with a brand picker.
  const isAcc = (code) => /-ACC$/i.test(code || '')
  const groups = esms.map((e) => {
    const items = decorated.filter((m) => m.esm_id === e.id)
    const byCat = {}
    items.forEach((m) => {
      const c = m.category
      if (!c || c.is_active === false) return
      const g = byCat[c.id] || (byCat[c.id] = { cat: c, names: {} })
      ;(g.names[m.name] = g.names[m.name] || []).push(m)
    })
    const cats = Object.values(byCat)
      .sort((a, b) => (isAcc(a.cat.code) ? 1 : 0) - (isAcc(b.cat.code) ? 1 : 0) || (a.cat.code || '').localeCompare(b.cat.code || ''))
      .map((g) => ({
        cat: g.cat,
        nameGroups: Object.entries(g.names)
          .map(([name, variants]) => ({ name, variants: variants.sort((x, y) => (x.brand || '').localeCompare(y.brand || '')) }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
    return { no: e.code, name: e.name, cats }
  })

  const onThresh = (m, val) => {
    const n = parseInt(val, 10)
    if (Number.isNaN(n) || n === m.threshold) return
    bgUpdate('materials', m.id, { threshold: Math.max(0, n) }, { okMsg: 'Threshold updated' })
  }

  return (
    <div data-screen-label="Materials">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
        <PageTitle kicker="STOCK · ALL PROJECTS" title="Materials" />
        {canMove && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setAddOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 13px', borderRadius: 9, background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13 }}><Icon name="plus" size={15} />Add Material</button>
          </div>
        )}
      </div>

      <MainWarehouse />

      {lowCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: 9, padding: '9px 13px', fontSize: 12.5, marginBottom: 16 }}>
          <Icon name="alert" size={15} /><span><strong>{lowCount}</strong> material(s) below threshold — reorder action required. Surfaced on the PMO dashboard.</span>
        </div>
      )}

      {loading ? <Loading /> : groups.length === 0 ? <Empty icon="box">No ESMs.</Empty>
        : decorated.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '40px 16px', textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>No materials yet</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '4px 0 16px' }}>Add your first material to build the catalog. Variants are grouped by ESM and category.</div>
            {canMove && <button onClick={() => setAddOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 18px', borderRadius: 9, background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer' }}><Icon name="plus" size={16} />Add first material</button>}
          </div>
        ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {groups.map((g) => (
            <div key={g.no} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{g.no}</span>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{g.name}</span>
              </div>
              <div className="ies-table-wrap">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 760 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
                      <th style={{ padding: 8, fontWeight: 600 }}>MATERIAL</th>
                      <th style={{ padding: 8, fontWeight: 600, textAlign: 'right' }}>REQUESTED</th>
                      <th style={{ padding: 8, fontWeight: 600, textAlign: 'right' }}>RECEIVED</th>
                      <th style={{ padding: 8, fontWeight: 600, textAlign: 'right' }}>SHORTAGE</th>
                      <th style={{ padding: 8, fontWeight: 600, textAlign: 'right' }}>CONSUMED</th>
                      <th style={{ padding: 8, fontWeight: 600, textAlign: 'right' }}>IN STOCK</th>
                      <th style={{ padding: 8, fontWeight: 600, textAlign: 'center' }}>THRESHOLD</th>
                      <th style={{ padding: 8, fontWeight: 600 }}>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.cats.length === 0 ? (
                      <tr><td colSpan={8} style={{ padding: '14px 8px', color: 'var(--text-3)' }}>No materials in this ESM.</td></tr>
                    ) : g.cats.map((c) => (
                      <Fragment key={c.cat.id}>
                        <tr><td colSpan={8} style={{ padding: '7px 8px', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.5px', color: 'var(--text-3)', background: '#F8FAFC', borderTop: '1px solid var(--line)' }}>{c.cat.name_en}</td></tr>
                        {c.nameGroups.map((ng) => <CatalogNameRow key={c.cat.id + ng.name} group={ng} canMove={canMove} onThresh={onThresh} />)}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Movements ledger (Request / Receipt — README Materials feature) */}
      <Card pad={0} style={{ overflow: 'hidden', marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Recent movements</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '.5px' }}>REQUEST / RECEIPT LEDGER</div>
          {canMove && <button onClick={() => setMv(materials[0] || null)} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Record movement</button>}
        </div>
        {moves.length === 0 ? <Empty icon="box">No movements recorded.</Empty> : (
          <div className="ies-table-wrap">
            <table className="ies-tbl" style={{ minWidth: 720 }}>
              <thead><tr><th>When</th><th>SKU</th><th>Kind</th><th style={{ textAlign: 'right' }}>Qty</th><th>By</th><th>Note</th></tr></thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={m.id} className="ies-trow">
                    <td style={{ fontFamily: 'var(--mono)', whiteSpace: 'nowrap', color: 'var(--text-3)' }}>{fmtShort(m.occurred_at)}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{m.material?.code || '—'}</td>
                    <td><Chip label={m.kind === 'receipt' ? 'Receipt' : 'Request'} color={m.kind === 'receipt' ? '#10B981' : '#2563EB'} bg={m.kind === 'receipt' ? '#ECFDF5' : '#EFF6FF'} /></td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{num(m.qty)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar name={m.by?.full_name || 'system'} size={22} /><span>{m.by?.full_name || 'system'}</span></div></td>
                    <td style={{ color: 'var(--text-3)', fontSize: 11.5, maxWidth: 260 }}>{(m.note || '').replace(/^\[seed\]\s*/, '') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {mv && <MoveModal material={mv} materials={materials} user={user} onClose={() => setMv(null)} />}
      {addOpen && <AddMaterialModal esms={esms} cats={activeCats} onClose={() => setAddOpen(false)} />}
    </div>
  )
}

// Sprint 8H — one catalog row per material name. When the name has more than one
// brand variant, a small brand picker selects which variant's stock numbers show;
// a single-brand name just renders the brand as plain text.
function CatalogNameRow({ group, canMove, onThresh }) {
  const { name, variants } = group
  const [idx, setIdx] = useState(0)
  const m = variants[idx] || variants[0]
  const multi = variants.length > 1
  const tdR = { padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }
  return (
    <tr style={{ borderTop: '1px solid var(--line)' }}>
      <td style={{ padding: '10px 8px' }}>
        <div style={{ fontWeight: 600 }}>{name}</div>
        {multi ? (
          <select lang="en" value={idx} onChange={(e) => setIdx(Number(e.target.value))} title="Brand"
            style={{ marginTop: 4, fontSize: 11, padding: '3px 6px', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--text-3)', maxWidth: 240, background: '#fff' }}>
            {variants.map((v, i) => <option key={v.id} value={i}>{[v.brand || v.brand_spec || '—', v.unit].filter(Boolean).join(' · ')}</option>)}
          </select>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{[m.brand || m.brand_spec, m.unit].filter(Boolean).join(' · ') || '—'}</div>
        )}
      </td>
      <td style={tdR}>{num(m.requested)}</td>
      <td style={tdR}>{num(m.received)}</td>
      <td style={{ ...tdR, fontWeight: 700, color: m.shortage > 0 ? '#EF4444' : 'var(--text-3)' }}>{num(m.shortage)}</td>
      <td style={{ ...tdR, color: 'var(--text-3)' }}>{num(m.consumed)}</td>
      <td style={{ ...tdR, fontWeight: 700 }}>{num(m.inStock)}</td>
      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
        {canMove
          ? <input lang="en" defaultValue={m.threshold} onBlur={(e) => onThresh(m, e.target.value)} style={{ width: 60, padding: '5px 7px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'var(--mono)', textAlign: 'center' }} />
          : <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{num(m.threshold)}</span>}
      </td>
      <td style={{ padding: '10px 8px' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: m.st.color, background: m.st.bg }}>{m.st.label}</span>
      </td>
    </tr>
  )
}

function MoveModal({ material, materials, user, onClose }) {
  const [mid, setMid] = useState(material?.id || '')
  const [kind, setKind] = useState('receipt')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!mid || !qty || Number(qty) < 1) return
    setBusy(true)
    const { error } = await bgInsert('material_movements', { material_id: mid, kind, qty: Number(qty), note: note || null, moved_by_id: user.id },
      { okMsg: `${kind === 'receipt' ? 'Receipt' : 'Request'} recorded` })
    setBusy(false)
    if (!error) onClose()
  }
  return (
    <Modal open title="Record movement" onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save} disabled={busy || !qty || !mid}>{busy ? 'Saving…' : 'Record'}</Btn></>}>
      <Field label="Material"><select style={inputStyle} value={mid} onChange={(e) => setMid(e.target.value)}><option value="">Select…</option>{materials.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}</select></Field>
      <Field label="Kind"><select style={inputStyle} value={kind} onChange={(e) => setKind(e.target.value)}><option value="receipt">Receipt (received)</option><option value="request">Request (ordered)</option></select></Field>
      <Field label="Quantity"><input lang="en" style={inputStyle} type="text" inputMode="numeric" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" /></Field>
      <Field label="Note"><input lang="en" style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="PO / DN reference…" /></Field>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Updates the material's running counters via the ledger trigger.</div>
    </Modal>
  )
}

function AddMaterialModal({ esms, cats = [], onClose }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [esmId, setEsmId] = useState(esms[0]?.id || '')
  const [brand, setBrand] = useState('')
  const [catId, setCatId] = useState('')
  const [planned, setPlanned] = useState('')
  const [threshold, setThreshold] = useState('')
  const [busy, setBusy] = useState(false)
  // Sprint 8H — categories are scoped per ESM; offer only this ESM's active ones.
  const esmCats = cats.filter((c) => c.esm_id === esmId)
  const save = async () => {
    if (!code.trim() || !name.trim() || !esmId || !catId) return
    setBusy(true)
    const { error } = await bgInsert('materials', { code: code.trim(), name: name.trim(), esm_id: esmId, category_id: catId, brand: brand.trim() || null, planned: parseInt(planned, 10) || 0, threshold: parseInt(threshold, 10) || 0 },
      { okMsg: 'Material added' })
    setBusy(false)
    if (!error) onClose()
  }
  return (
    <Modal open title="Add material" onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save} disabled={busy || !code.trim() || !name.trim() || !catId}>{busy ? 'Saving…' : 'Add'}</Btn></>}>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="SKU"><input lang="en" style={inputStyle} value={code} onChange={(e) => setCode(e.target.value)} placeholder="M-L01" /></Field></div>
        <div style={{ flex: 2 }}><Field label="Name"><input lang="en" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="LED Panel 40W" /></Field></div>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="ESM"><select style={inputStyle} value={esmId} onChange={(e) => { setEsmId(e.target.value); setCatId('') }}>{esms.map((e) => <option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}</select></Field></div>
        <div style={{ flex: 1 }}><Field label="Category"><select style={inputStyle} value={catId} onChange={(e) => setCatId(e.target.value)}><option value="">Select…</option>{esmCats.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}</select></Field></div>
      </div>
      <Field label="Brand"><input lang="en" style={inputStyle} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Philips (optional)" /></Field>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="Planned"><input lang="en" style={inputStyle} type="text" inputMode="numeric" min="0" value={planned} onChange={(e) => setPlanned(e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Threshold"><input lang="en" style={inputStyle} type="text" inputMode="numeric" min="0" value={threshold} onChange={(e) => setThreshold(e.target.value)} /></Field></div>
      </div>
    </Modal>
  )
}
