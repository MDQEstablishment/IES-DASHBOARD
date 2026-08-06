// 9F(6) — the site-photograph annex that ships alongside the progress report.
//
// Why a PDF annex and not images in the workbook, or links:
//   · Signed storage URLs EXPIRE. A client opening the report next month would
//     find dead links, and long-lived URLs in a forwarded file are a quiet
//     data-exposure channel. No URL is ever written anywhere.
//   · Embedding images into the xlsx would mean teaching xlsxPatch media parts,
//     drawing XML and relationship plumbing — new OOXML surface for one sheet.
//     pdf-lib already embeds photos here (cocPdf/docPdf do it today).
// The Site Evidence sheet indexes these pages, so the workbook and the annex
// agree: each photo's page number is written back into the "Annex Page" column.
import { signedUrlFor } from './db'
import { compressImage } from './image'
import { BUCKETS } from './buckets'

const A4 = [595.28, 841.89]
const M = 40
const NAVY = [0.07, 0.15, 0.24]
const BRASS = [0.63, 0.46, 0.17]
const GREY = [0.45, 0.44, 0.41]

// Cap and per-image budget. 40 photos at ~150 KB is a ~6 MB annex — large
// enough to be useful, small enough to email.
// TEST-ONLY EXPORT — nothing in the app imports this; it is exported so the
// generator harness can exercise it directly. Do not assume it is dead code.
export const MAX_PHOTOS = 40
const MAX_BYTES = 150 * 1024

const clean = (s) => String(s ?? '').replace(/[^\x20-\x7E]/g, '').trim()   // Helvetica is Latin-only

// Fetch + downscale one photo. Returns null (never throws) so one unreadable
// object can't sink the whole report.
async function loadPhoto(p) {
  try {
    const url = await signedUrlFor(p.bucket || BUCKETS.BUILDING_PHOTOS, p.storage_path, 600)
    if (!url) return null
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const small = await compressImage(blob, { maxBytes: MAX_BYTES, maxDim: 1400 }).catch(() => blob)
    const bytes = new Uint8Array(await small.arrayBuffer())
    const type = (small.type || blob.type || '').toLowerCase()
    return { bytes, type, meta: p }
  } catch {
    return null
  }
}

// Build the annex. Returns { bytes, pages, indexed, skipped, note } — or
// { bytes: null, note } when there is nothing to show, so the caller can ship
// the workbook alone rather than an empty PDF.
export async function buildPhotoAnnex({ evidence = [], meta = {} }) {
  const wanted = evidence.filter((e) => e.storage_path)
  if (wanted.length === 0) {
    return { bytes: null, pages: 0, indexed: 0, skipped: 0, note: 'No photographs recorded in this period' }
  }
  const capped = wanted.slice(0, MAX_PHOTOS)
  const overflow = wanted.length - capped.length

  const loaded = (await Promise.all(capped.map(loadPhoto))).filter(Boolean)
  const unreadable = capped.length - loaded.length
  if (loaded.length === 0) {
    return { bytes: null, pages: 0, indexed: 0, skipped: wanted.length, note: 'No photographs could be read from storage' }
  }

  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  let page = null, pageNo = 0
  const newPage = () => { page = pdf.addPage(A4); pageNo += 1; return page }
  const text = (s, x, y, { size = 9, font = helv, color = [0, 0, 0], align = 'left' } = {}) => {
    const str = clean(s)
    if (!str) return
    const w = font.widthOfTextAtSize(str, size)
    const px = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
    page.drawText(str, { x: px, y, size, font, color: rgb(...color) })
  }

  // ── cover ────────────────────────────────────────────────────────────────
  newPage()
  page.drawRectangle({ x: 0, y: A4[1] - 120, width: A4[0], height: 120, color: rgb(...NAVY) })
  text('SITE PHOTOGRAPH ANNEX', M, A4[1] - 62, { size: 18, font: bold, color: [1, 1, 1] })
  text(`${meta.project_code || ''} ${meta.project_name ? '· ' + meta.project_name : ''}`, M, A4[1] - 84, { size: 11, color: [0.85, 0.85, 0.85] })
  page.drawRectangle({ x: M, y: A4[1] - 128, width: A4[0] - 2 * M, height: 3, color: rgb(...BRASS) })

  let y = A4[1] - 175
  const row = (k, v) => {
    text(k.toUpperCase(), M, y, { size: 8, font: bold, color: GREY })
    text(v || '—', M + 130, y, { size: 10 })
    y -= 22
  }
  row('Client', meta.client)
  row('Reference', meta.reference)
  row('Reporting period', `${meta.period_from || ''} to ${meta.period_to || ''}`)
  row('Photographs', `${loaded.length}`)
  row('Issued', meta.generated_on)

  y -= 10
  text('This annex accompanies the progress report workbook. The Site Evidence sheet', M, y, { size: 9, color: GREY }); y -= 13
  text('lists every photograph with the page number it appears on below.', M, y, { size: 9, color: GREY })

  const notes = []
  if (overflow > 0) notes.push(`${overflow} further photograph(s) were recorded in this period and are not included (annex limit ${MAX_PHOTOS}).`)
  if (unreadable > 0) notes.push(`${unreadable} photograph(s) could not be read from storage and are omitted.`)
  if (notes.length) {
    y -= 26
    page.drawRectangle({ x: M, y: y - 6 - 14 * notes.length, width: A4[0] - 2 * M, height: 14 * notes.length + 18, color: rgb(0.98, 0.95, 0.89) })
    notes.forEach((n, i) => text(n, M + 8, y - 6 - 14 * i, { size: 8.5, color: [0.52, 0.3, 0.05] }))
    y -= 14 * notes.length + 24
  }

  // ── photo pages: 2 per page, each captioned with its own metadata ────────
  const gap = 14, capH = 34
  const withPages = []
  for (let i = 0; i < loaded.length; i++) {
    const p = loaded[i]
    let img = null
    try { img = p.type.includes('png') ? await pdf.embedPng(p.bytes) : await pdf.embedJpg(p.bytes) } catch {
      try { img = await pdf.embedPng(p.bytes) } catch { continue }
    }
    if (i % 2 === 0) {
      newPage()
      page.drawRectangle({ x: 0, y: A4[1] - 46, width: A4[0], height: 46, color: rgb(...NAVY) })
      text('SITE PHOTOGRAPH ANNEX', M, A4[1] - 29, { size: 11, font: bold, color: [1, 1, 1] })
      text(meta.project_code || '', A4[0] - M, A4[1] - 29, { size: 10, color: [0.85, 0.85, 0.85], align: 'right' })
    }
    const areaTop = A4[1] - 60
    const cellH = (areaTop - (M + 24) - gap) / 2
    const cellTop = areaTop - (i % 2) * (cellH + gap)

    page.drawRectangle({ x: M, y: cellTop - cellH, width: A4[0] - 2 * M, height: cellH, borderColor: rgb(0.85, 0.84, 0.8), borderWidth: 1 })
    const dim = img.scaleToFit(A4[0] - 2 * M - 16, cellH - capH - 12)
    page.drawImage(img, {
      x: M + (A4[0] - 2 * M - dim.width) / 2,
      y: cellTop - cellH + capH + ((cellH - capH - dim.height) / 2),
      width: dim.width, height: dim.height,
    })

    const m = p.meta
    const capY = cellTop - cellH + capH - 12
    text(`${i + 1}. ${[m.building, m.room].filter(Boolean).join(' · ') || 'Site photograph'}`, M + 8, capY, { size: 9.5, font: bold })
    text([m.date, m.category].filter(Boolean).join('  ·  '), A4[0] - M - 8, capY, { size: 8.5, color: GREY, align: 'right' })
    if (m.caption) text(m.caption, M + 8, capY - 12, { size: 8.5, color: GREY })

    withPages.push({ ...m, annex_page: pageNo })
    // footer once the page is full (or on the last photo)
    if (i % 2 === 1 || i === loaded.length - 1) {
      text(`Page ${pageNo}`, A4[0] / 2, 22, { size: 8, color: GREY, align: 'center' })
    }
  }

  return {
    bytes: await pdf.save(),
    pages: pageNo,
    indexed: withPages.length,
    skipped: overflow + unreadable,
    evidence: withPages,
    note: notes.join(' ') || null,
  }
}
