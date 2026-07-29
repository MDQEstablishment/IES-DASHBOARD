// 9D-3 — surgical XLSX patching. We must fill INPUT cells of the real TARSHID
// workbook while leaving every formula, pivot, chart, style and reference
// sheet byte-identical. Re-writing the file through SheetJS would drop pivots
// and conditional formats, so we edit the sheet XML inside the OOXML zip
// directly (fflate is already a dependency — see CocGenerateWizard).
//
// Writes use inlineStr for text so sharedStrings.xml is never touched; numbers
// go in as <v>. Cells holding a formula (<f>) are NEVER overwritten.
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate'

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const unesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

export const colToNum = (c) => [...c.toUpperCase()].reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0)
const refParts = (ref) => { const m = /^([A-Z]+)(\d+)$/.exec(ref); return m ? { col: m[1], row: parseInt(m[2], 10) } : null }

export function openXlsx(buf) {
  const files = unzipSync(new Uint8Array(buf))
  const wbXml = strFromU8(files['xl/workbook.xml'])
  const relsXml = strFromU8(files['xl/_rels/workbook.xml.rels'])
  const rels = {}
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    rels[m[1]] = m[2].replace(/^\/?xl\//, '').replace(/^\//, '')
  }
  const sheets = []
  for (const m of wbXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const tag = m[0]
    const name = /name="([^"]*)"/.exec(tag)?.[1]
    const rid = /r:id="([^"]+)"/.exec(tag)?.[1]
    if (name && rid && rels[rid]) sheets.push({ name: unesc(name), path: 'xl/' + rels[rid] })
  }
  // shared strings (reads only)
  const sst = []
  if (files['xl/sharedStrings.xml']) {
    const s = strFromU8(files['xl/sharedStrings.xml'])
    for (const si of s.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      sst.push([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unesc(t[1])).join(''))
    }
  }
  return { files, sheets, sst }
}

export function saveXlsx(zip) {
  return zipSync(zip.files, { level: 6 })
}

// Find a sheet by normalized name (tolerant to spacing/underscores/case).
export function findSheet(zip, ...candidates) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '')
  const wanted = candidates.map(norm)
  return zip.sheets.find((s) => wanted.includes(norm(s.name)))
    || zip.sheets.find((s) => wanted.some((w) => norm(s.name).includes(w) || w.includes(norm(s.name))))
    || null
}

// Parse a sheet into { cells: Map<ref, {v, isFormula}>, maxRow }.
export function readSheet(zip, sheet) {
  const xml = strFromU8(zip.files[sheet.path])
  const cells = new Map()
  let maxRow = 0
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1], body = m[2] || ''
    const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1]
    if (!ref) continue
    const t = /t="([^"]+)"/.exec(attrs)?.[1]
    const isFormula = /<f[\s>]/.test(body)
    let v = null
    const vm = /<v>([\s\S]*?)<\/v>/.exec(body)
    if (t === 'inlineStr') v = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => unesc(x[1])).join('')
    else if (vm) v = t === 's' ? (zip.sst[parseInt(vm[1], 10)] ?? '') : unesc(vm[1])
    cells.set(ref, { v, isFormula })
    const rn = refParts(ref)?.row || 0
    if (rn > maxRow) maxRow = rn
  }
  return { cells, maxRow, xml }
}

// Locate the header row: the first row (within `scan` rows) containing at
// least `minHits` of the given header labels. Returns { row, cols } where cols
// maps normalized header text -> column letter.
export function findHeaderRow(sheetData, labels, { scan = 12, minHits = 3 } = {}) {
  const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const wanted = labels.map(norm)
  const byRow = new Map()
  sheetData.cells.forEach((c, ref) => {
    const p = refParts(ref)
    if (!p || p.row > scan || c.v == null || c.v === '') return
    if (!byRow.has(p.row)) byRow.set(p.row, [])
    byRow.get(p.row).push({ col: p.col, text: String(c.v) })
  })
  let best = null
  ;[...byRow.entries()].sort((a, b) => a[0] - b[0]).forEach(([row, cells]) => {
    if (best) return
    const hits = cells.filter((c) => wanted.some((w) => w && norm(c.text).includes(w))).length
    if (hits >= minHits) {
      const cols = {}
      cells.forEach((c) => { cols[norm(c.text)] = c.col })
      best = { row, cols }
    }
  })
  return best
}

// Resolve a column letter for a header by fuzzy label match.
export function colFor(header, ...labels) {
  if (!header) return null
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '')
  const keys = Object.keys(header.cols)
  for (const l of labels) {
    const w = norm(l)
    const exact = keys.find((k) => k === w)
    if (exact) return header.cols[exact]
  }
  for (const l of labels) {
    const w = norm(l)
    const partial = keys.find((k) => k.includes(w) || w.includes(k))
    if (partial) return header.cols[partial]
  }
  return null
}

// Apply patches: Map/obj of ref -> value (string | number | null). Cells that
// hold formulas are skipped. Existing style attributes are preserved.
export function patchSheet(zip, sheet, patches, { skipFormulas = true } = {}) {
  let xml = strFromU8(zip.files[sheet.path])
  const existing = readSheet(zip, sheet)
  // group by row
  const byRow = new Map()
  for (const [ref, val] of Object.entries(patches)) {
    if (val == null || val === '') continue
    const p = refParts(ref)
    if (!p) continue
    if (skipFormulas && existing.cells.get(ref)?.isFormula) continue
    if (!byRow.has(p.row)) byRow.set(p.row, [])
    byRow.get(p.row).push({ ref, col: p.col, val })
  }
  if (byRow.size === 0) return 0

  const cellXml = (ref, val, styleAttr) => {
    const s = styleAttr ? ` ${styleAttr}` : ''
    if (typeof val === 'number' && Number.isFinite(val)) return `<c r="${ref}"${s}><v>${val}</v></c>`
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(val)}</t></is></c>`
  }

  let written = 0
  for (const [rowNum, items] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    const rowRe = new RegExp(`<row\\b([^>]*\\br="${rowNum}"[^>]*)(?:/>|>([\\s\\S]*?)</row>)`)
    const rm = rowRe.exec(xml)
    if (rm) {
      let inner = rm[2] || ''
      for (const it of items) {
        const cRe = new RegExp(`<c\\b([^>]*\\br="${it.ref}"[^>]*?)(?:/>|>([\\s\\S]*?)</c>)`)
        const cm = cRe.exec(inner)
        const style = cm ? (/(s="\d+")/.exec(cm[1])?.[1] || '') : ''
        const next = cellXml(it.ref, it.val, style)
        if (cm) inner = inner.slice(0, cm.index) + next + inner.slice(cm.index + cm[0].length)
        else {
          // insert in column order
          const target = colToNum(it.col)
          const cells = [...inner.matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)]
          const after = cells.find((c) => {
            const r = /r="([A-Z]+)\d+"/.exec(c[0])?.[1]
            return r && colToNum(r) > target
          })
          if (after) inner = inner.slice(0, after.index) + next + inner.slice(after.index)
          else inner += next
        }
        written++
      }
      const rowAttrs = rm[1].replace(/\s*\/$/, '')
      xml = xml.slice(0, rm.index) + `<row${rowAttrs}>${inner}</row>` + xml.slice(rm.index + rm[0].length)
    } else {
      // create the row, inserted in row order inside <sheetData>
      const inner = items.sort((a, b) => colToNum(a.col) - colToNum(b.col)).map((it) => cellXml(it.ref, it.val, '')).join('')
      written += items.length
      const rowXml = `<row r="${rowNum}">${inner}</row>`
      const rows = [...xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*(?:\/>|>[\s\S]*?<\/row>)/g)]
      const after = rows.find((r) => parseInt(r[1], 10) > rowNum)
      if (after) xml = xml.slice(0, after.index) + rowXml + xml.slice(after.index)
      else if (/<sheetData\s*\/>/.test(xml)) xml = xml.replace(/<sheetData\s*\/>/, `<sheetData>${rowXml}</sheetData>`)
      else xml = xml.replace(/<\/sheetData>/, `${rowXml}</sheetData>`)
    }
  }
  // Excel recalculates on open (formulas we didn't touch keep cached values
  // otherwise); drop the calcChain so it rebuilds cleanly.
  delete zip.files['xl/calcChain.xml']
  zip.files[sheet.path] = strToU8(xml)
  return written
}

// Force a full recalculation when the file opens.
export function setFullCalcOnLoad(zip) {
  const p = 'xl/workbook.xml'
  if (!zip.files[p]) return
  let xml = strFromU8(zip.files[p])
  if (/<calcPr\b[^>]*\/>/.test(xml)) xml = xml.replace(/<calcPr\b[^>]*\/>/, '<calcPr calcId="0" fullCalcOnLoad="1"/>')
  else xml = xml.replace('</workbook>', '<calcPr calcId="0" fullCalcOnLoad="1"/></workbook>')
  zip.files[p] = strToU8(xml)
}
