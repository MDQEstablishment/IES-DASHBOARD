// MIR/WIR generation helpers (relocated from the retired CocWizard in 8S P4):
// build-for-preview, then commit-on-download. Used by InspectionFormModal.
import { bgInsert, bgUpdate, uploadToBucket } from './db'
import { generateDocPdf } from './docPdf'
import { localToday } from './format'

export const slugify = (s) => String(s || '').trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 25)
// {PROJECT_CODE}_{KIND}-{YYYY-SEQ}[_slug][_R{N}].pdf  — no random suffix
export function smartFilename({ projectCode, kind, referenceNo, title, revNo = 0 }) {
  const tail = String(referenceNo || '').split('-').slice(-2).join('-') || Date.now().toString().slice(-4)
  const slug = slugify(title) ? '_' + slugify(title) : ''
  const rev = revNo > 0 ? '_R' + revNo : ''
  return `${projectCode || 'PRJ'}_${kind.toUpperCase()}-${tail}${slug}${rev}.pdf`
}

// Assemble the PDF data object from project defaults + the modal's items/photos.
function inspectionPdfData({ kind, project, esm, building, items, photoFiles, title, generatedBy, referenceNo, storage, installation }) {
  return {
    referenceNo, projectName: project?.name, projectCode: project?.code,
    clientName: project?.client || 'Tarshid', date: localToday(),
    generatedBy: generatedBy || '', region: project?.region || '',
    rev: project?.doc_rev || '00', revDate: localToday(),
    projectRef: project?.project_reference_no || '',
    beneficiary: project?.beneficiary_entity || project?.client || '',
    contractor: project?.contractor_name || '',
    esmNo: esm?.code || '', esmName: title || esm?.name || '',
    items: items || [],
    storageLocation: storage || building?.name || project?.region || '',
    installationLocation: installation || building?.name || project?.region || '',
    attachmentsChecked: (photoFiles && photoFiles.length) ? ['Pictures'] : [],
    photoFiles: photoFiles || [],
  }
}

// Build the PDF bytes for preview (no DB writes, nothing persisted).
export async function buildInspectionPdf(opts) {
  return await generateDocPdf(opts.kind, inspectionPdfData(opts))
}

// Commit: persist the project_documents row (reference_no explicit so it matches
// the previewed PDF), upload the bytes under a traceable path, link storage_path.
export async function commitInspectionDoc({ kind, project, esm, building, userId, referenceNo, revNo = 0, title, storage, installation, bytes, status = 'submitted' }) {
  const { data, error } = await bgInsert('project_documents', {
    project_id: project.id, building_id: building?.id || null, esm_id: esm?.id || null,
    doc_type: kind, name: title || referenceNo, reference_no: referenceNo || null, rev_no: revNo,
    storage_location: storage || null, installation_areas: installation || null,
    revision: 'A', version: 'A', status, submitted_by: userId, submitted_at: new Date().toISOString(),
  })
  if (error || !data?.[0]) return { error: error || { message: 'insert failed' } }
  const docId = data[0].id
  const refNo = data[0].reference_no || referenceNo
  const filename = smartFilename({ projectCode: project?.code, kind, referenceNo: refNo, title, revNo })
  const file = new File([bytes], filename, { type: 'application/pdf' })
  // deterministic, random-free storage key (unique per reference + revision)
  const safeRef = String(refNo || 'doc').replace(/[^A-Za-z0-9._-]/g, '-')
  const key = `${project.id}/${kind}/${safeRef}${revNo > 0 ? '-R' + revNo : ''}.pdf`
  const { path, error: upErr } = await uploadToBucket('project-docs', file, { userId, key })
  if (upErr) return { error: upErr, docId }
  await bgUpdate('project_documents', docId, { storage_path: path })
  return { docId, path, filename, referenceNo: refNo, revNo }
}
