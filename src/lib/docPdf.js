// Tarshid-style document PDFs — MIR (Material & Equipment Inspection Form),
// WIR (Work / Mockup Inspection Form) and COC (ESM Completion Certificate).
// Client-side, English-only. Rendered with pdf-lib's built-in Helvetica
// StandardFonts — no font fetch, no embedding, no subsetting — so the output
// is always legible (Sprint 5 shipped a garbage COC PDF caused by a broken
// embedded-Amiri subset; that whole class of bug is gone). renderDocPdf is
// pure (no I/O) so it stays unit-testable; generateDocPdf decodes any photos.

const A4 = [595.28, 841.89]
const M = 36
const GREEN = [0.17, 0.48, 0.29]   // Tarshid brand green (#2C7A4B)
const DARK = [0.06, 0.09, 0.16]
const GREY = [0.42, 0.47, 0.53]
const LINE = [0.82, 0.85, 0.89]

const TITLES = {
  mir: 'MATERIAL & EQUIPMENT INSPECTION FORM',
  wir: 'WORK / MOCKUP INSPECTION FORM',
  coc: 'COMPLETION CERTIFICATE',
}
const ATTACHMENTS = {
  mir: ['Specification', 'Sample', 'Approved Shop Drawing', 'Detailed Drawings', 'Photos', 'Inspection Report', 'Sample Test Report', 'BOQ Reference', 'Other'],
  wir: ['Specification', 'Sample', 'Approved Shop Drawing', 'Detailed Drawings', 'Photos', 'Inspection Report', 'Sample Test Report', 'BOQ Reference', 'Other'],
  coc: ['Snag List Clearance Report', 'BOQ Reference', 'Approved MIR', 'Approved WIR', 'Photos', 'Updated Snag List Clearance Report'],
}
// signature columns: [organization, prefilled name]
const SIG_INSPECTION = [['ESCO', ''], ['TARSHID', ''], ['TARSHID', ''], ['Beneficiary Entity', ''], ['Contractor', '']]
const SIG_COC = [['ESCO', 'To Be Provided'], ['TARSHID - SPM', 'Sultan Al Ruwais'], ['TARSHID - Tech', 'Dr Mohammad Muaafa'], ['Beneficiary Entity', 'To Be Provided'], ['Contractor', 'To Be Provided']]

// Helvetica StandardFont uses WinAnsi encoding; map anything outside it to a
// safe ASCII equivalent so drawText can never throw on an unencodable glyph.
function safe(s) {
  return String(s ?? '')
    .replace(/[–—]/g, '-')   // en/em dash
    .replace(/[‘’]/g, "'")   // curly single quotes
    .replace(/[“”]/g, '"')   // curly double quotes
    .replace(/…/g, '...')          // ellipsis
    .replace(/[•·]/g, '-')   // bullet / middot
    .replace(/[←-⇿]/g, '-')  // arrows
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ]/g, '')
}

export async function generateDocPdf(kind, data) {
  // decode any uploaded photos (File or {bytes,type}) to raw bytes for embedding
  let photos = []
  if (Array.isArray(data.photoFiles) && data.photoFiles.length) {
    photos = await Promise.all(data.photoFiles.map(async (f) => ({
      bytes: new Uint8Array(await f.arrayBuffer()),
      type: (f.type || '').toLowerCase(),
    })))
  } else if (Array.isArray(data.photos)) {
    photos = data.photos
  }
  return renderDocPdf(kind, { ...data, photos })
}

export async function renderDocPdf(kind, data) {
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const col = (c) => rgb(c[0], c[1], c[2])
  const W = A4[0] - 2 * M
  let page, y, pageNo = 0
  const newPage = () => { page = pdf.addPage(A4); y = A4[1] - M }

  const text = (s, x, yy, { size = 9, f = font, color = DARK, align = 'left', maxW } = {}) => {
    let str = safe(s)
    if (maxW) { while (str.length > 1 && f.widthOfTextAtSize(str, size) > maxW) str = str.slice(0, -1) }
    const w = f.widthOfTextAtSize(str, size)
    let xx = x
    if (align === 'right') xx = x - w
    if (align === 'center') xx = x - w / 2
    page.drawText(str, { x: xx, y: yy, size, font: f, color: col(color) })
  }
  const rect = (x, yy, w, h, c = LINE, fill) => page.drawRectangle({ x, y: yy, width: w, height: h, borderColor: col(c), borderWidth: 0.7, ...(fill ? { color: col(fill) } : {}) })
  const ensure = (need) => { if (y - need < M + 24) { footer(); newPage() } }
  const footer = () => { pageNo += 1; text(`${(data.docNo || kind.toUpperCase())}  ${data.projectCode || ''}  ${data.date || ''}`.trim(), M, 22, { size: 7, color: GREY }); text(`Page ${pageNo}`, A4[0] - M, 22, { size: 7, color: GREY, align: 'right' }) }

  const heading = (label) => { ensure(24); rect(M, y - 16, W, 18, GREEN, GREEN); text(label, M + 6, y - 12, { size: 9, f: bold, color: [1, 1, 1] }); y -= 24 }
  const kv = (k, v) => { ensure(15); text(k, M, y, { size: 8.5, f: bold }); text(v == null || v === '' ? '-' : v, M + 150, y, { size: 8.5, maxW: W - 155 }); y -= 13 }
  const para = (s) => { ensure(16); text(s || '-', M, y, { size: 8.5, maxW: W }); y -= 14 }

  const twoCells = (l1, v1, l2, v2) => {
    ensure(42); const w = (W - 8) / 2
    rect(M, y - 38, w, 40); rect(M + w + 8, y - 38, w, 40)
    text(l1, M + 5, y - 10, { size: 8, f: bold, color: GREEN }); text(v1 || '', M + 5, y - 26, { size: 8, maxW: w - 10 })
    text(l2, M + w + 13, y - 10, { size: 8, f: bold, color: GREEN }); text(v2 || '', M + w + 13, y - 26, { size: 8, maxW: w - 10 })
    y -= 46
  }
  // checked = set/array of attachment labels whose box should be filled
  const checkboxes = (items, checked) => {
    const chk = checked instanceof Set ? checked : new Set(checked || [])
    ensure(Math.ceil(items.length / 3) * 16 + 4)
    const colW = W / 3; let ax = M, row = 0
    items.forEach((it, i) => {
      if (i > 0 && i % 3 === 0) { row += 1; ax = M }
      const yy = y - row * 16
      rect(ax, yy - 9, 9, 9)
      if (chk.has(it)) { rect(ax + 1.5, yy - 7.5, 6, 6, GREEN, GREEN); }
      text(it, ax + 13, yy - 7, { size: 7.5, maxW: colW - 18 })
      ax += colW
    })
    y -= (row + 1) * 16 + 6
  }
  const commentsBox = (label, withChoice) => {
    ensure(60); text(label, M, y, { size: 8.5, f: bold, color: GREEN }); y -= 12
    if (withChoice) {
      const opts = ['A - Accepted', 'B - Accepted with Comments', 'C - Resubmit']; let ax = M
      opts.forEach((o) => { rect(ax, y - 9, 9, 9); text(o, ax + 13, y - 7, { size: 7.5 }); ax += W / 3 })
      y -= 16
    }
    rect(M, y - 34, W, 36); y -= 42
  }
  const signatures = (cols) => {
    ensure(96); const cw = W / cols.length
    const rowsL = ['Organization', 'Name', 'Designation', 'Signature', 'Date']
    rowsL.forEach((rl, ri) => {
      const yy = y - ri * 18
      cols.forEach((c, ci) => {
        const x = M + ci * cw
        rect(x, yy - 16, cw, 18)
        if (ci === 0) text(rl, x - 2, yy - 12, { size: 6.5, color: GREY, align: 'right' })
        if (ri === 0) text(c[0], x + 4, yy - 12, { size: 7, f: bold, maxW: cw - 8 })
        if (ri === 1 && c[1]) text(c[1], x + 4, yy - 12, { size: 7, maxW: cw - 8 })
      })
    })
    y -= 96
  }
  // embed uploaded photos in a 2-column grid, scaled to fit
  const photoGrid = async (photos) => {
    if (!photos || !photos.length) return
    heading('PHOTOS')
    const cols = 2, gap = 8, cellW = (W - gap) / cols, cellH = 130
    let i = 0
    for (const p of photos) {
      let img = null
      try {
        if (p.type.includes('png')) img = await pdf.embedPng(p.bytes)
        else img = await pdf.embedJpg(p.bytes)
      } catch { continue }
      if (i % cols === 0) ensure(cellH + 6)
      const cIdx = i % cols
      const x = M + cIdx * (cellW + gap)
      const dims = img.scaleToFit(cellW - 6, cellH - 6)
      page.drawImage(img, { x: x + 3, y: y - cellH + 3 + (cellH - 6 - dims.height) / 2, width: dims.width, height: dims.height })
      rect(x, y - cellH, cellW, cellH)
      if (cIdx === cols - 1) y -= cellH + gap
      i += 1
    }
    if (i % cols !== 0) y -= cellH + gap
  }

  // ── render ──────────────────────────────────────────────────────────────
  newPage()
  rect(M, y - 26, 64, 26, GREEN, GREEN); text('TARSHID', M + 8, y - 16, { size: 9, f: bold, color: [1, 1, 1] })
  text('National Energy Services Company', M + 74, y - 10, { size: 9, f: bold, color: GREEN })
  const titleStr = kind === 'coc'
    ? `Energy Saving Measure (${data.esmNo || 'ESM'}) Completion Certificate`
    : TITLES[kind]
  text(titleStr, A4[0] - M, y - 22, { size: kind === 'coc' ? 9.5 : 11, f: bold, align: 'right', maxW: W - 80 })
  y -= 34
  text(`${kind.toUpperCase()} No: ${data.docNo || '-'}`, M, y, { size: 9, f: bold, color: GREEN })
  text(`Revision ${data.revision || 'A'}`, A4[0] - M, y, { size: 9, f: bold, align: 'right' }); y -= 12

  heading('PROJECT INFORMATION')
  kv('Project Name', data.projectName)
  if (data.projectCode) kv('Project ID', data.projectCode)
  kv('Client Name', data.clientName || 'Tarshid')
  kv('Date', data.date)
  if (data.generatedBy) kv('Generated By', data.generatedBy)
  if (data.poRef) kv('PO / Contract Ref', data.poRef)
  if (kind === 'coc' && data.region) kv('Region / City', data.region)

  heading(kind === 'coc' ? 'DESCRIPTION OF ESM' : 'DESCRIPTION')
  kv('ESM', `${data.esmNo || ''}  ${data.esmName || ''}`.trim())
  if (data.brief) para(data.brief)
  if (kind === 'coc' && data.totalBoqs) kv('Total BoQs', data.totalBoqs)
  ;(data.installed || []).forEach((it) => para(`- ${it.item_description || ''}${it.model_code ? ' (' + it.model_code + ')' : ''} - Qty ${it.total_quantity ?? ''}${it.capacity_value != null ? ', ' + it.capacity_value + ' ' + (it.capacity_unit || '') : ''}${it.efficiency_value != null ? ', ' + it.efficiency_value + ' ' + (it.efficiency_unit || '') : ''}`))

  if (kind === 'coc') {
    heading('BUILDINGS')
    if (data.buildingList && data.buildingList.length) data.buildingList.forEach((b) => para(`- ${b}`))
    else para(data.buildingIds || data.location || '-')
  } else {
    twoCells('STORAGE LOCATION', data.storageLocation, 'INSTALLATION LOCATION', data.installationLocation)
  }

  heading('ATTACHMENTS'); checkboxes(ATTACHMENTS[kind], data.attachmentsChecked)

  await photoGrid(data.photos)

  if (kind === 'coc') {
    commentsBox("TARSHID's COMMENTS", true)
    commentsBox('Beneficiary Entity COMMENTS', true)
  } else {
    commentsBox("TARSHID's COMMENTS", false)
    commentsBox('Beneficiary Entity COMMENTS', false)
    commentsBox('Contractor COMMENTS', false)
    kv('Expected Re-submission Date', data.expectedResubmission)
  }

  ensure(124) // keep the APPROVAL heading together with its signature grid
  heading('APPROVAL - signatures to be completed on the printed copy')
  signatures(kind === 'coc' ? SIG_COC : SIG_INSPECTION)
  footer()
  return await pdf.save()
}
