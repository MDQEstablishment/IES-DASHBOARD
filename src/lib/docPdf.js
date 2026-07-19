// Tarshid official-template PDFs.
//  • MIR / WIR  — English "Material & Equipment / Work Inspection Form".
//  • COC        — bilingual "محضر إكتمال أعمال التركيب" (Arabic labels, English values).
// Faithful to the official templates: embedded Tarshid logo, pale-blue inspection
// bars (#B9CCEA), teal COC bars (#6ECCCE), official field set, attachments and
// signature blocks. Latin text uses Helvetica StandardFonts; Arabic is shaped
// by HarfBuzz WASM (harfbuzzjs) with the Amiri face and painted as vector
// glyph paths (8S P3.5 v2).

const A4 = [595.28, 841.89]
const M = 34
const BAR_BLUE = [0.726, 0.800, 0.918] // #B9CCEA  inspection section bars
const TEAL = [0.431, 0.800, 0.808]     // #6ECCCE  COC section bars
const GREEN = [0.17, 0.55, 0.30]       // brand green (corner motif)
const DARK = [0.06, 0.09, 0.16]
const GREY = [0.42, 0.47, 0.53]
const LINE = [0.72, 0.76, 0.82]

const ATTACH_INSPECTION = ['Specification', 'Sample', 'Approved Shop Drawing', 'BOQ Reference', 'Pictures', 'Valid SASO/Saber', 'Approved Material Submittal', 'Test Reports', 'Other']

// Arabic label vocabulary for the COC — wording matches the signed MONG-D
// samples verbatim (Sprint 8S authoritative templates).
const AR = {
  title: 'محضر إكتمال أعمال التركيب',
  projInfo: 'معلومات المشروع',
  projName: 'اسم المشروع', projNo: 'رقم المشروع', contractDate: 'تاريخ توقيع العقد',
  endDate: 'تاريخ انتهاء الأعمال', esco: 'شركة خدمات الطاقة', sub: 'مقاول الباطن (ان وجد)',
  bldgNo: 'رقم المبنى', entity: 'إسم الجهة/المبنى', bldgType: 'نوع المبنى',
  region: 'المنطقة التي توجد بها المبنى', city: 'المدينة والحي الذي يوجد بها المبنى', coords: 'إحداثيات المبنى',
  workDesc: 'وصف العمل', workDetails: 'تفاصيل العمل',
  installedLighting: 'أنواع وكميات بنود الانارة التي تم تركيبها:',
  installedControl: 'أنواع وكميات بنود التحكم بالإنارة الداخلية التي تم تركيبها:',
  installedOther: 'أنواع وكميات البنود الأخرى التي تم تركيبها:',
  installedAc: 'أنواع وكميات بنود التكييف التي تم تركيبها:',
  removedLighting: 'أنواع وكميات بنود الإنارة التي تم إزالتها:',
  removedAc: 'أنواع وكميات بنود التكييف التي تم إزالتها:',
  removedBar: 'إزالة البنود السابقة (التابعة للمبنى)',
  itemNo: 'رقم البند', itemDesc: 'وصف البند', qty: 'الكمية', power: 'القدرة', returned: 'تم إعادتها إلى الجهة',
  ctrlItem: 'بند التحكم بالإنارة', ctrlRefNo: 'رقم بند الانارة المتحكم بها', ctrlRefDesc: 'وصف بند الإنارة المتحكم بها', ctrlTotal: 'الكمية الاجمالية للإنارة المتحكم بها',
  capacity: 'السعة', efficiency: 'الكفاءة',
  opHours: 'ساعات التشغيل', perLetter: 'حسب خطاب الجهة',
  elec: 'معلومات شركة الكهرباء', meter: 'رقم عداد شركة الكهرباء', subscription: 'رقم الاشتراك الخاص بشركة الكهرباء', account: 'رقم حساب شركة الكهرباء',
  attachments: 'مرفقات', approval: 'الاعتماد',
  specs: 'مواصفات', samples: 'عينات', drawings: 'مخططات تفصيلية', photos: 'صور', boq: 'مرجع للكميات', testReport: 'تقرير إختبار عينات', inspReport: 'تقرير فحص عينات', other: 'أخرى (  )',
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

// HarfBuzz font objects are created once per Amiri face and cached (the wasm
// module exposes no destroy API; loadAmiri caches its bytes, so this runs once).
let _hbFonts = null
async function loadHbFonts(amiri) {
  if (_hbFonts) return _hbFonts
  const hb = await import('harfbuzzjs')
  const toAB = (b) => (b instanceof ArrayBuffer ? b : b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
  const mk = (bytes) => {
    const face = new hb.Face(new hb.Blob(toAB(bytes)))
    return { font: new hb.Font(face), upem: face.upem }
  }
  _hbFonts = { reg: mk(amiri.reg), bold: mk(amiri.bold) }
  return _hbFonts
}

// Parse hb draw-API SVG path output: absolute M/L/Q/Z (C guarded for safety).
function parseHbPath(d) {
  const out = []
  const re = /([MLQCZ])((?:[-\d.,\s]+)?)/g
  let m
  while ((m = re.exec(d)) !== null) {
    const t = m[1]
    const a = (m[2] || '').trim().split(/[\s,]+/).filter(Boolean).map(Number)
    out.push({ t, a })
  }
  return out
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
  // Arabic (8S P3.5 v2): delegate to the HarfBuzz-backed shaper supplied by
  // renderCoc (fonts.arabicDraw) — real GSUB+GPOS joining + RTL layout, drawn
  // as vector paths ending right-aligned at xRight. No-op without a shaper
  // (renderInspection is English-only).
  const rtl = (s, xRight, y, { size = 9, bold = false, color = DARK } = {}) => {
    if (fonts.arabicDraw) fonts.arabicDraw(st.page, String(s ?? ''), xRight, y, size, bold, color)
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
  const bar = (label) => { ensure(30); rect(M, st.y - 16, W, 16, BAR_BLUE, BAR_BLUE, 0); ltr(label, M + 6, st.y - 12, { size: 8.5, f: helvB }); st.y -= 30 } // 8pt breathing room under the bar
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
  st.y -= boxH + 16 // clear gap so the title block doesn't kiss the DESCRIPTION bar

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

  // comments — BEFORE the photos (photos are the final pages)
  bar("TARSHID's COMMENTS:")
  ensure(40); rect(M, st.y - 38, W, 40); st.y -= 46

  // photos — on their own LAST page(s): 2 per page, stacked vertically and large
  const photos = data.photos || []
  const gap = 12, capH = 12
  let pageTop = 0, cellH = 0
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i]
    let img = null
    try { img = (p.type || '').includes('png') ? await pdf.embedPng(p.bytes) : await pdf.embedJpg(p.bytes) } catch { continue }
    if (i % 2 === 0) { // start each pair on a fresh page
      footer(); newPage(); bar('PHOTOS:')
      pageTop = st.y
      cellH = (pageTop - (M + 30) - gap) / 2
    }
    const cellTop = pageTop - (i % 2) * (cellH + gap)
    rect(M, cellTop - cellH, W, cellH)
    const dim = img.scaleToFit(W - 14, cellH - capH - 10)
    st.page.drawImage(img, { x: M + (W - dim.width) / 2, y: cellTop - cellH + capH + ((cellH - capH - dim.height) / 2), width: dim.width, height: dim.height })
    ltr(`Photo ${i + 1} of ${photos.length}`, M + W / 2, cellTop - cellH + 3, { size: 7, color: GREY, align: 'center' })
  }

  footer()
  return await pdf.save()
}

// ── COC (bilingual Arabic, teal bars) — Sprint 8S rewrite ───────────────────
// Layout matches the signed MONG-D samples: per-page Tarshid logo + outer
// border + "Page N of M" footer; teal section bars; plain bold RTL table
// headings; category table sets (lighting/controls/other vs AC kBTU+SEER);
// removed-items bar; operating hours; electricity block; attachments
// checkbox rows (5 + 3); 4-column الاعتماد grid — 8U: rendered BLANK (headers +
// row labels only), signed by TARSHID on paper after this tool hands over the PDF.
//
// data contract (Phase 3 assembles it):
//   referenceNo, date, projectName, projectRefNo, contractDate, endDate,
//   escoOrg, subcontractor, buildingNos, entityName, buildingType, region,
//   city, coords, descriptionLines[], kind 'lighting'|'ac'|'other',
//   installed[], installedControls[], installedOther[], removed[],
//   meterNo, subscriptionNo, accountNo, attachmentsChecked[]
// Items: { description, qty, power, kbtu, seer, returned, ctrlRefNo,
//          ctrlRefDesc, ctrlTotal } (legacy item rows are adapted below).
export async function renderCoc(rawData, assets) {
  const data = normalizeCocData(rawData)
  const { PDFDocument, rgb, StandardFonts, pushGraphicsState, popGraphicsState,
    setFillingColor, moveTo, lineTo, appendBezierCurve, closePath, fill } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const helvB = await pdf.embedFont(StandardFonts.HelveticaBold)
  const logo = assets.logo ? await pdf.embedPng(assets.logo).catch(() => null) : null

  // 8S P3.5 v2 — REAL Arabic shaping via HarfBuzz WASM (harfbuzzjs). This is
  // the same shaping engine Chromium/Firefox use: full GSUB+GPOS joining,
  // ligatures, mark positioning and RTL bracket mirroring, done natively by
  // HarfBuzz itself. Each Arabic run is shaped to glyph ids + positions (in
  // visual order, leftmost-first) and painted as vector paths — no Arabic font
  // is embedded, no reshaper/bidi JS approximations. The wasm ships as a
  // bundled same-origin asset (Vite rewrites new URL(...,import.meta.url)),
  // so generation works offline in the built app.
  const { reg: hbReg, bold: hbBold } = await loadHbFonts(assets.amiri)
  const hb = await import('harfbuzzjs')
  const shapeArabic = (str, bold) => {
    const { font, upem } = bold ? hbBold : hbReg
    const buf = new hb.Buffer()
    buf.addText(String(str ?? ''))
    buf.setDirection(hb.Direction.RTL)
    buf.setScript('Arab')
    buf.setLanguage('ar')
    hb.shape(font, buf)
    return { glyphs: buf.getGlyphInfosAndPositions(), font, upem }
  }
  const arabicWidth = (str, size, bold = false) => {
    const { glyphs, upem } = shapeArabic(str, bold)
    return glyphs.reduce((a, g) => a + g.xAdvance, 0) * size / upem
  }
  // Draw a HarfBuzz-shaped run as filled vector glyph paths, right-aligned to
  // xRight at baseline y. Paths come from hb draw API (absolute M/L/Q/Z, font
  // units, y-up); quadratics are converted to cubics for PDF.
  const glyphPathCache = new Map()
  const arabicDraw = (page, str, xRight, y, size, bold, color) => {
    const { glyphs, font, upem } = shapeArabic(str, bold)
    const s = size / upem
    const total = glyphs.reduce((a, g) => a + g.xAdvance, 0) * s
    let penX = xRight - total
    const fillCol = setFillingColor(rgb(color[0], color[1], color[2]))
    for (const g of glyphs) {
      const key = (bold ? 'b' : 'r') + g.codepoint
      let cmds = glyphPathCache.get(key)
      if (!cmds) { cmds = parseHbPath(font.glyphToPath(g.codepoint)); glyphPathCache.set(key, cmds) }
      const ox = penX + g.xOffset * s, oy = y + g.yOffset * s
      if (cmds.length) {
        const ops = [pushGraphicsState(), fillCol]
        let cx = 0, cy = 0
        for (const c of cmds) {
          const a = c.a
          if (c.t === 'M') { cx = a[0]; cy = a[1]; ops.push(moveTo(ox + cx * s, oy + cy * s)) }
          else if (c.t === 'L') { cx = a[0]; cy = a[1]; ops.push(lineTo(ox + cx * s, oy + cy * s)) }
          else if (c.t === 'Q') {
            const [qx, qy, ex, ey] = a
            const c1x = cx + 2 / 3 * (qx - cx), c1y = cy + 2 / 3 * (qy - cy)
            const c2x = ex + 2 / 3 * (qx - ex), c2y = ey + 2 / 3 * (qy - ey)
            ops.push(appendBezierCurve(ox + c1x * s, oy + c1y * s, ox + c2x * s, oy + c2y * s, ox + ex * s, oy + ey * s))
            cx = ex; cy = ey
          } else if (c.t === 'C') { ops.push(appendBezierCurve(ox + a[0] * s, oy + a[1] * s, ox + a[2] * s, oy + a[3] * s, ox + a[4] * s, oy + a[5] * s)); cx = a[4]; cy = a[5] }
          else if (c.t === 'Z') ops.push(closePath())
        }
        ops.push(fill(), popGraphicsState())
        page.pushOperators(...ops)
      }
      penX += g.xAdvance * s
    }
  }

  const P = primitives(pdf, rgb, { helv, helvB, arabicDraw })
  const { st, W, rect, ltr, rtl } = P
  const right = A4[0] - M
  const TOP = A4[1] - 96 // content starts below the per-page logo zone
  const arWidth = (s, size, bold = false) => arabicWidth(s, size, bold)
  // Centered RTL helper (bars + table headers in the samples are centered)
  const rtlC = (s, xCenter, y, opts = {}) => rtl(s, xCenter + arWidth(s, opts.size || 9, opts.bold) / 2, y, opts)

  const page = () => { st.page = pdf.addPage(A4); st.pageNo += 1; st.y = TOP }
  const ensure = (need) => { if (st.y - need < M + 30) page() }
  // Word-based LTR wrapper (owner-approved: wrap, don't truncate). Returns lines.
  const wrapLtr = (text, size, maxW, f = helv) => {
    const words = safe(text).split(/\s+/).filter(Boolean)
    if (!words.length) return ['']
    const lines = []
    let cur = ''
    words.forEach((w) => {
      const cand = cur ? cur + ' ' + w : w
      if (f.widthOfTextAtSize(cand, size) <= maxW || !cur) cur = cand
      else { lines.push(cur); cur = w }
    })
    lines.push(cur)
    return lines
  }
  const bar = (label) => {
    ensure(34)
    rect(M, st.y - 17, W, 17, TEAL, TEAL, 0)
    rtlC(label, M + W / 2, st.y - 13, { size: 9.5, bold: true, color: DARK })
    st.y -= 25
  }
  // Plain bold right-aligned table heading (NOT a teal bar — matches samples).
  // Reserves heading + table-header space so a heading never orphans at a
  // page's bottom edge.
  const heading = (label) => { ensure(52); rtl(label, right - 2, st.y - 4, { size: 9, bold: true }); st.y -= 18 }

  page()
  // title (page 1 only). Ref No sits at the far LEFT of the title line, well
  // below the logo band (owner: it previously crowded the top-right logo zone).
  // old: ltr(..., M, st.y + 26)  → y ≈ 772pt, inside the logo's 768–812pt band
  // new: ltr(..., M, st.y - 4)   → y ≈ 742pt, left margin, 400pt clear of logo
  if (data.referenceNo) { ltr(`Ref No: ${data.referenceNo}`, M, st.y - 4, { size: 7.5, color: GREY }) }
  rtlC(AR.title, A4[0] / 2, st.y - 4, { size: 14.5, bold: true })
  st.y -= 26

  // ── project information: right box = project, left box = building ─────────
  bar(AR.projInfo)
  const half = W / 2
  const proj = [
    [AR.projName, data.projectName], [AR.projNo, data.projectRefNo],
    [AR.contractDate, data.contractDate], [AR.endDate, data.endDate],
    [AR.esco, data.escoOrg], [AR.sub, data.subcontractor],
  ]
  const bldg = [
    [AR.bldgNo, data.buildingNos], [AR.entity, data.entityName],
    [AR.bldgType, data.buildingType], [AR.region, data.region],
    [AR.city, data.city], [AR.coords, data.coords],
  ]
  // Per-row heights: long English values (project/entity names) wrap instead
  // of truncating (Phase-2 owner decision).
  const infoRowLines = (rows) => rows.map(([k, v]) => {
    const labelW = arWidth(k + ' :', 8.5, true)
    const val = v || ''
    if (/[؀-ۿ]/.test(val)) return { k, val, labelW, lines: [val], rtlVal: true }
    return { k, val, labelW, lines: wrapLtr(val, 8, half - labelW - 16), rtlVal: false }
  })
  const projR = infoRowLines(proj), bldgR = infoRowLines(bldg)
  const rowH = (r) => Math.max(1, r.lines.length) * 11 + 3
  const colH = (rs) => rs.reduce((s, r) => s + rowH(r), 0) + 8
  const boxH = Math.max(colH(projR), colH(bldgR))
  ensure(boxH + 4)
  rect(M, st.y - boxH, half, boxH); rect(M + half, st.y - boxH, half, boxH)
  const drawInfoCol = (rows, xRight) => {
    let y = st.y - 12
    rows.forEach((r) => {
      rtl(r.k + ' :', xRight - 4, y, { size: 8.5, bold: true })
      if (r.rtlVal) rtl(r.val, xRight - 8 - r.labelW, y, { size: 8.5 })
      else r.lines.forEach((ln, li) => ltr(ln, xRight - 8 - r.labelW, y - li * 11, { size: 8, align: 'right' }))
      y -= rowH(r)
    })
  }
  drawInfoCol(projR, right)
  drawInfoCol(bldgR, M + half)
  st.y -= boxH + 8

  // ── work description: numbered English lines, right-aligned "text  -N" ────
  bar(AR.workDesc)
  const descLines = data.descriptionLines.length ? data.descriptionLines : ['']
  descLines.forEach((line, i) => {
    const lns = wrapLtr(line, 9, W - 44, helvB)
    ensure(lns.length * 13 + 4)
    ltr(`-${i + 1}`, right - 4, st.y - 4, { size: 9, f: helvB, align: 'right' })
    lns.forEach((ln, li) => ltr(ln, right - 22, st.y - 4 - li * 13, { size: 9, f: helvB, align: 'right' }))
    st.y -= lns.length * 13 + 2
  })
  st.y -= 4

  // ── work details: category tables ──────────────────────────────────────────
  bar(AR.workDetails)

  // Generic RTL bordered table. cols listed right→left (first = rightmost);
  // {w, h:[line1,line2?], en?} — en = Latin suffix in the header (e.g. "(kBTU)").
  const table = (cols, rows, { minRows = 0 } = {}) => {
    const flexW = W - cols.reduce((s, c) => s + (c.w || 0), 0)
    const widths = cols.map((c) => c.w || flexW)
    const headH = cols.some((c) => c.h.length > 1) ? 26 : 16
    // Column-header band. Redrawn at the top of every page a table spills onto,
    // so a long item list stays readable across pages (8T item 3).
    const drawHeader = () => {
      let x = right
      cols.forEach((c, i) => {
        rect(x - widths[i], st.y - headH, widths[i], headH)
        const cx = x - widths[i] / 2
        c.h.forEach((ln, li) => {
          const yy = st.y - (headH === 26 ? (li === 0 ? 10 : 21) : 11)
          if (c.en && li === c.h.length - 1) {
            const arW = arWidth(ln, 7, true), enW = helvB.widthOfTextAtSize(c.en, 6.5)
            const total = arW + enW + 2
            rtl(ln, cx + total / 2, yy, { size: 7, bold: true })
            ltr(c.en, cx + total / 2 - arW - 2, yy, { size: 6.5, f: helvB, align: 'right' })
          } else rtlC(ln, cx, yy, { size: 7, bold: true })
        })
        x -= widths[i]
      })
      st.y -= headH
    }
    ensure(headH + 16)
    drawHeader()
    // Body cells wrap long English text (owner-approved); the row grows to the
    // tallest cell. Arabic values (نعم/لا) stay single-line.
    const drawRow = (vals) => {
      const cellLines = vals.map((v, ci) => {
        const s = v == null ? '' : String(v)
        if (!s || /[؀-ۿ]/.test(s)) return [s]
        return wrapLtr(s, 7.5, widths[ci] - 8)
      })
      const nLines = Math.max(1, ...cellLines.map((l) => l.length))
      const rh = nLines * 10 + 4
      // Break BEFORE the row and repeat the header on the fresh page — never
      // split a table row across a page edge, never continue headerless.
      if (st.y - rh < M + 30) { page(); ensure(headH + 16); drawHeader() }
      let cx = right
      widths.forEach((w, ci) => {
        rect(cx - w, st.y - rh, w, rh)
        const lines = cellLines[ci]
        const yStart = st.y - 10 - ((nLines - lines.length) * 10) / 2
        lines.forEach((ln, li) => {
          if (!ln) return
          if (/[؀-ۿ]/.test(ln)) rtlC(ln, cx - w / 2, yStart - li * 10, { size: 7.5 })
          else ltr(ln, cx - w / 2, yStart - li * 10, { size: 7.5, align: 'center' })
        })
        cx -= w
      })
      st.y -= rh
    }
    rows.forEach(drawRow)
    for (let i = rows.length; i < minRows; i++) drawRow([String(i + 1), ...widths.slice(1).map(() => '')])
    st.y -= 8
  }
  // vals arrive right→left too: [no, then the rest matching the cols order]
  const numbered = (list, mk) => list.map((it, i) => [String(i + 1), ...mk(it)])

  const fmtQty = (q) => (q == null || q === '' ? '' : Number(q).toLocaleString('en-US'))
  if (data.kind === 'ac') {
    heading(AR.installedAc)
    table(
      [{ w: 46, h: [AR.itemNo] }, { h: [AR.itemDesc] }, { w: 60, h: [AR.qty] }, { w: 78, h: [AR.capacity], en: '(kBTU)' }, { w: 78, h: [AR.efficiency], en: '(SEER)' }],
      numbered(data.installed, (it) => [it.description || '', fmtQty(it.qty), it.kbtu ?? '', it.seer ?? '']),
    )
    heading(AR.installedOther)
    table(
      [{ w: 46, h: [AR.itemNo] }, { h: [AR.itemDesc] }, { w: 120, h: [AR.qty] }],
      numbered(data.installedOther, (it) => [it.description || '', fmtQty(it.qty)]),
      { minRows: data.installedOther.length ? 0 : 5 },
    )
    bar(AR.removedBar)
    heading(AR.removedAc)
    table(
      [{ w: 46, h: [AR.itemNo] }, { h: [AR.itemDesc] }, { w: 56, h: [AR.qty] }, { w: 72, h: [AR.capacity], en: '(kBTU)' }, { w: 72, h: [AR.efficiency], en: '(SEER)' }, { w: 64, h: [AR.returned] }],
      numbered(data.removed, (it) => [it.description || '', fmtQty(it.qty), it.kbtu ?? '', it.seer ?? '', it.returned === false ? AR.no : AR.yes]),
    )
  } else {
    heading(AR.installedLighting)
    table(
      [{ w: 46, h: [AR.itemNo] }, { h: [AR.itemDesc] }, { w: 70, h: [AR.qty] }, { w: 84, h: [AR.power] }],
      numbered(data.installed, (it) => [it.description || '', fmtQty(it.qty), it.power || '']),
    )
    if (data.installedControls.length) {
      heading(AR.installedControl)
      table(
        [{ w: 42, h: [AR.itemNo] }, { h: [AR.ctrlItem] }, { w: 56, h: [AR.qty] }, { w: 62, h: [AR.ctrlRefNo.slice(0, 12), AR.ctrlRefNo.slice(12)] }, { w: 110, h: [AR.ctrlRefDesc] }, { w: 84, h: [AR.ctrlTotal.slice(0, 15), AR.ctrlTotal.slice(15)] }],
        numbered(data.installedControls, (it) => [it.description || '', fmtQty(it.qty), it.ctrlRefNo ?? '', it.ctrlRefDesc || '', fmtQty(it.ctrlTotal)]),
      )
    }
    heading(AR.installedOther)
    table(
      [{ w: 46, h: [AR.itemNo] }, { h: [AR.itemDesc] }, { w: 120, h: [AR.qty] }],
      numbered(data.installedOther, (it) => [it.description || '', fmtQty(it.qty)]),
      { minRows: data.installedOther.length ? 0 : 4 },
    )
    bar(AR.removedBar)
    heading(AR.removedLighting)
    table(
      [{ w: 46, h: [AR.itemNo] }, { h: [AR.itemDesc] }, { w: 64, h: [AR.qty] }, { w: 80, h: [AR.power] }, { w: 74, h: [AR.returned] }],
      numbered(data.removed, (it) => [it.description || '', fmtQty(it.qty), it.power || '', it.returned === false ? AR.no : AR.yes]),
    )
  }

  // ── operating hours ────────────────────────────────────────────────────────
  bar(AR.opHours)
  ensure(18); rect(M, st.y - 16, W, 16); rtl(AR.perLetter, right - 6, st.y - 12, { size: 8.5 }); st.y -= 24

  // ── electricity company info: label cell right + wide value cell left ──────
  bar(AR.elec)
  const elecRows = [[AR.meter, data.meterNo], [AR.subscription, data.subscriptionNo], [AR.account, data.accountNo]]
  const elecLabelW = 230
  elecRows.forEach(([k, v]) => {
    ensure(19)
    rect(right - elecLabelW, st.y - 17, elecLabelW, 17)
    rect(M + 40, st.y - 17, W - elecLabelW - 40, 17)
    rtl(k, right - 6, st.y - 13, { size: 8.5 })
    if (v) ltr(v, M + 46, st.y - 13, { size: 8.5 })
    st.y -= 17
  })
  st.y -= 8

  // ── attachments: 5 + 3 checkbox rows, box left of each Arabic label ───────
  bar(AR.attachments)
  const checked = new Set(data.attachmentsChecked || [])
  const attRow = (items, y) => {
    const cw = W / items.length
    items.forEach(([id, label], i) => {
      const cellR = right - i * cw
      const labelW = arWidth(label, 8)
      rtl(label, cellR - 8, y, { size: 8 })
      rect(cellR - 8 - labelW - 16, y - 2, 9, 9)
      if (checked.has(id)) rect(cellR - 8 - labelW - 15, y - 1, 7, 7, DARK, DARK)
    })
  }
  ensure(44)
  attRow([['specs', AR.specs], ['samples', AR.samples], ['drawings', AR.drawings], ['photos', AR.photos], ['boq', AR.boq]], st.y - 8)
  attRow([['testReport', AR.testReport], ['inspReport', AR.inspReport], ['other', AR.other]], st.y - 28)
  st.y -= 44

  // ── approval grid: row-label column on the RIGHT edge, then ESCO | Tarshid
  //    | Government-entity columns right→left (matches samples) ───────────────
  // 8U/8V — signing is TARSHID's scope, done on paper after this tool hands over
  // the PDF. 8V auto-fills ONLY the ESCO column (الشركة المنفذة, index 0): the
  // generating engineer's name in الإسم and the generation date in التاريخ. Its
  // الوظيفة/التوقيع cells and the entire TARSHID + government-entity columns stay
  // blank (name, title, signature and date all filled by TARSHID at signing).
  const labelColW = 58
  const orgColW = (W - labelColW) / 3
  const gridHeads = [AR.contractor, AR.tarshid, AR.govRep] // right→left after the label column
  const gridRows = [
    { label: '', h: 20, key: 'head' },
    { label: AR.name, h: 24, key: 'name' },
    { label: AR.role, h: 24, key: 'role' },
    { label: AR.signature, h: 34, key: 'sig' },
    { label: AR.date, h: 22, key: 'date' },
  ]
  const drawCell = (txt, cxm, yMid) => {
    if (!txt) return
    if (/[؀-ۿ]/.test(txt)) rtlC(txt, cxm, yMid, { size: 8.5 })
    else ltr(txt, cxm, yMid, { size: 8.5, align: 'center' })
  }
  // 8T item 4 — keep the الاعتماد header and its whole (fixed-height) grid on one
  // page: reserve the teal bar (~25pt) + full grid height BEFORE the bar.
  ensure(25 + gridRows.reduce((s, r) => s + r.h, 0) + 4)
  bar(AR.approval)
  gridRows.forEach((row) => {
    rect(right - labelColW, st.y - row.h, labelColW, row.h) // label cell (right edge)
    if (row.label) rtlC(row.label, right - labelColW / 2, st.y - row.h / 2 - 3, { size: 8.5, bold: true })
    let cx = right - labelColW
    gridHeads.forEach((h, gi) => {
      rect(cx - orgColW, st.y - row.h, orgColW, row.h)
      const cxm = cx - orgColW / 2, yMid = st.y - row.h / 2 - 3
      if (row.key === 'head') rtlC(h, cxm, yMid, { size: 8, bold: true })
      // ESCO column only (gi === 0): name + generation date; everything else blank.
      else if (gi === 0 && row.key === 'name') drawCell(data.escoSignerName, cxm, yMid)
      else if (gi === 0 && row.key === 'date') drawCell(data.generationDate, cxm, yMid)
      cx -= orgColW
    })
    st.y -= row.h
  })

  // ── final pass: per-page border + logo + Page N of M ───────────────────────
  const pages = pdf.getPages()
  pages.forEach((pg, i) => {
    pg.drawRectangle({ x: 16, y: 16, width: A4[0] - 32, height: A4[1] - 32, borderColor: rgb(LINE[0], LINE[1], LINE[2]), borderWidth: 0.8 })
    if (logo) {
      const lw = 96, lh = (logo.height / logo.width) * lw
      pg.drawImage(logo, { x: A4[0] - M - lw, y: A4[1] - 30 - lh, width: lw, height: lh })
    }
    const t = `Page ${i + 1} of ${pages.length}`
    pg.drawText(t, { x: A4[0] - M - helvB.widthOfTextAtSize(t, 9), y: 24, size: 9, font: helvB, color: rgb(DARK[0], DARK[1], DARK[2]) })
  })

  return await pdf.save()
}

// Default-fill the 8S COC data contract (assembled by src/lib/cocPdf.js).
function normalizeCocData(d) {
  return {
    referenceNo: d.referenceNo || '', date: d.date || '',
    projectName: d.projectName || '', projectRefNo: d.projectRefNo || '',
    contractDate: d.contractDate || '', endDate: d.endDate || '',
    escoOrg: d.escoOrg || '', subcontractor: d.subcontractor || '',
    buildingNos: d.buildingNos || '', entityName: d.entityName || '',
    buildingType: d.buildingType || '', region: d.region || '', city: d.city || '', coords: d.coords || '',
    descriptionLines: d.descriptionLines || [], kind: d.kind || 'lighting',
    installed: d.installed || [], installedControls: d.installedControls || [], installedOther: d.installedOther || [],
    removed: d.removed || [], meterNo: d.meterNo || '', subscriptionNo: d.subscriptionNo || '', accountNo: d.accountNo || '',
    attachmentsChecked: d.attachmentsChecked || [],
    // 8U/8V — the approval grid's ESCO column (only) auto-fills with the generating
    // engineer's name + generation date; TARSHID/entity columns stay blank.
    escoSignerName: d.escoSignerName || '', generationDate: d.generationDate || '',
  }
}
