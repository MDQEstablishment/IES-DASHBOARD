// supabase/functions/_shared/compliance.js
//
// THE TARSHID COMPLIANCE PREDICATE — ONE IMPLEMENTATION, TWO RUNTIMES.
//
// WHY THIS FILE EXISTS. Sprint U3 corrected three defects in the client engine
// (§1.2 C1 capacity term, C2 seasonal factor, C3 truncation). The Edge Function
// carried its own hand-written copy of the same gate and was never corrected,
// so from U3 until this commit the two DISAGREED on live data:
//
//   · the server applied `seasonal` UNCONDITIONALLY inside the 15% gate, so it
//     demanded ≈16.7% raw savings where the client demanded 15% — the server
//     rejected replacement candidates the client would have accepted, and the
//     shortlist the ESCO saw was narrower than the engine's own rules allow;
//   · the server hardcoded `12000` BTU/ton in two places (the group builder and
//     the tonnage scorer) after that number moved into
//     `tarshid_constants.btu_per_ton`;
//   · the server read constants with bare `?? 10 / ?? 15 / ?? 0.9` fallbacks and
//     no allow-list, so a renamed key degraded to a default in silence while the
//     client (which has the allow-list) degraded differently.
//
// The fix is not "copy the client's code across". Copies diverge — that is the
// whole lesson of the paragraph above. This module is the predicate itself, and
// BOTH callers import it:
//
//   · `src/lib/savingSheet.js` (browser JS, bundled by Vite)  → isCompliant()
//   · `supabase/functions/saving-sheet-agent/index.ts` (Deno) → compliant()
//
// CONSTRAINTS THIS FILE MUST KEEP, because they are what make it importable by
// both: plain ES module JavaScript, ZERO imports, no Deno globals, no
// `import.meta.env`, no DOM, no network. Everything it needs arrives as an
// argument. If you are tempted to import something here, put it in the caller.
//
// The parity is pinned by tests/complianceParity.test.mjs, which drives one case
// table through the client adaptor and the server adaptor and asserts identical
// verdicts — including the exact boundaries (14.9 / 15.0 / 15.1 % savings,
// ±10.0 / ±10.1 % capacity, seasonal on and off, BTU_new ≠ BTU_old).

// ── CONSTANTS ───────────────────────────────────────────────────────────────
// ⚠ THIS OBJECT IS AN ALLOW-LIST, NOT JUST A FALLBACK. constsFromRows() below
// does `if (r.key in out)`, so a row in tarshid_constants whose key is missing
// HERE is read from the database and silently discarded. Migration 0135 seeds
// four new keys; they are listed here for that reason, not for their defaults.
// T-K1 pins the round-trip so this cannot regress.
export const CONST_DEFAULTS = {
  tariff_sar_kwh: 0.32,
  seasonal_factor: 0.9,
  capacity_tolerance_pct: 10,
  min_savings_pct: 15,
  // U3 / migration 0135
  lighting_derating: 0.9,          // lighting only — NOT the AC seasonal_factor
  control_derating: 0.9,
  control_savings_fraction: 0.3,
  btu_per_ton: 12000,              // replaces the literals at m2PerTon and oldBtu
}

// `rows` is whatever `select('key,value')` returned. Applying the allow-list on
// BOTH sides is the point: an unknown key is discarded identically, and a key
// that disappears from the table falls back to the same default in the browser
// and in the Edge Function. Previously only the browser had this.
export function constsFromRows(rows) {
  const out = { ...CONST_DEFAULTS }
  ;(rows || []).forEach((r) => { if (r && r.key in out) out[r.key] = Number(r.value) })
  return out
}

// The BTU/ton conversion, from constants, never from a literal. Falls back to
// the default only when the row is absent or unusable — a zero or a NaN here
// would silently zero every capacity in the system.
export function btuPerTon(consts) {
  const v = Number(consts?.btu_per_ton)
  return Number.isFinite(v) && v > 0 ? v : CONST_DEFAULTS.btu_per_ton
}

// ── STRING NORMALISATION ────────────────────────────────────────────────────
export const collapse = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
export const foldCase = (s) => String(s ?? '').toLowerCase()

// U3 — ONE type predicate. computeRow used strict equality while isCompliant
// used bidirectional substring, so the same pair could be a mismatch in one
// place and a match in the other; the Edge Function used a THIRD form (its own
// `normalizeModel` + bidirectional substring), which is how "Split AC" vs
// "Split" was a match on the server and a mismatch in the browser. [EXT] says
// EQUAL, so everything now calls this: normalised equality, and an absent type
// on either side is not a mismatch (nothing to contradict).
export function typeMatches(a, b) {
  const x = collapse(a).toLowerCase(), y = collapse(b).toLowerCase()
  if (!x || !y) return true
  return x === y
}

// ── C2 — THE SEASONAL FACTOR IS A SWITCHABLE TERM ───────────────────────────
// [EXT]'s savings formula contains NO 0.9 factor. The shipped code multiplied by
// consts.seasonal_factor and — worse — applied it inside the 15% gate too, so
// the gate actually demanded ≈16.7% raw.
//
// The design refuses to guess (§1.2 C2): an approved TARSHID AC workbook
// decides, and it is not here yet (§8.1). So the engine is WORKBOOK-FAITHFUL by
// default — no factor — and the factor is reachable only through an explicit
// option, so whichever way T-C2 resolves is a one-line change and never a silent
// one. The constant row stays in tarshid_constants either way, unused until
// then; removing it would destroy the evidence.
//
// `engine` is the switch bag. `engine.applySeasonalFactor !== true` → 1.
export function seasonalTerm(consts, engine = {}) {
  if (!engine || !engine.applySeasonalFactor) return 1
  const f = Number(consts?.seasonal_factor)
  return Number.isFinite(f) && f !== 0 ? f : 1
}

// ── THE TWO GATE TERMS ──────────────────────────────────────────────────────
// The capacity check asks "how far is the replacement from what was surveyed",
// so its denominator is the OLD unit's capacity. This is NOT the energy math
// (which C1 moved to BTU_new) and is unaffected by it.
export function capacityPct(newBtu, oldBtu) {
  return ((newBtu - oldBtu) / oldBtu) * 100
}

// Savings % is independent of qty, EFLH and capacity — the algebraic identity of
// design §1.1, and T-G7 pins it. The seasonal term is the SAME one computeRow
// uses, so the gate can never demand a different number from the one the sheet
// reports.
export function savingsPct(newSeer, oldSeer, consts, engine = {}) {
  return ((newSeer - oldSeer) / newSeer) * seasonalTerm(consts, engine) * 100
}

// ── THE PREDICATE ───────────────────────────────────────────────────────────
// The single verdict. Both callers reduce their own shapes to these six fields
// and call this; nobody re-implements a term.
//
// The ORDER of the checks is part of the contract, because `why` is shown to a
// human: missing data, then capacity, then savings, then equipment type. A
// candidate failing two rules always reports the same one on both sides.
//
// Returns { ok:false, why } or { ok:true, capPct, savPct }.
export function complianceVerdict(
  { oldBtu, oldSeer, newBtu, newSeer, oldType, newType },
  consts,
  engine = {},
) {
  const ob = oldBtu == null ? null : Number(oldBtu)
  const os = oldSeer == null ? null : Number(oldSeer)
  const nb = newBtu == null ? null : Number(newBtu)
  const ns = newSeer == null ? null : Number(newSeer)
  if (!ob || !os || !nb || !ns) return { ok: false, why: 'missing capacity or efficiency' }

  const tol = Number(consts?.capacity_tolerance_pct ?? CONST_DEFAULTS.capacity_tolerance_pct)
  const minSav = Number(consts?.min_savings_pct ?? CONST_DEFAULTS.min_savings_pct)

  const capPct = capacityPct(nb, ob)
  if (Math.abs(capPct) > tol) return { ok: false, why: `capacity ${capPct.toFixed(1)}% outside ±${tol}%` }

  const savPct = savingsPct(ns, os, consts, engine)
  if (savPct < minSav) return { ok: false, why: `savings ${savPct.toFixed(1)}% below ${minSav}%` }

  if (!typeMatches(oldType, newType)) return { ok: false, why: 'different equipment type' }
  return { ok: true, capPct, savPct }
}

// ── THE TWO CALLER ADAPTORS ─────────────────────────────────────────────────
// Both live HERE, next to each other, so a reader can see in one screen that
// they differ only in which field names they unpack — never in arithmetic. This
// is what "agree by construction" means: there is nowhere else for a divergence
// to hide.

// The browser engine's shape: a computed row from computeRow(), and an
// ac_catalog item. `savingSheet.js`'s isCompliant() is exactly this.
export function clientCompliant(row, cat, consts, engine = {}) {
  return complianceVerdict({
    oldBtu: row?.old_btu,
    oldSeer: row?.old_seer,
    newBtu: cat?.capacity_btu,
    newSeer: cat?.seer == null ? cat?.ieer : cat.seer,
    oldType: row?.equipment_type,
    newType: cat?.equipment_type,
  }, consts, engine)
}

// The Edge Function's shape: a `select`-job GROUP (surveyed rows sharing one old
// model, carrying resolved `btu`/`seer`) and an ac_catalog candidate.
export function serverCompliant(group, cat, consts, engine = {}) {
  return complianceVerdict({
    oldBtu: group?.btu,
    oldSeer: group?.seer,
    newBtu: cat?.capacity_btu,
    newSeer: cat?.seer == null ? cat?.ieer : cat.seer,
    oldType: group?.equipment_type,
    newType: cat?.equipment_type,
  }, consts, engine)
}
