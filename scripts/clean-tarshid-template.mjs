#!/usr/bin/env node
// ===========================================================================
// clean-tarshid-template.mjs — full-part de-identification of a TARSHID
// saving-sheet workbook, Constraints #7 method.
// ===========================================================================
//
// THE METHOD, and why it is shaped this way.
//
// The failure this tool exists to not repeat: a visible-grid search of a
// stripped .xlsx reported "zero client references" while hundreds of facility
// names sat in xl/sharedStrings.xml, more in comments parts, docProps and
// customXml. A negative finding is only as strong as the method that produced
// it. So this tool never looks at "the spreadsheet". It enumerates every
// archive member and decides, member by member, what happens to it.
//
// THE AUTHORITY FOR WHAT MAY BE TOUCHED is the workbook's own "Instr." sheet,
// which carries a two-swatch colour legend:
//   pale green  (theme 9, tint 0.8) -> "Fill these cells as instructed below."
//   pale salmon (theme 5, tint 0.8) -> "Do not change any values on these cells."
//   no fill                          -> "all values will be automatically generated."
// and, for the reference sheets, the words "Do not change / enter any values on
// these cells." Sheets are classified FILL / REFER / COMPUTED from that legend,
// not from judgement. See SHEET_CLASS below.
//
// THE ROOT CAUSE of the sharedStrings leakage, confirmed mechanically here:
// deleting spreadsheet ROWS removes <row> elements but leaves their strings in
// the shared string table. Every Arabic facility name in these two workbooks is
// an ORPHAN — referenced by no surviving cell (AC 204/204, Lighting 339/342;
// the 3 exceptions are bilingual column headers on OH, TARSHID's own form).
//
// CRITICAL MECHANIC — ORPHANS ARE BLANKED IN PLACE, NEVER DELETED.
// A t="s" cell stores an INDEX into the shared string table. Deleting entry N
// renumbers every entry after it, which would require rewriting the t="s"
// indices inside Old_Model_Registry, Aprvd Baseline Unit, Project_AC List,
// Project_Light List and Mnu — the exact parts that must not change. Blanking
// <si>…</si> to <si><t/></si> removes the content with ZERO diff to any refer
// sheet, and keeps count/uniqueCount honest.
//
// DETERMINISM: the output is a function of the input bytes alone. Zip entries
// are written in the input's own order, with a fixed 1980-01-01 timestamp and
// fixed compression level, so two runs produce identical sha256.
//
// USAGE
//   node clean-tarshid-template.mjs --in <original.xlsx> --out <clean.xlsx>
//                                   [--report <report.json>]
//                                   [--empty-light-selection]
//
// --empty-light-selection is OFF by default; see the LIGHT_SELECTION note.

import { unzipSync, zipSync, strToU8, strFromU8 } from '/home/user/IES-DASHBOARD/node_modules/fflate/esm/browser.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// ── constants ──────────────────────────────────────────────────────────────

const NEUTRAL = 'IES Platform'
const FIXED_MTIME = new Date(Date.UTC(1980, 0, 1, 0, 0, 0))

// Sheet classification, derived from Instr. (see header). Anything not listed
// is treated as REFER — the conservative default: untouched.
const SHEET_CLASS = {
  // ---- FILL: the ESCO enters project data here. Emptied of DATA; the form
  //      skeleton (header rows, label columns) is TARSHID's and stays.
  'Project_Info': 'fill',
  'OH': 'fill',
  'AC_Savings': 'fill',
  'Aprvd Project Unit': 'fill',
  'Light_Savings': 'fill',        // its J1:O5 / A10 summary block is COMPUTED
  // ---- REFER: Instr. "Do not change / enter any values on these cells."
  'Old_Model_Registry': 'refer',
  'Aprvd Baseline Unit': 'refer',
  'Project_AC List': 'refer',
  'Project_Light List': 'refer',
  'Mnu': 'refer',
  'Instr.': 'refer',              // the instruction sheet itself
  'Light_Selection': 'refer',     // see LIGHT_SELECTION note below
  // ---- COMPUTED: formula-driven summaries; cached values cleared.
  'Pivot': 'computed',
  'Pivot_2': 'computed',
  'Pivot_Cntrl': 'computed',
  'Pivot_Baseline': 'computed',
  'Data_Check': 'computed',
  'DataCheck': 'computed',
  'Vstack': 'computed',
}

// LIGHT_SELECTION — a flagged judgement call, not a silent one.
// Instr. calls Light_Selection a step-1 FILL tab, and its B/C/I/N columns carry
// the green fill swatch. But its 66 populated rows contain only equipment
// catalogue identifiers (baseline fitting type codes, LED product descriptions,
// supplier model numbers) — no entity, facility, person, location, coordinate
// or figure; the full-part scan confirms zero client-class hits in them. They
// are also the only surface the Light_Savings VLOOKUP chain can resolve
// against, i.e. the workbook's one live cross-check. Default: KEEP verbatim.
// --empty-light-selection flips it to FILL for the owner with one flag.
const LIGHT_SELECTION_FILL_COLS = ['B', 'C', 'I', 'N', 'M']

// Client figures: cached values of the Light_Savings summary formulas, i.e. the
// previously-computed project the template shipped displaying. Only figures
// with >= 5 significant digits are treated as identifying; a bare "562" is not.
const CLIENT_FIGURES = [
  '35185', '4551262.2309999969', '3452710.5213399613', '2930010.1851599966',
  '0.64377968933603258', '54442', '3393231.8279999834', '1513693.035540022',
  '0.44609184172135186', '178075.24800000049', '48080.316960000142', '89627',
  '7944494.0589999799', '4491783.5376600185', '0.56539579541524965',
  '1918.4939999999986', '7944494.0589999398', '714.79549999999915',
  '3007046.0359999901', '4443703.2207000889',
].filter((f) => f.replace(/[^0-9]/g, '').length >= 5)

// ── small helpers ──────────────────────────────────────────────────────────

const unesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const txt = (u8) => Buffer.from(u8).toString('utf8')
const bin = (s) => strToU8(s)
const colOf = (ref) => /^([A-Z]+)/.exec(ref)?.[1] ?? ''
const rowOf = (ref) => +(/(\d+)$/.exec(ref)?.[1] ?? 0)

function sheetIndex(files) {
  const wb = txt(files['xl/workbook.xml'])
  const relsXml = txt(files['xl/_rels/workbook.xml.rels'])
  const rels = {}
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    rels[m[1]] = 'xl/' + m[2].replace(/^\/?xl\//, '').replace(/^\//, '')
  }
  const sheets = []
  for (const m of wb.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const name = /name="([^"]*)"/.exec(m[0])?.[1]
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1]
    if (name && rid && rels[rid]) sheets.push({ name: unesc(name), path: rels[rid] })
  }
  return sheets
}

// Rewrite every <c> in a sheet through `fn(cell) -> replacementXml | null`.
function mapCells(xml, fn) {
  let out = '', last = 0, changed = 0
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1], body = m[2] ?? null
    const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1]
    if (!ref) continue
    const cell = {
      whole: m[0], attrs, body: body ?? '', ref,
      t: /t="([^"]+)"/.exec(attrs)?.[1] ?? null,
      isFormula: body != null && /<f[\s>/]/.test(body),
      v: body == null ? null : (/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? null),
    }
    const rep = fn(cell)
    if (rep == null || rep === m[0]) continue
    out += xml.slice(last, m.index) + rep
    last = m.index + m[0].length
    changed++
  }
  return { xml: out + xml.slice(last), changed }
}

// ── the cleaner ────────────────────────────────────────────────────────────

export function clean(inputBytes, { emptyLightSelection = false } = {}) {
  const files = unzipSync(new Uint8Array(inputBytes))
  const order = Object.keys(files)          // preserve archive member order
  const log = {
    fillCellsCleared: {}, cachesStripped: {}, figureCachesStripped: 0,
    sstBlanked: 0, sstTotal: 0, sstReferenced: 0, sstKept: 0,
    commentPartsRemoved: [], vmlPartsRemoved: [], legacyDrawingRefsRemoved: [],
    docPropsChanged: [], customXmlChanged: [], printerSettingsNeutralized: [],
    labelInfoNeutralized: false, workbookNeutralized: [], partsRemoved: [], partsChanged: [],
  }
  const sheets = sheetIndex(files)
  const classOf = (n) => SHEET_CLASS[n] ?? 'refer'

  // ---------------------------------------------------------------- step 1
  // FILL sheets: clear residual project-data cells below the header row.
  // The form skeleton (row 1 headers, label columns) is TARSHID's and stays.
  for (const sh of sheets) {
    const cls = classOf(sh.name)
    const isLS = sh.name === 'Light_Selection'
    if (cls !== 'fill' && !(isLS && emptyLightSelection)) continue
    const xml = txt(files[sh.path])
    // Light_Savings' summary block occupies rows 1..11; its data grid is 12+.
    const headerRows = sh.name === 'Light_Savings' ? 11 : 1
    const r = mapCells(xml, (c) => {
      if (rowOf(c.ref) <= headerRows) return null
      if (c.isFormula) return null                     // formulas are TARSHID's
      if (isLS && !LIGHT_SELECTION_FILL_COLS.includes(colOf(c.ref))) return null
      if (c.v == null && c.t !== 'inlineStr') return null
      // keep the cell (and its style) — drop only the value
      const attrs = c.attrs.replace(/\s*t="[^"]*"/, '')
      return `<c${attrs}/>`
    })
    if (r.changed) {
      files[sh.path] = bin(r.xml)
      log.fillCellsCleared[sh.name] = r.changed
      log.partsChanged.push(sh.path)
    }
  }

  // ---------------------------------------------------------------- step 2
  // Cached values. Three rules, in this order:
  //  (a) COMPUTED sheets: every formula cell loses its cached <v>.
  //  (b) Light_Savings summary block (rows 1..11, a computed island sitting on
  //      a fill sheet): same.
  //  (c) EVERY sheet, including refer sheets: a formula cell whose cached <v>
  //      is in the client figure set loses it. Refer-sheet caches that are NOT
  //      client figures are kept — §0.4 makes them the registry import source.
  const figSet = new Set(CLIENT_FIGURES)
  for (const sh of sheets) {
    const cls = classOf(sh.name)
    const xml = txt(files[sh.path])
    let figHits = 0
    const r = mapCells(xml, (c) => {
      if (!c.isFormula || c.v == null) return null
      const inComputed = cls === 'computed'
        || (sh.name === 'Light_Savings' && rowOf(c.ref) <= 11)
      const isFig = figSet.has(c.v)
      if (!inComputed && !isFig) return null
      if (isFig) figHits++
      const body = c.body.replace(/<v>[\s\S]*?<\/v>/, '')
      return `<c${c.attrs}>${body}</c>`
    })
    if (r.changed) {
      files[sh.path] = bin(r.xml)
      log.cachesStripped[sh.name] = r.changed
      log.figureCachesStripped += figHits
      if (!log.partsChanged.includes(sh.path)) log.partsChanged.push(sh.path)
    }
  }

  // ---------------------------------------------------------------- step 3
  // Shared strings. Reference map is rebuilt AFTER steps 1-2, so a string that
  // was only kept alive by a residual data cell is now correctly an orphan.
  {
    // The reference scan MUST use the self-closing-aware cell pattern. A naive
    // /<c\b([^>]*?)>([\s\S]*?)<\/c>/ swallows the cell that follows an empty
    // self-closing <c …/> — on Instr., where every legend swatch is such a
    // cell, that silently loses ~38 real references and would have blanked
    // instruction text that is still on screen. Same class of error as the
    // latin1 decode in the scanner; caught the same way, by cross-checking two
    // independent counts.
    const referenced = new Set()
    for (const sh of sheets) {
      mapCells(txt(files[sh.path]), (c) => {
        if (c.t === 's' && c.v != null) referenced.add(+c.v)
        return null
      })
    }
    const sstXml = txt(files['xl/sharedStrings.xml'])
    let i = 0, blanked = 0, out = '', last = 0
    for (const m of sstXml.matchAll(/<si>[\s\S]*?<\/si>|<si\/>/g)) {
      const idx = i++
      if (referenced.has(idx)) continue
      if (m[0] === '<si><t/></si>' || m[0] === '<si/>') continue
      out += sstXml.slice(last, m.index) + '<si><t/></si>'
      last = m.index + m[0].length
      blanked++
    }
    out += sstXml.slice(last)
    files['xl/sharedStrings.xml'] = bin(out)
    log.sstTotal = i
    log.sstReferenced = referenced.size
    log.sstBlanked = blanked
    log.sstKept = i - blanked
    log.partsChanged.push('xl/sharedStrings.xml')
  }

  // ---------------------------------------------------------------- step 4
  // Comments. The comment TEXT is TARSHID guidance, but every comment is
  // signed with a named author in <authors> and repeated in the first run of
  // the body. The parts go, with their VML shape parts, their relationship
  // entries, their [Content_Types] overrides, and the <legacyDrawing> element
  // that points at the VML — leaving no dangling reference.
  {
    const commentParts = order.filter((p) => /^xl\/comments\d*\.xml$/.test(p))
    const vmlToDrop = new Set()
    for (const relPath of order.filter((p) => /^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/.test(p))) {
      let rels = txt(files[relPath])
      const dropIds = []
      for (const m of rels.matchAll(/<Relationship\b[^>]*\/>/g)) {
        const target = /Target="([^"]+)"/.exec(m[0])?.[1] ?? ''
        const id = /Id="([^"]+)"/.exec(m[0])?.[1]
        if (/comments\d*\.xml$/.test(target)) { dropIds.push(id); rels = rels.replace(m[0], '') }
        else if (/vmlDrawing\d*\.vml$/.test(target)) {
          dropIds.push(id); rels = rels.replace(m[0], '')
          vmlToDrop.add('xl/' + target.replace(/^\.\.\//, ''))
        }
      }
      if (!dropIds.length) continue
      files[relPath] = bin(rels)
      log.partsChanged.push(relPath)
      // and the <legacyDrawing r:id="…"/> in the sheet that owned them
      const sheetPath = relPath.replace('/_rels/', '/').replace(/\.rels$/, '')
      let sxml = txt(files[sheetPath])
      const before = sxml
      sxml = sxml.replace(/<legacyDrawing\b[^>]*\/>/g, '')
      if (sxml !== before) {
        files[sheetPath] = bin(sxml)
        const nm = sheets.find((s) => s.path === sheetPath)?.name ?? sheetPath
        log.legacyDrawingRefsRemoved.push(nm)
        if (!log.partsChanged.includes(sheetPath)) log.partsChanged.push(sheetPath)
      }
    }
    let ct = txt(files['[Content_Types].xml'])
    for (const p of commentParts) {
      delete files[p]
      log.commentPartsRemoved.push(p)
      ct = ct.replace(new RegExp(`<Override PartName="/${p}"[^>]*/>`, 'g'), '')
    }
    for (const p of vmlToDrop) { if (files[p]) { delete files[p]; log.vmlPartsRemoved.push(p) } }
    // If no VML remains, the Default vml extension entry is dead weight; leave
    // it — an unused Default is legal and removing it is a needless diff.
    files['[Content_Types].xml'] = bin(ct)
    log.partsChanged.push('[Content_Types].xml')
    log.partsRemoved.push(...log.commentPartsRemoved, ...log.vmlPartsRemoved)
  }

  // ---------------------------------------------------------------- step 5
  // docProps. Structure preserved element-for-element; only values change.
  {
    let core = txt(files['docProps/core.xml'])
    const setEl = (xml, tag, val) => xml.replace(
      new RegExp(`<${tag}(\\s[^>]*)?>[\\s\\S]*?</${tag}>|<${tag}(\\s[^>]*)?/>`),
      `<${tag}>${val}</${tag}>`)
    for (const [tag, val] of [
      ['dc:creator', NEUTRAL], ['cp:lastModifiedBy', NEUTRAL],
      ['dc:title', ''], ['dc:subject', ''], ['dc:description', ''],
      ['cp:keywords', ''], ['cp:category', ''], ['cp:contentStatus', ''],
    ]) core = setEl(core, tag, val)
    files['docProps/core.xml'] = bin(core)
    log.docPropsChanged.push('docProps/core.xml')

    let app = txt(files['docProps/app.xml'])
    // TitlesOfParts is the sheet + named-range inventory — structural, kept.
    for (const tag of ['Manager', 'Company', 'HyperlinkBase']) {
      app = app.replace(new RegExp(`<${tag}(\\s[^>]*)?>[\\s\\S]*?</${tag}>|<${tag}(\\s[^>]*)?/>`), `<${tag}></${tag}>`)
    }
    files['docProps/app.xml'] = bin(app)
    log.docPropsChanged.push('docProps/app.xml')

    // custom.xml carries the SharePoint library ContentTypeId and the document
    // GUID assigned by the issuing tenant — organisation identifiers.
    let cus = txt(files['docProps/custom.xml'])
    cus = cus.replace(/(<property\b[^>]*name="(?:ContentTypeId|_dlc_DocIdItemGuid|MediaServiceImageTags)"[^>]*>)<vt:lpwstr>[\s\S]*?<\/vt:lpwstr>/g,
      '$1<vt:lpwstr></vt:lpwstr>')
    files['docProps/custom.xml'] = bin(cus)
    log.docPropsChanged.push('docProps/custom.xml')
    log.partsChanged.push(...log.docPropsChanged)
  }

  // ---------------------------------------------------------------- step 6
  // customXml. item2 is a SharePoint content-type SCHEMA: the schema itself is
  // structure, but its human-readable attributes (contentTypeName,
  // contentTypeDescription, 9 field displayName values) are the issuing
  // library's Arabic UI labels. Values neutralized, every element, attribute
  // name, namespace and ds:schemaRef left in place. item4 is the instance data:
  // document ID and the tenant SharePoint URL. Values emptied, elements kept.
  {
    for (const p of order.filter((x) => /^customXml\/item\d+\.xml$/.test(x))) {
      let x = txt(files[p]); const before = x
      x = x.replace(/(ma:contentTypeName=")[^"]*"/, '$1"')
        .replace(/(ma:contentTypeDescription=")[^"]*"/, '$1"')
        .replace(/(ma:displayName=")[^"]*"/g, '$1"')
        .replace(/(<_dlc_DocId\b[^>]*>)[\s\S]*?(<\/_dlc_DocId>)/g, '$1$2')
        .replace(/(<Url>)[\s\S]*?(<\/Url>)/g, '$1$2')
        .replace(/(<Description>)[\s\S]*?(<\/Description>)/g, '$1$2')
      if (x !== before) {
        files[p] = bin(x)
        log.customXmlChanged.push(p)
        log.partsChanged.push(p)
      }
    }
  }

  // ---------------------------------------------------------------- step 7
  // docMetadata/LabelInfo.xml — a Microsoft Purview sensitivity label carrying
  // the issuing tenant's siteId GUID. The part and its package relationship are
  // kept (removing them changes the package graph); the label is emptied.
  if (files['docMetadata/LabelInfo.xml']) {
    files['docMetadata/LabelInfo.xml'] = bin(
      '<?xml version="1.0" encoding="utf-8" standalone="yes"?>'
      + '<clbl:labelList xmlns:clbl="http://schemas.microsoft.com/office/2020/mipLabelMetadata"/>')
    log.labelInfoNeutralized = true
    log.partsChanged.push('docMetadata/LabelInfo.xml')
  }

  // ---------------------------------------------------------------- step 8
  // printerSettings*.bin — DEVMODE blobs. Invisible to every text scan of the
  // XML and to every grid inspection, and in these two files they carry the
  // issuing organisation's internal print-server hostnames and a Windows user
  // profile path. Neutralized IN PLACE at identical byte length so that the
  // relationships, the [Content_Types] defaults and the pageSetup r:id on the
  // refer sheets are all untouched.
  {
    const HOSTISH = [
      /\\\\[A-Za-z0-9._$-]{2,}(?:\\[A-Za-z0-9._$-]{1,})*/g,   // UNC
      /[A-Za-z]:\\[A-Za-z0-9._~\\-]{3,}/g,                     // local paths
    ]
    for (const p of order.filter((x) => /^xl\/printerSettings\/.*\.bin$/.test(x))) {
      const b = Buffer.from(files[p])
      const notes = []
      // dmDeviceName: 32 wide chars at offset 0
      const dev = b.subarray(0, 64).toString('utf16le').replace(/\0.*$/s, '')
      if (dev && dev !== NEUTRAL) {
        b.fill(0, 0, 64)
        b.write(NEUTRAL, 0, 'utf16le')
        notes.push('dmDeviceName[0..63]')
      }
      // any host/path literal elsewhere in the driver private data, in either
      // encoding, overwritten with 'X' at exactly the same byte length
      for (const [enc, step] of [['latin1', 1], ['utf16le', 2]]) {
        const s = b.toString(enc)
        for (const re of HOSTISH) {
          re.lastIndex = 0
          for (const m of s.matchAll(re)) {
            const start = m.index * step, len = m[0].length * step
            if (start + len > b.length) continue
            if (enc === 'utf16le') b.write('X'.repeat(m[0].length), start, 'utf16le')
            else b.write('X'.repeat(m[0].length), start, 'latin1')
            notes.push(`${enc}@${start}+${len}`)
          }
        }
      }
      if (notes.length) {
        files[p] = new Uint8Array(b)
        log.printerSettingsNeutralized.push({ part: p, fields: notes })
        log.partsChanged.push(p)
      }
    }
  }

  // ---------------------------------------------------------------- step 9
  // xl/workbook.xml. Two leaks live here that no grid inspection and no
  // sharedStrings audit would ever reach, and neither was on the original
  // inventory — they were found by scanning this part like any other:
  //   (a) <x15ac:absPath url="…"> — the absolute path the workbook was last
  //       opened from. In one file that is a Windows user-profile directory
  //       carrying a person's full name; in the other, an organisation OneDrive
  //       URL. The attribute is emptied; the element and its mc:AlternateContent
  //       wrapper stay, so the part's element count is unchanged.
  //   (b) hidden legacy MS-Query definedNames ("AccessDatabase") whose VALUE is
  //       an absolute path to someone's machine, one of them a person-named
  //       directory. The definedName ELEMENT is kept — definedNames are counted
  //       for parity and the workbook's 2,121 / 2,140 must not move — and only
  //       its path value is emptied.
  {
    let wb = txt(files['xl/workbook.xml'])
    const before = wb
    const notes = []
    wb = wb.replace(/(<x15ac:absPath\b[^>]*\burl=")[^"]*(")/g, (_m, a, b) => { notes.push('x15ac:absPath'); return a + b })
    wb = wb.replace(/(<definedName\b[^>]*>)("?)(?:[A-Za-z]:\\|\\\\)[^<]*?("?)(<\/definedName>)/g,
      (_m, open, q1, q2, close) => { notes.push('definedName path value'); return `${open}${q1}${q2}${close}` })
    if (wb !== before) {
      files['xl/workbook.xml'] = bin(wb)
      log.workbookNeutralized = notes
      log.partsChanged.push('xl/workbook.xml')
    }
  }

  // ---------------------------------------------------------------- step 10
  // Deterministic repack: input member order, fixed timestamp, fixed level.
  const outFiles = {}
  for (const p of order) if (files[p]) outFiles[p] = [files[p], { mtime: FIXED_MTIME, level: 6 }]
  const bytes = Buffer.from(zipSync(outFiles, { mtime: FIXED_MTIME, level: 6 }))
  log.partsChanged = [...new Set(log.partsChanged)].sort()
  return { bytes, log }
}

// ── CLI ────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? (process.argv[i + 1] ?? true) : d }
  const inPath = arg('in'), outPath = arg('out')
  if (!inPath || !outPath) {
    console.error('usage: node clean-tarshid-template.mjs --in <x.xlsx> --out <y.xlsx> [--report r.json] [--empty-light-selection]')
    process.exit(2)
  }
  const src = readFileSync(inPath)
  const { bytes, log } = clean(src, { emptyLightSelection: process.argv.includes('--empty-light-selection') })
  writeFileSync(outPath, bytes)
  const rep = {
    input: inPath, input_sha256: createHash('sha256').update(src).digest('hex'),
    output: outPath, output_sha256: createHash('sha256').update(bytes).digest('hex'),
    ...log,
  }
  const rp = arg('report'); if (rp) writeFileSync(rp, JSON.stringify(rep, null, 1) + '\n')
  console.log(JSON.stringify(rep, null, 1))
}
