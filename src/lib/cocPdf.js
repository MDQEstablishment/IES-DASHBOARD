// Sprint 8S Phase 3 — client side of the COC pipeline.
// The RPCs (0083) own all state; this module assembles the renderCoc data
// contract from live rows, renders the PDF (pdf-lib, in-browser), uploads it
// to the private coc-pdfs bucket, and marks the COC generated.
import { supabase } from './supabase'
import { uploadToBucket } from './db'
import { generateDocPdf } from './docPdf'
import { ROLE_FULL } from './constants'

const AC_RE = /\ba\/?c\b|air.?cond|cool|hvac/i
const CTRL_RE = /control|sensor/i

// Display name for a certificate's scope: AC if every covered ESM is an AC
// measure, Lighting otherwise. esmName maps code -> display name.
export const kindLabel = (esmCodes, esmName) =>
  (esmCodes || []).length && (esmCodes || []).every((c) => AC_RE.test(esmName[c] || '')) ? 'AC' : 'Lighting'

// Owner-final business model: every non-AC ESM shares ONE lighting certificate;
// every AC ESM gets its own. Derive that pairing from the project's ESM names.
export function defaultEsmGroupings(esmOpts) {
  // esmOpts: [{ code, name }]
  const lighting = esmOpts.filter((e) => !AC_RE.test(e.name || '')).map((e) => e.code)
  const groups = lighting.length > 1 ? [lighting] : []
  esmOpts.filter((e) => AC_RE.test(e.name || '')).forEach((e) => groups.push([e.code]))
  if (lighting.length === 1) groups.push(lighting)
  return groups
}

// First-open auto-upsert: make sure coc_project_settings exists with the fixed
// ESM pairing, so the plan preview RPC groups certificates correctly.
export async function ensureCocSettings(projectId, esmOpts) {
  const { data } = await supabase.from('coc_project_settings').select('project_id,esm_groupings').eq('project_id', projectId).maybeSingle()
  if (data) {
    if ((data.esm_groupings || []).length === 0 && esmOpts.length) {
      await supabase.from('coc_project_settings').update({ esm_groupings: defaultEsmGroupings(esmOpts) }).eq('project_id', projectId)
    }
    return
  }
  await supabase.from('coc_project_settings').upsert(
    { project_id: projectId, esm_groupings: defaultEsmGroupings(esmOpts) }, { onConflict: 'project_id' })
}

// One round trip for everything the PDF needs for a whole project — callers
// generating in bulk reuse the same context across COCs.
export async function fetchCocContext(projectId) {
  const { data: auth } = await supabase.auth.getUser()
  const [proj, settings, assignments, buildings, pesms, installed, removed, me] = await Promise.all([
    supabase.from('projects').select('*').eq('id', projectId).single(),
    supabase.from('coc_project_settings').select('*').eq('project_id', projectId).maybeSingle(),
    supabase.from('coc_beneficiary_assignments').select('*').eq('project_id', projectId),
    supabase.from('buildings').select('*').eq('project_id', projectId),
    supabase.from('project_esms').select('custom_name,archived,esm:esms(code,name)').eq('project_id', projectId).eq('archived', false),
    supabase.from('project_installed_items').select('*').eq('project_id', projectId),
    supabase.from('project_removed_items').select('*').eq('project_id', projectId),
    auth?.user?.id
      ? supabase.from('profiles').select('full_name,job_title,role').eq('id', auth.user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const esmName = {}
  ;(pesms.data || []).forEach((pe) => { if (pe.esm) esmName[pe.esm.code] = pe.custom_name || pe.esm.name })
  return {
    project: proj.data, settings: settings.data || null,
    assignments: assignments.data || [], buildings: buildings.data || [],
    esmName, installed: installed.data || [], removed: removed.data || [],
    currentUser: me.data || null,
  }
}

const fmtDate = (d) => {
  if (!d) return ''
  const [y, m, day] = String(d).slice(0, 10).split('-')
  return y ? `${Number(day)}-${Number(m)}-${y}` : String(d)
}

// Map a cocs row (+ covered building ids) onto the renderCoc data contract.
export function assembleCocPdfData(coc, coveredBuildingIds, ctx) {
  const { project: p, settings: s, esmName } = ctx
  const covered = ctx.buildings.filter((b) => coveredBuildingIds.includes(b.id))
    .sort((a, b) => (a.code || '').localeCompare(b.code || ''))
  const single = covered.length === 1 ? covered[0] : null

  const kind = coc.esm_codes.some((c) => AC_RE.test(esmName[c] || '')) && !coc.esm_codes.some((c) => /light/i.test(esmName[c] || ''))
    ? 'ac' : 'lighting'

  // Item is in scope when its ESM is on this certificate AND it is either
  // project-wide (no building_id) or belongs to a building this COC covers —
  // so a scattered per-building COC lists that building's own fixtures (8T-5).
  const inScope = (it) => coc.esm_codes.includes(it.esm_code) &&
    (!it.building_id || coveredBuildingIds.includes(it.building_id))
  const ins = ctx.installed.filter(inScope)
  const rem = ctx.removed.filter(inScope)
  const mapLight = (it) => ({
    description: [it.item_description, it.model_code].filter(Boolean).join(' '),
    qty: it.total_quantity,
    power: it.capacity_value != null ? `${it.capacity_value}${it.capacity_unit || 'W'}` : '',
    returned: it.returned_to_facility !== false,
  })
  const mapAc = (it) => ({
    description: [it.item_description, it.model_code].filter(Boolean).join(' '),
    qty: it.total_quantity,
    kbtu: it.capacity_value ?? '', seer: it.efficiency_value ?? '',
    returned: it.returned_to_facility !== false,
  })
  const isCtrl = (it) => CTRL_RE.test(esmName[it.esm_code] || '')

  // beneficiary: single building's assignment, or the uniform one across scope
  const assigns = ctx.assignments.filter((a) => coveredBuildingIds.includes(a.building_id) && a.beneficiary_name)
  const uniform = [...new Set(assigns.map((a) => a.beneficiary_name))]
  const bene = uniform.length === 1 ? assigns[0] : null

  // 8T item 1 — the IES ("implementing company") signatory defaults to whoever
  // generates the certificate: their account name + job title (role label as a
  // last resort). The saved settings value stays an optional override.
  const me = ctx.currentUser
  const escoName = s?.esco_signatory?.name || me?.full_name || ''
  const escoRole = s?.esco_signatory?.designation || me?.job_title || (me?.role ? ROLE_FULL[me.role] : '') || ''
  const sig = {
    esco: { name: escoName, designation: escoRole },
    tarshid: { name: s?.tarshid_spm?.name || '', designation: s?.tarshid_spm?.designation || '' },
    beneficiary: { name: bene?.beneficiary_name || '', designation: bene?.beneficiary_designation || '' },
  }

  return {
    referenceNo: coc.reference_no || coc.code,
    date: new Date().toISOString().slice(0, 10),
    projectName: p?.name || '',
    projectRefNo: p?.project_reference_no || p?.code || '',
    contractDate: fmtDate(p?.contract_sign_date || p?.start_date),
    endDate: fmtDate(p?.works_end_date || p?.end_date),
    signatureDate: fmtDate(p?.coc_signature_date),
    escoOrg: s?.esco_signatory?.org || '',
    subcontractor: p?.subcontractor || '',
    buildingNos: covered.map((b) => b.code).join(', '),
    entityName: single ? single.name : (p?.beneficiary_entity || p?.client || ''),
    buildingType: single?.building_type || p?.building_type || '',
    region: single?.region || p?.region || '',
    city: single?.city || p?.region || '',
    coords: single && single.location_lat != null && single.location_lng != null
      ? `${single.location_lat}, ${single.location_lng}` : '',
    descriptionLines: coc.esm_codes.map((c) => esmName[c] || c),
    kind,
    installed: (kind === 'ac' ? ins.map(mapAc) : ins.filter((it) => !isCtrl(it)).map(mapLight)),
    installedControls: kind === 'ac' ? [] : ins.filter(isCtrl).map((it) => ({ ...mapLight(it), ctrlRefNo: '', ctrlRefDesc: '', ctrlTotal: '' })),
    installedOther: [],
    removed: (kind === 'ac' ? rem.map(mapAc) : rem.map(mapLight)),
    meterNo: single?.elec_meter_no || '',
    subscriptionNo: single?.elec_subscription_no || '',
    accountNo: single?.elec_account_no || '',
    attachmentsChecked: [],
    signatories: sig,
  }
}

// Render + upload + mark generated. Returns { ok, path, bytes, filename } or
// { error } — bytes/filename let callers offer a client-side ZIP download.
export async function generateAndUploadCocPdf(coc, coveredBuildingIds, ctx, userId) {
  const data = assembleCocPdfData(coc, coveredBuildingIds, ctx)
  const bytes = await generateDocPdf('coc', data)
  const filename = `${coc.code}-R${coc.revision}.pdf`
  const file = new File([bytes], filename, { type: 'application/pdf' })
  const key = `${coc.project_id}/${filename}`
  const { path, error } = await uploadToBucket('coc-pdfs', file, { userId, key })
  if (error) return { error }
  const { data: res, error: rpcErr } = await supabase.rpc('mark_coc_generated', { p_coc_id: coc.id, p_pdf_path: path })
  if (rpcErr) return { error: rpcErr }
  if (!res?.ok) return { error: { message: res?.error || 'mark_coc_generated failed' } }
  return { ok: true, path, bytes, filename }
}

// Preview a plan row (no COC row exists yet): fake a draft coc from the row.
export async function renderCocPreview(row, ctx, code = 'PREVIEW') {
  const coc = {
    id: null, project_id: ctx.project?.id, code, reference_no: code,
    revision: 1, esm_codes: row.esm_codes || [],
  }
  const data = assembleCocPdfData(coc, row.building_ids || [], ctx)
  return await generateDocPdf('coc', data)
}
