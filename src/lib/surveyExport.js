// 9B — Survey Excel export in the ESCO "New Survey" sheet layout (54 columns).
// Manual/survey-captured columns are filled from survey_entries; the COMPUTED
// columns (25 Correct Model, 26 Saving model, and 37-54 "Surveyed Unit
// Description" onward) are left BLANK — those are produced by the Saving Sheet
// (9C). AC-only columns are filled only for category 'ac'. xlsx (SheetJS) is
// loaded lazily so it stays out of the main bundle.
import { signedUrlFor } from './db'
import { localDayKey } from './format'

const PHOTO_BUCKET = 'daily-progress-photos' // survey photos live here, prefix survey/<building_id>/

// Header row, verbatim in ESCO order (1-indexed positions preserved).
export const ESCO_HEADERS = [
  'Sr. No.', 'DATE', 'Project Name', 'Building Name', 'NEW building Name', 'Zone', 'Location',
  'SUB Building', 'New Sub', 'Floor', 'Location (Room Name)', 'Room name Photo', 'Room Type', 'Des',
  'Room width', 'Room height', 'Room Size', 'M2/Ton', 'Room photo "indoor"', 'Plate number Photo',
  'AC Type', 'Make', 'TR', 'Model', 'Correct Model', 'Saving model', 'Qty', 'Equipment Type', 'Make',
  'Size Category', 'Model No', 'Inverter (Y/N)', 'Age', 'Total Quantity (No.)', 'Out door unit Photo',
  'Remarks', 'Surveyed Unit Description', 'Equivalent AC Model Description', 'T1 BTU', 'T1 EER',
  'Equivalent SEER', 'New Unit Description', 'Model Number', 'Brand/ Make', 'Capacity T1 Btu/h',
  'Proposed SEER', 'Savings kWh', 'Baseline kWh', 'Savings %', 'Capacity Check', 'Payback (in Yr.)',
  'In Repl. Scope (Yes/No)', 'AC Type Match Check', 'Calculated EFLH',
]

const dstr = (ts) => { try { return new Date(ts).toISOString().slice(0, 10) } catch { return '' } }
const nz = (v) => (v == null || v === '' ? '' : v)

async function resolvePhotos(entries) {
  const paths = new Set()
  entries.forEach((e) => [e.photo_room_path, e.photo_indoor_path, e.photo_nameplate_path].forEach((p) => p && paths.add(p)))
  const map = {}
  await Promise.all([...paths].map(async (p) => { map[p] = (await signedUrlFor(PHOTO_BUCKET, p)) || '' }))
  return map
}

function rowFor(e, i, projectName, urls) {
  const isAc = e.category === 'ac'
  const m2ton = isAc && e.room_area && e.tr && e.qty ? Math.round((e.room_area / (Number(e.tr) * Number(e.qty))) * 100) / 100 : ''
  // lighting wattage has no dedicated ESCO column -> fold into Remarks
  const remarks = [nz(e.remarks), e.category === 'lighting' && e.wattage != null ? `Wattage: ${e.wattage} W` : '']
    .filter(Boolean).join(e.remarks && e.wattage != null ? ' · ' : '')
  return [
    i + 1,                                    // 1  Sr. No.
    localDayKey(e.created_at),                // 2  DATE (local day — matches the Daily Log grouping; the Attribution sheet stays UTC as labelled)
    projectName || '',                        // 3  Project Name
    e.building?.name || e.building?.code || '', // 4 Building Name
    '', '', '', '', '',                       // 5-9  NEW building / Zone / Location / SUB Building / New Sub (not captured)
    nz(e.floor),                              // 10 Floor
    nz(e.room_name),                          // 11 Location (Room Name)
    urls[e.photo_room_path] || '',            // 12 Room name Photo
    nz(e.room_type),                          // 13 Room Type
    '',                                       // 14 Des (not captured)
    nz(e.room_width),                         // 15 Room width
    nz(e.room_height),                        // 16 Room height
    nz(e.room_area),                          // 17 Room Size
    m2ton,                                    // 18 M2/Ton (AC only)
    urls[e.photo_indoor_path] || '',          // 19 Room photo "indoor"
    urls[e.photo_nameplate_path] || '',       // 20 Plate number Photo
    isAc ? nz(e.equipment_type) : '',         // 21 AC Type (AC block)
    isAc ? nz(e.make) : '',                   // 22 Make (AC block)
    isAc ? nz(e.tr) : '',                     // 23 TR
    isAc ? nz(e.model) : '',                  // 24 Model (AC block)
    '',                                       // 25 Correct Model (computed 9C)
    '',                                       // 26 Saving model (computed 9C)
    isAc ? nz(e.qty) : '',                    // 27 Qty (AC block)
    nz(e.equipment_type),                     // 28 Equipment Type (shared)
    nz(e.make),                               // 29 Make (shared)
    nz(e.size_category),                      // 30 Size Category
    nz(e.model),                              // 31 Model No
    isAc ? (e.inverter == null ? '' : (e.inverter ? 'Y' : 'N')) : '', // 32 Inverter (Y/N)
    nz(e.age_years),                          // 33 Age
    nz(e.qty),                                // 34 Total Quantity (No.)
    '',                                       // 35 Out door unit Photo (not captured)
    remarks,                                  // 36 Remarks (+ lighting wattage)
    // 37-54 computed by the Saving Sheet (9C) -> blank
    '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
  ]
}

function attribRow(e) {
  return [e.id, e.building?.name || e.building?.code || '', nz(e.room_name), e.category, nz(e.qty),
    e.author?.full_name || '', dstr(e.created_at) + ' ' + (new Date(e.created_at).toISOString().slice(11, 16)),
    e.editor?.full_name || '', e.updated_at ? dstr(e.updated_at) : '', e.source]
}

// entries: survey_entries rows with embeds building{code,name}, author{full_name}, editor{full_name}
export async function exportSurveyXlsx(entries, { projectName = '', projectCode = '' } = {}) {
  const XLSX = await import('xlsx')
  const urls = await resolvePhotos(entries)
  const main = [ESCO_HEADERS, ...entries.map((e, i) => rowFor(e, i, projectName, urls))]
  const attrib = [
    ['Entry ID', 'Building', 'Room', 'Category', 'Qty', 'Added by', 'Added at (UTC)', 'Updated by', 'Updated at', 'Source'],
    ...entries.map(attribRow),
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(main), 'New Survey')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(attrib), 'Attribution')
  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `survey-${(projectCode || 'export').replace(/[^\w-]/g, '')}-${stamp}.xlsx`)
}
