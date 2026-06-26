// Tarshid official-template PDFs.
//  • MIR / WIR  — English "Material & Equipment / Work Inspection Form".
//  • COC        — bilingual "محضر إكتمال أعمال التركيب" (Arabic labels, English values).
// Faithful to the official templates: embedded Tarshid logo, pale-blue inspection
// bars (#B9CCEA), teal COC bars (#6ECCCE), official field set, attachments and
// signature blocks. Latin text uses Helvetica StandardFonts; Arabic uses the
// embedded Amiri TTF (subset:false — the Sprint-5 garbage came from subsetting)
// with arabic-reshaper for contextual joining + RTL ordering.

const A4 = [595.28, 841.89]
const M = 34
const BAR_BLUE = [0.726, 0.800, 0.918] // #B9CCEA  inspection section bars
const TEAL = [0.431, 0.800, 0.808]     // #6ECCCE  COC section bars
const GREEN = [0.17, 0.55, 0.30]       // brand green (corner motif)
const DARK = [0.06, 0.09, 0.16]
const GREY = [0.42, 0.47, 0.53]
const LINE = [0.72, 0.76, 0.82]

const ATTACH_INSPECTION = ['Specification', 'Sample', 'Approved Shop Drawing', 'BOQ Reference', 'Pictures', 'Valid SASO/Saber', 'Approved Material Submittal', 'Test Reports', 'Other']

// Arabic label vocabulary for the COC (kept here so the rest reads cleanly).
const AR = {
  title: 'محضر إكتمال أعمال التركيب',
  projInfo: 'معلومات المشروع',
  projName: 'اسم المشروع', projNo: 'رقم المشروع', contractDate: 'تاريخ توقيع العقد',
  endDate: 'تاريخ انتهاء الأعمال', esco: 'شركة خدمات الطاقة', sub: 'مقاول الباطن (إن وجد)',
  bldgNo: 'رقم المبنى', entity: 'اسم الجهة/المبنى', bldgType: 'نوع المبنى',
  region: 'المنطقة التي يوجد بها المبنى', city: 'المدينة والحي', coords: 'إحداثيات المبنى',
  workDesc: 'وصف العمل',
  installedLighting: 'أنواع وكميات بنود الإنارة التي تم تركيبها',
  installedControl: 'أنواع وكميات بنود التحكم بالإنارة التي تم تركيبها',
  installedOther: 'أنواع وكميات البنود الأخرى التي تم تركيبها',
  removedTitle: 'أنواع وكميات بنود الإنارة التي تم إزالتها',
  itemNo: 'رقم البند', itemDesc: 'وصف البند', qty: 'الكمية', power: 'القدرة', returned: 'تم إعادتها إلى الجهة',
  opHours: 'ساعات التشغيل', perLetter: 'حسب خطاب الجهة',
  elec: 'معلومات شركة الكهرباء', meter: 'رقم عداد شركة الكهرباء', subscription: 'رقم الاشتراك بشركة الكهرباء', account: 'رقم حساب شركة الكهرباء',
  attachments: 'مرفقات', approval: 'الاعتماد',
  specs: 'مواصفات', samples: 'عينات', drawings: 'مخططات تفصيلية', photos: 'صور', boq: 'مرجع للكميات', testReport: 'تقرير إختبار عينات', inspReport: 'تقرير فحص عينات', other: 'أخرى',
  govRep: 'ممثل الجهة الحكومية', tarshid: 'الشركة الوطنية لخدمات كفاءة الطاقة', contractor: 'الشركة المنفذة',
  name: 'الإسم', role: 'الوظيفة', signature: 'التوقيع', date: 'التاريخ',
  yes: 'نعم', no: 'لا',
}

let _amiri = null
async function loadAmiri() {
  if (_amiri) return _amiri
  const base = import.meta.env.BASE_URL || '/'
  const [reg, bold] = await Promise.all([
    fetch(base + 'fonts/Amiri-Regular.ttf').then((r) => r.arrayBuffer()),
    fetch(base + 'fonts/Amiri-Bold.ttf').then((r) => r.arrayBuffer()),
  ])
  _amiri = { reg, bold }
  return _amiri
}
let _logo = null
async function loadLogo() {
  if (_logo !== null) return _logo
  try { _logo = await fetch((import.meta.env.BASE_URL || '/') + 'tarshid-logo.png').then((r) => r.arrayBuffer()) }
  catch { _logo = false }
  return _logo
}

export async function generateDocPdf(kind, data) {
  let photos = []
  if (Array.isArray(data.photoFiles) && data.photoFiles.length) {
    photos = await Promise.all(data.photoFiles.map(async (f) => ({ bytes: new Uint8Array(await f.arrayBuffer()), type: (f.type || '').toLowerCase() })))
  } else if (Array.isArray(data.photos)) photos = data.photos
  const logo = await loadLogo()
  if (kind === 'coc') { const am = await loadAmiri(); return renderCoc({ ...data, photos }, { logo, amiri: am }) }
  return renderInspection(kind, { ...data, photos }, { logo })
}

// WinAnsi-safe Latin sanitizer (Helvetica can't encode some Unicode punctuation).
function safe(s) {
  return String(s ?? '').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[•·]/g, '-').replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ]/g, '')
}

// ── shared low-level primitives over a mutable page cursor ──────────────────
function primitives(pdf, rgb, fonts) {
  const st = { page: null, y: 0, pageNo: 0 }
  const col = (c) => rgb(c[0], c[1], c[2])
  const W = A4[0] - 2 * M
  const newPage = () => { st.page = pdf.addPage(A4); st.y = A4[1] - M; st.pageNo += 1 }
  const rect = (x, y, w, h, c = LINE, fill, bw = 0.7) => st.page.drawRectangle({ x, y, width: w, height: h, borderColor: col(c), borderWidth: bw, ...(fill ? { color: col(fill) } : {}) })
  const ltr = (s, x, y, { size = 9, f = fonts.helv, color = DARK, align = 'left', maxW } = {}) => {
    let str = safe(s)
    if (maxW) while (str.length > 1 && f.widthOfTextAtSize(str, size) > maxW) str = str.slice(0, -1)
    const w = f.widthOfTextAtSize(str, size)
    const xx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x
    st.page.drawText(str, { x: xx, y, size, font: f, color: col(color) })
  }
  // Arabic: reshape → reverse for RTL → draw ending at xRight (right-aligned).
  const rtl = (s, xRight, y, { size = 9, bold = false, color = DARK } = {}) => {
    if (!fonts.ar) return
    const f = bold ? fonts.arB : fonts.ar
    const t = fonts.reshape(String(s ?? '')).split('').reverse().join('')
    const w = f.widthOfTextAtSize(t, size)
    st.page.drawText(t, { x: xRight - w, y, size, font: f, color: col(color) })
  }
  return { st, col, W, newPage, rect, ltr, rtl }
}

// ── MIR / WIR (English, pale-blue bars) ────────────────────────────────────
export async function renderInspection(kind, data, assets) {
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const helvB = await pdf.embedFont(StandardFonts.HelveticaBold)
  const helvI = await pdf.embedFont(StandardFonts.HelveticaOblique)
  const logo = assets.logo ? await pdf.embedPng(assets.logo).catch(() => null) : null
  const P = primitives(pdf, rgb, { helv, helvB, helvI })
  const { st, W, newPage, rect, ltr } = P
  const ensure = (need) => { if (st.y - need < M + 26) { footer(); newPage() } }
  const footer = () => { ltr(`Page ${st.pageNo}`, A4[0] / 2, 20, { size: 8, color: GREY, align: 'center', f: helv }); ltr('PMT-003-V1', A4[0] - M, 14, { size: 7.5, color: GREY, align: 'right' }) }
  const bar = (label) => { ensure(22); rect(M, st.y - 16, W, 16, BAR_BLUE, BAR_BLUE, 0); ltr(label, M + 6, st.y - 12, { size: 8.5, f: helvB }); st.y -= 22 }
  const titleBar = (label) => { rect(M, st.y - 22, W, 22, BAR_BLUE, BAR_BLUE, 0); rect(M, st.y - 22, W, 22, LINE); ltr(label, A4[0] / 2, st.y - 15, { size: 11, f: helvB, align: 'center' }); st.y -= 28 }

  newPage()
  // header: green corner motif + Tarshid logo top-right
  st.page.drawSvgPath('M0 0 L46 0 L0 46 Z', { x: M, y: A4[1] - M + 8, color: P.col(GREEN), scale: 1 })
  st.page.drawSvgPath('M10 14 L40 14 L25 36 Z', { x: M, y: A4[1] - M + 6, color: rgb(1, 1, 1) })
  if (logo) { const lw = 112, lh = (logo.height / logo.width) * lw; st.page.drawImage(logo, { x: A4[0] - M - lw, y: A4[1] - M - lh + 4, width: lw, height: lh }) }
  st.y = A4[1] - M - 66

  if (data.referenceNo) ltr(`Ref No: ${data.referenceNo}`, A4[0] - M, st.y, { size: 8.5, f: helvB, color: GREEN, align: 'right' })
  st.y -= 6
  titleBar(kind === 'mir' ? 'MATERIAL & EQUIPMENT INSPECTION FORM (MIR)' : 'WORK INSPECTION FORM (WIR)')

  // project-information block (two bordered columns)
  const boxH = 78, half = W / 2
  rect(M, st.y - boxH, half, boxH); rect(M + half, st.y - boxH, half, boxH)
  const L = [['Project', data.projectName], ['Rev', data.rev || '00'], ['Project Reference No', data.projectRef], ['Rev Date', data.revDate || data.date], ['Beneficiary Entity', data.beneficiary || data.clientName], ['Prepared by', data.generatedBy]]
  const R = [['Project Supervised by', 'Tarshid'], ['Date', data.date], ['Contractor', data.contractor], ['Signature', '']]
  let ly = st.y - 13
  L.forEach(([k, v]) => { ltr(`${k}:`, M + 6, ly, { size: 8, f: helvB }); ltr(v || '', M + 6 + helvB.widthOfTextAtSize(`${k}: `, 8), ly, { size: 8, f: helvI, maxW: half - 12 - helvB.widthOfTextAtSize(`${k}: `, 8) }); ly -= 11.5 })
  ly = st.y - 13
  R.forEach(([k, v]) => { ltr(`${k}:`, M + half + 6, ly, { size: 8, f: helvB }); ltr(v || '', M + half + 6 + helvB.widthOfTextAtSize(`${k}: `, 8), ly, { size: 8, f: helvI }); ly -= 11.5 })
  st.y -= boxH + 6

  // description — ESM line + multi-item table
  bar('DESCRIPTION:')
  if (data.esmName || data.brief || data.esmNo) { ensure(14); ltr(`${data.esmNo ? data.esmNo + ' - ' : ''}${data.esmName || data.brief || ''}`, M + 4, st.y, { size: 8.5, f: helvB, maxW: W - 8 }); st.y -= 14 }
  // normalize items: prefer the multi-item list, fall back to installed-items
  const items = (data.items && data.items.length)
    ? data.items
    : (data.installed || []).map((it) => ({ description: it.item_description, brand: it.brand || '', model: it.model_code, qty: it.total_quantity, unit: it.capacity_unit, notes: '' }))
  // item table with header row (# / Description / Brand / Model / Qty)
  const cols = [{ w: 24, h: '#' }, { w: W - 24 - 96 - 96 - 56, h: 'DESCRIPTION' }, { w: 96, h: 'BRAND' }, { w: 96, h: 'MODEL' }, { w: 56, h: 'QTY' }]
  ensure(15); let hx = M
  cols.forEach((c) => { rect(hx, st.y - 14, c.w, 14, LINE, [0.93, 0.95, 0.98]); ltr(c.h, hx + 4, st.y - 10, { size: 7, f: helvB, color: GREY }); hx += c.w })
  st.y -= 14
  items.forEach((it, i) => {
    ensure(14); let cx = M
    const vals = [String(i + 1), it.description || '', it.brand || '', it.model || '', `${it.qty ?? ''}${it.unit ? ' ' + it.unit : ''}`]
    cols.forEach((c, ci) => { rect(cx, st.y - 13, c.w, 13); ltr(vals[ci], cx + 4, st.y - 10, { size: 7.5, maxW: c.w - 7 }); cx += c.w })
    st.y -= 13
  })
  if (!items.length) { ensure(14); ltr('(No items added)', M + 4, st.y - 4, { size: 8, color: GREY }); st.y -= 14 }
  st.y -= 4

  // storage & installation
  bar('STORAGE & INSTALLATION LOCATION/S:')
  ensure(34); rect(M, st.y - 30, half, 32); rect(M + half, st.y - 30, half, 32)
  ltr('Storage:', M + 5, st.y - 11, { size: 8, f: helvB }); ltr(data.storageLocation || '', M + 5 + helvB.widthOfTextAtSize('Storage: ', 8), st.y - 11, { size: 8, f: helvI, maxW: half - 50 })
  ltr('Installation:', M + half + 5, st.y - 11, { size: 8, f: helvB }); ltr(data.installationLocation || '', M + half + 5, st.y - 23, { size: 8, f: helvI, maxW: half - 60 })
  const totQty = items.reduce((s, i) => s + (Number(i.qty) || 0), 0)
  if (totQty) ltr(`Qty: ${totQty}`, M + W - 5, st.y - 23, { size: 8, f: helvB, align: 'right' })
  st.y -= 38

  // attachments
  bar('ATTACHMENTS:')
  const checked = new Set(data.attachmentsChecked || [])
  ensure(40); const perRow = 5, cw = W / perRow
  ATTACH_INSPECTION.forEach((it, i) => {
    const row = Math.floor(i / perRow), cx = M + (i % perRow) * cw, cy = st.y - row * 16
    rect(cx, cy - 9, 9, 9); if (checked.has(it)) rect(cx + 1, cy - 8, 7, 7, DARK, DARK)
    ltr(it, cx + 13, cy - 7, { size: 7, maxW: cw - 16 })
  })
  st.y -= Math.ceil(ATTACH_INSPECTION.length / perRow) * 16 + 6

  // photos grid (2-up, captioned, auto-paginated)
  const photos = data.photos || []
  if (photos.length) {
    bar('PHOTOS:')
    const pcols = 2, gap = 8, cellW = (W - gap) / pcols, imgH = 124, capH = 12, cellH = imgH + capH
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i]
      let img = null
      try { img = (p.type || '').includes('png') ? await pdf.embedPng(p.bytes) : await pdf.embedJpg(p.bytes) } catch { continue }
      const cIdx = i % pcols
      if (cIdx === 0) ensure(cellH + 4)
      const x = M + cIdx * (cellW + gap)
      rect(x, st.y - cellH, cellW, cellH)
      const dim = img.scaleToFit(cellW - 8, imgH - 8)
      st.page.drawImage(img, { x: x + (cellW - dim.width) / 2, y: st.y - capH - imgH + (imgH - dim.height) / 2, width: dim.width, height: dim.height })
      ltr(`Photo ${i + 1} of ${photos.length}`, x + cellW / 2, st.y - cellH + 3, { size: 6.5, color: GREY, align: 'center' })
      if (cIdx === pcols - 1) st.y -= cellH + gap
    }
    if (photos.length % pcols !== 0) st.y -= cellH + gap
  }

  // comments
  bar("TARSHID's COMMENTS:")
  ensure(40); rect(M, st.y - 38, W, 40); st.y -= 46

  footer()
  return await pdf.save()
}

// ── COC (bilingual Arabic, teal bars) ──────────────────────────────────────
export async function renderCoc(data, assets) {
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  const fontkit = (await import('@pdf-lib/fontkit')).default
  const reshaperMod = (await import('arabic-reshaper'))
  const reshaper = { convertArabic: reshaperMod.convertArabic || reshaperMod.default?.convertArabic || ((s) => s) }
  pdf.registerFontkit(fontkit)
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const helvB = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ar = await pdf.embedFont(assets.amiri.reg, { subset: false })
  const arB = await pdf.embedFont(assets.amiri.bold, { subset: false })
  const logo = assets.logo ? await pdf.embedPng(assets.logo).catch(() => null) : null
  const reshape = (s) => reshaper.convertArabic(String(s ?? ''))
  const P = primitives(pdf, rgb, { helv, helvB, ar, arB, reshape })
  const { st, W, newPage, rect, ltr, rtl } = P
  const right = A4[0] - M
  const ensure = (need) => { if (st.y - need < M + 26) { footer(); newPage() } }
  const footer = () => { ltr(`Page ${st.pageNo}`, A4[0] / 2, 20, { size: 8, color: GREY, align: 'center' }); ltr(`${data.docNo || 'COC'}  ${data.date || ''}`, M, 20, { size: 7.5, color: GREY }) }
  const bar = (label) => { ensure(22); rect(M, st.y - 17, W, 17, TEAL, TEAL, 0); rtl(label, right - 6, st.y - 13, { size: 9.5, bold: true, color: [1, 1, 1] }); st.y -= 23 }

  newPage()
  if (logo) { const lw = 112, lh = (logo.height / logo.width) * lw; st.page.drawImage(logo, { x: A4[0] - M - lw, y: A4[1] - M - lh + 4, width: lw, height: lh }) }
  st.y = A4[1] - M - 44
  if (data.referenceNo) ltr(`Ref No: ${data.referenceNo}`, A4[0] - M, st.y, { size: 8.5, f: helvB, color: GREEN, align: 'right' })
  st.y -= 8
  rtl(AR.title, A4[0] / 2 + arB.widthOfTextAtSize(reshape(AR.title).split('').reverse().join(''), 15) / 2, st.y, { size: 15, bold: true })
  st.y -= 20

  // project information (two columns: right = project, left = building)
  bar(AR.projInfo)
  const half = W / 2
  const proj = [[AR.projName, data.projectName], [AR.projNo, data.projectCode], [AR.contractDate, data.contractDate], [AR.endDate, data.endDate], [AR.esco, data.esco || 'Tarshid'], [AR.sub, data.subcontractor]]
  const bldg = [[AR.bldgNo, data.buildingIds], [AR.entity, data.clientName], [AR.bldgType, data.buildingType], [AR.region, data.region], [AR.city, data.city], [AR.coords, data.coords]]
  const rowsN = Math.max(proj.length, bldg.length), boxH = rowsN * 13 + 6
  rect(M, st.y - boxH, half, boxH); rect(M + half, st.y - boxH, half, boxH)
  let py = st.y - 13
  proj.forEach(([k, v]) => { rtl(k + ' :', right - 4, py, { size: 8, bold: true }); ltr(v || '', M + half + 6, py, { size: 8, maxW: half - 110 }); py -= 13 })
  let by = st.y - 13
  bldg.forEach(([k, v]) => { rtl(k + ' :', M + half - 4, by, { size: 8, bold: true }); ltr(v || '', M + 6, by, { size: 8, maxW: half - 110 }); by -= 13 })
  st.y -= boxH + 6

  // work description
  bar(AR.workDesc)
  ensure(16); ltr(data.brief || data.workDescription || '', M + 6, st.y - 2, { size: 9, maxW: W - 12 }); st.y -= 18

  // installed item tables, split by ESM bundle role
  const ins = data.installed || []
  const lighting = ins.filter((i) => i.esm_code === 'ESM1')
  const control = ins.filter((i) => i.esm_code === 'ESM2')
  const other = ins.filter((i) => !['ESM1', 'ESM2'].includes(i.esm_code))
  // RTL item table: columns right→left = [no, desc, qty, power]
  const itemTable = (titleAr, list, withReturned) => {
    if (!list.length) return
    bar(titleAr)
    const cols = withReturned
      ? [{ w: 40, h: AR.itemNo }, { w: W - 200, h: AR.itemDesc }, { w: 50, h: AR.qty }, { w: 50, h: AR.power }, { w: 60, h: AR.returned }]
      : [{ w: 40, h: AR.itemNo }, { w: W - 150, h: AR.itemDesc }, { w: 50, h: AR.qty }, { w: 60, h: AR.power }]
    // header row (right to left)
    ensure(16); let x = right
    cols.forEach((c) => { rect(x - c.w, st.y - 14, c.w, 14, LINE, [0.93, 0.96, 0.97]); rtl(c.h, x - 3, st.y - 10, { size: 7, bold: true }); x -= c.w })
    st.y -= 14
    list.forEach((it, i) => {
      ensure(14); let cx = right
      const vals = withReturned
        ? [String(i + 1), `${it.item_description || ''}${it.model_code ? ' ' + it.model_code : ''}`, String(it.total_quantity ?? ''), `${it.capacity_value ?? ''}${it.capacity_unit || ''}`, it.returned_to_facility ? AR.yes : AR.no]
        : [String(i + 1), `${it.item_description || ''}${it.model_code ? ' ' + it.model_code : ''}`, String(it.total_quantity ?? ''), `${it.capacity_value ?? ''}${it.capacity_unit || ''}`]
      cols.forEach((c, ci) => {
        rect(cx - c.w, st.y - 13, c.w, 13)
        const v = vals[ci]
        if (ci === 1) ltr(v, cx - c.w + 3, st.y - 10, { size: 7.5, maxW: c.w - 6 }) // description LTR (English)
        else if (ci === 4) rtl(v, cx - 3, st.y - 10, { size: 7.5 }) // returned (Arabic yes/no)
        else ltr(v, cx - c.w / 2, st.y - 10, { size: 7.5, align: 'center' })
        cx -= c.w
      })
      st.y -= 13
    })
    st.y -= 4
  }
  itemTable(AR.installedLighting, lighting)
  itemTable(AR.installedControl, control)
  itemTable(AR.installedOther, other)
  itemTable(AR.removedTitle, data.removed || [], true)

  // operating hours + electricity company info
  bar(AR.opHours); ensure(14); rtl(AR.perLetter, right - 6, st.y - 2, { size: 8 }); st.y -= 16
  bar(AR.elec)
  ;[[AR.meter, data.meterNo], [AR.subscription, data.subscriptionNo], [AR.account, data.accountNo]].forEach(([k, v]) => {
    ensure(15); rect(M, st.y - 13, W, 14); rtl(k + ' :', right - 6, st.y - 10, { size: 8, bold: true }); ltr(v || '', M + 6, st.y - 10, { size: 8 }); st.y -= 14
  })
  st.y -= 4

  // attachments (Arabic checklist) — caller passes stable English ids to tick
  bar(AR.attachments)
  const cocAtt = [['specs', AR.specs], ['samples', AR.samples], ['drawings', AR.drawings], ['photos', AR.photos], ['boq', AR.boq], ['testReport', AR.testReport], ['inspReport', AR.inspReport], ['other', AR.other]]
  const checked = new Set(data.attachmentsChecked || [])
  ensure(36); const perRow = 4, cw = W / perRow
  cocAtt.forEach(([id, label], i) => {
    const row = Math.floor(i / perRow), cxR = right - (i % perRow) * cw, cy = st.y - row * 16
    rect(cxR - 9, cy - 9, 9, 9); if (checked.has(id)) rect(cxR - 8, cy - 8, 7, 7, DARK, DARK)
    rtl(label, cxR - 13, cy - 7, { size: 7.5 })
  })
  st.y -= Math.ceil(cocAtt.length / perRow) * 16 + 6

  // approval — 3 columns (Govt entity / Tarshid / Contractor) × name/role/sig/date
  bar(AR.approval)
  ensure(96)
  const colsApp = [AR.govRep, AR.tarshid, AR.contractor] // displayed right→left
  const cwid = W / 3
  const rowsApp = [[AR.name, [data.govName, data.tarshidName, data.contractorName]], [AR.role, [data.govRole, data.tarshidRole, data.contractorRole]], [AR.signature, ['', '', '']], [AR.date, [data.govDate, data.tarshidDate, data.contractorDate]]]
  // header
  let hx = right
  colsApp.forEach((c, ci) => { rect(hx - cwid, st.y - 16, cwid, 16, LINE, [0.93, 0.96, 0.97]); rtl(c, hx - 4, st.y - 12, { size: 7.5, bold: true }); hx -= cwid })
  st.y -= 16
  rowsApp.forEach(([label, vals]) => {
    ensure(18); let cx = right
    colsApp.forEach((_, ci) => {
      rect(cx - cwid, st.y - 18, cwid, 18)
      const v = vals[ci]
      if (v) { if (/[A-Za-z0-9]/.test(v)) ltr(v, cx - cwid + 4, st.y - 12, { size: 7.5, maxW: cwid - 8 }); else rtl(v, cx - 4, st.y - 12, { size: 7.5 }) }
      cx -= cwid
    })
    rtl(label, M - 2, st.y - 12, { size: 6.5, color: GREY }) // row label left margin
    st.y -= 18
  })

  footer()
  return await pdf.save()
}
