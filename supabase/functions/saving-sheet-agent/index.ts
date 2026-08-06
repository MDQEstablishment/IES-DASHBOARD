// supabase/functions/saving-sheet-agent/index.ts
// Sprint 9D-4 — the saving-sheet AI agent. FOUR judgement jobs only; the AI
// never does arithmetic (all savings math stays in the deterministic JS lib).
//   job=match    : messy surveyed make/model -> old_model_registry row
//   job=replace  : matched old unit -> best approved ac_catalog replacement
//   job=adjust   : natural-language preference -> re-suggest affected rows
//   job=select   : consolidate into the project's <=20-model submittal shortlist
//
// 9D-4b: `select` proposes only. Every pick is re-verified by the SAME
// deterministic lib the app uses (savingSheet.js isCompliant / proposeSelection)
// before the ESCO sees it; a pick that fails our own ±capacity / ≥savings math
// is dropped and the deterministic best pick fills the gap. Candidates offered
// to the model are pre-filtered to units that already PASS that math, so the
// AI's judgement is spent on consolidation and preference, never on compliance.
//
// Secret: ANTHROPIC_API_KEY — the SAME Edge Function secret already used by
// extract-delivery-pdf (same key, same bill). Never logged or echoed.
//
// COST DISCIPLINE (enforced here, not aspirational):
//  · local resolve first (exact -> normalized -> model_aliases) — cache hits
//    cost ZERO tokens and are reported as rows_from_cache
//  · only true unknowns reach the model, batched in one request per chunk
//  · pre-filtered candidate shortlist per unknown (type + tonnage band), never
//    the full registry
//  · stable system prompt + shared reference block sent as a CACHED prefix
//  · Haiku for matching, Sonnet for replacement (models from ai_settings)
//  · hard monthly USD cap from ai_settings; every call logged to ai_runs
//
// SAFETY: model ids returned by the AI are validated against our real tables —
// an invented id is rejected, never written.
//
// U5 / COMMIT A — THE ENGINE DIVERGENCE IS CLOSED. This file used to carry its
// own hand-written `compliant()`. It never received U3's corrections, so it
// applied the seasonal factor UNCONDITIONALLY inside the 15% gate (demanding
// ≈16.7% raw where the client demands 15%) and rejected candidates the client
// would accept, hardcoded 12000 BTU/ton after that number moved into
// tarshid_constants, and read constants with bare `??` fallbacks and no
// allow-list. All three are gone: the predicate and the constants now come from
// ../_shared/compliance.js, which src/lib/savingSheet.js imports as well — the
// two agree BY CONSTRUCTION, and tests/complianceParity.test.mjs drives one case
// table through both adaptors to keep it that way.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { constsFromRows, btuPerTon, serverCompliant } from "../_shared/compliance.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const WRITE_ROLES = ["admin", "pmo"];
const CHUNK = 25;                     // unknowns per request
const CAND_PER_ROW = 18;              // shortlisted candidates per unknown

// USD per million tokens (log-only estimates)
const PRICE: Record<string, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  "claude-haiku-4-5-20251001": { in: 1.0, out: 5.0, cacheRead: 0.1, cacheWrite: 1.25 },
  "claude-sonnet-4-5-20250929": { in: 3.0, out: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
};
const priceOf = (m: string) => PRICE[m] || { in: 3.0, out: 15.0, cacheRead: 0.3, cacheWrite: 3.75 };

export const normalizeModel = (s: string) =>
  String(s ?? "").toLowerCase()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[^a-z0-9]+/g, " ").trim();

// The BTU→ton conversion is `tarshid_constants.btu_per_ton`, never a literal:
// it is the same number `savingSheet.js` oldBtu()/m2PerTon() read, and a
// hardcoded 12000 here would have made the shortlist score against one
// conversion while the engine computed with another.
const trOf = (r: any, btuTon: number) =>
  Number(r?.tr ?? r?.capacity_tr ?? (r?.t1_btu ? r.t1_btu / btuTon : NaN));

// Candidate shortlist: same equipment type family first, then tonnage band.
function shortlist(unknown: any, pool: any[], limit: number, btuTon: number) {
  const want = normalizeModel(unknown.equipment_type || "");
  const tr = Number(unknown.tr);
  const scored = pool.map((r) => {
    let s = 0;
    const rt = normalizeModel(r.equipment_type || "");
    if (want && rt && (rt.includes(want) || want.includes(rt))) s += 3;
    const rtr = trOf(r, btuTon);
    if (Number.isFinite(tr) && Number.isFinite(rtr)) {
      const d = Math.abs(rtr - tr) / Math.max(tr, 0.1);
      if (d <= 0.1) s += 3; else if (d <= 0.25) s += 2; else if (d <= 0.5) s += 1;
    }
    const nm = normalizeModel(`${r.make || ""} ${r.model_no || r.model || ""}`);
    const um = normalizeModel(`${unknown.make || ""} ${unknown.model || ""}`);
    if (nm && um) {
      const ut = um.split(" ").filter((t) => t.length > 1);
      const hits = ut.filter((t) => nm.includes(t)).length;
      if (ut.length) s += (hits / ut.length) * 4;
    }
    return { r, s };
  });
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.r);
}

const MATCH_TOOL = {
  name: "record_matches",
  description: "Record the best registry match for each surveyed unit.",
  input_schema: {
    type: "object",
    properties: {
      matches: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string", description: "The `key` of the surveyed unit being matched" },
            registry_id: { type: ["string", "null"], description: "id from the supplied candidates, or null if none is right" },
            confidence: { type: "number", description: "0..1" },
            reason: { type: "string", description: "one short sentence" },
          },
          required: ["key", "registry_id", "confidence", "reason"],
        },
      },
    },
    required: ["matches"],
  },
};

const REPLACE_TOOL = {
  name: "record_replacements",
  description: "Record the best approved replacement unit for each old unit.",
  input_schema: {
    type: "object",
    properties: {
      choices: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string" },
            catalog_item_id: { type: ["string", "null"], description: "id from the supplied candidates, or null if none qualifies" },
            confidence: { type: "number" },
            reason: { type: "string", description: "one short sentence justifying the choice" },
          },
          required: ["key", "catalog_item_id", "confidence", "reason"],
        },
      },
    },
    required: ["choices"],
  },
};

const MATCH_SYSTEM = [
  "You match messy field-surveyed air-conditioner descriptions to rows in an approved equipment registry (Saudi Arabia; text may be Arabic, English or mixed, with typos, partial model numbers and inconsistent spacing).",
  "You are given, for each surveyed unit, a shortlist of candidate registry rows. Choose the best candidate or none.",
  "RULES:",
  "- registry_id MUST be one of the supplied candidate ids for that unit, or null. Never invent an id.",
  "- Match on model number first, then make, then capacity (TR) and equipment type.",
  "- A different tonnage is a different unit: do not match across capacities unless the model number is an exact match.",
  "- confidence: 0.9+ only when the model number matches unambiguously; 0.6-0.9 for strong make+capacity evidence; below 0.5 prefer null.",
  "- Return null rather than guessing. A wrong match corrupts a client's savings calculation.",
  "- reason: one short sentence, plain English.",
].join("\n");

const SELECT_TOOL = {
  name: "record_selection",
  description: "Record the consolidated shortlist of approved models this project will standardise on.",
  input_schema: {
    type: "object",
    properties: {
      selection: {
        type: "array",
        items: {
          type: "object",
          properties: {
            catalog_item_id: { type: "string", description: "id from the supplied candidates only" },
            covers: { type: "array", items: { type: "string" }, description: "the group keys this model will replace" },
            reason: { type: "string", description: "one short sentence — why this model earns a slot" },
          },
          required: ["catalog_item_id", "covers", "reason"],
        },
      },
      note: { type: "string", description: "one sentence on anything the ESCO should know (optional)" },
    },
    required: ["selection"],
  },
};

const SELECT_SYSTEM = [
  "You build a material-submittal shortlist for a single air-conditioner retrofit project: the small set of approved models the project will standardise on.",
  "Each surveyed group comes with candidates that ALREADY satisfy every hard constraint (capacity tolerance and minimum savings) — compliance is settled, do not re-judge it.",
  "Your job is consolidation: cover every group with as FEW distinct models as possible, because fewer models means better negotiated pricing and simpler procurement and warranty.",
  "RULES:",
  "- catalog_item_id MUST be one of the supplied candidate ids. Never invent an id.",
  "- A model may only 'cover' a group if that model appears in that group's own candidate list.",
  "- Every group must be covered by exactly one model. Prefer one model covering many groups over several near-identical models.",
  "- Hard ceiling: at most 20 models. If 20 cannot cover everything, cover the groups with the most units and say so in `note`.",
  "- Tie-breakers, in order: covers more units, higher SEER, lower total cost.",
  "- Do NOT compute savings, payback or percentages — the platform computes those and will re-check every pick.",
  "- reason: one short sentence naming the deciding factor.",
].join("\n");

const REPLACE_SYSTEM = [
  "You choose the optimal approved replacement air-conditioner for an existing (old) unit in an energy-efficiency retrofit.",
  "You are given the old unit, the applicable constraints, and a shortlist of approved catalog candidates.",
  "RULES:",
  "- catalog_item_id MUST be one of the supplied candidate ids, or null. Never invent an id.",
  "- Hard constraints: capacity within the stated tolerance of the old unit, and the same equipment type family (window->window, split->split, etc.).",
  "- Among units that satisfy the constraints, prefer higher SEER (more savings), then lower total cost (better payback).",
  "- If nothing satisfies the hard constraints, return null with a reason — do not stretch the constraints.",
  "- Do NOT compute savings, payback or percentages; the platform computes those deterministically. Judge suitability only.",
  "- reason: one short sentence naming the deciding factor.",
].join("\n");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let userId: string | null = null;
  let project_id = "", job = "";
  const usage = { tokens_in: 0, tokens_out: 0, cache_read: 0, cache_write: 0, cost: 0 };
  const logRun = async (extra: Record<string, unknown>) => {
    try {
      await admin.from("ai_runs").insert({
        project_id: project_id || null, job: job || "unknown", created_by: userId,
        tokens_in: usage.tokens_in, tokens_out: usage.tokens_out,
        cache_read_tokens: usage.cache_read, cache_write_tokens: usage.cache_write,
        cost_usd: Math.round(usage.cost * 1e6) / 1e6, ...extra,
      });
    } catch (_) { /* logging must never break the response */ }
  };

  try {
    // ---- auth ------------------------------------------------------------
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized", message: "Sign in to use the AI assistant." }, 401);
    userId = u.user.id;
    const { data: prof } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (!prof || !WRITE_ROLES.includes(prof.role)) {
      return json({ error: "unauthorized", message: "The AI assistant is limited to PMO and admins." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    project_id = body.project_id || "";
    job = body.job || "match";
    const instruction: string = String(body.instruction || "").slice(0, 500);
    if (!project_id) return json({ error: "bad_request", message: "Missing project." }, 400);

    // ---- settings + monthly cap -------------------------------------------
    const { data: settingsRows } = await admin.from("ai_settings").select("key,value");
    const S: Record<string, string> = {};
    (settingsRows || []).forEach((r: any) => { S[r.key] = r.value });
    const capUsd = Number(S.monthly_cap_usd ?? 25);
    const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const { data: spentRows } = await admin.from("ai_runs").select("cost_usd").gte("created_at", monthStart.toISOString());
    const spent = (spentRows || []).reduce((a: number, r: any) => a + Number(r.cost_usd || 0), 0);
    if (spent >= capUsd) {
      return json({ error: "monthly_cap_reached", message: `Monthly AI budget (US$${capUsd}) reached. Raise the cap in Settings or wait for next month — everything else still works.`, spent_usd: spent, cap_usd: capUsd }, 429);
    }

    if (!ANTHROPIC_API_KEY) {
      return json({ error: "not_configured", message: "The AI assistant is not configured (missing key). All other features work normally." }, 503);
    }

    // ---- TARSHID constants, once, through the SHARED allow-list -------------
    // Hoisted out of the two job branches that each loaded it, and read through
    // constsFromRows() so an unknown or renamed key is discarded here exactly as
    // it is in the browser. Previously this branch used `?? 10 / ?? 15 / ?? 0.9`
    // with no allow-list at all, so a renamed key degraded on the server and not
    // on the client — the two then disagreed with nothing to say so.
    const { data: constRows } = await admin.from("tarshid_constants").select("key,value");
    const C = constsFromRows(constRows);
    const BTU_PER_TON = btuPerTon(C);
    const tol = C.capacity_tolerance_pct, minSav = C.min_savings_pct;

    // ---- shared data -------------------------------------------------------
    const { data: entries } = await admin.from("survey_entries")
      .select("id,make,model,equipment_type,tr,qty,inverter,building_id,room_type,size_category,category,catalog_item_id,registry_id,match_source,match_confidence")
      .eq("project_id", project_id).eq("category", "ac");
    const rows = entries || [];

    const callClaude = async (model: string, system: any[], messages: any[], tools: any[], toolName: string) => {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model, max_tokens: 4096, temperature: 0, system, tools,
          tool_choice: { type: "tool", name: toolName }, messages,
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        console.error("anthropic error", r.status, t.slice(0, 300));
        throw new Error(`anthropic_${r.status}`);
      }
      const resp = await r.json();
      const us = resp.usage || {};
      const p = priceOf(model);
      usage.tokens_in += us.input_tokens || 0;
      usage.tokens_out += us.output_tokens || 0;
      usage.cache_read += us.cache_read_input_tokens || 0;
      usage.cache_write += us.cache_creation_input_tokens || 0;
      usage.cost += ((us.input_tokens || 0) / 1e6) * p.in + ((us.output_tokens || 0) / 1e6) * p.out
        + ((us.cache_read_input_tokens || 0) / 1e6) * p.cacheRead + ((us.cache_creation_input_tokens || 0) / 1e6) * p.cacheWrite;
      const block = (resp.content || []).find((c: any) => c.type === "tool_use");
      return block?.input || null;
    };

    // ======================= JOB: MATCH ====================================
    if (job === "match") {
      const model = S.model_match || "claude-haiku-4-5-20251001";
      const { data: registry } = await admin.from("old_model_registry")
        .select("id,equipment_type,make,model_no,tr,t1_btu,equivalent_seer,size_category").eq("retired", false);
      const reg = registry || [];
      if (!reg.length) {
        await logRun({ model, rows_requested: 0, rows_resolved: 0, rows_from_cache: 0, success: false, error: "registry_empty" });
        return json({ error: "registry_empty", message: "The Old Model Registry is empty — import it in Settings → Approved Equipment first." }, 400);
      }
      const regById = new Map(reg.map((r: any) => [r.id, r]));
      const byNormModel = new Map<string, any>();
      reg.forEach((r: any) => { const k = normalizeModel(r.model_no); if (k && !byNormModel.has(k)) byNormModel.set(k, r) });

      // rows still needing a match (delta-only: already-matched rows are skipped)
      const targets = rows.filter((r: any) => !r.registry_id && (r.model || r.make));
      const { data: aliases } = await admin.from("model_aliases").select("raw_normalized,registry_id,confidence,source,reason");
      const aliasMap = new Map((aliases || []).map((a: any) => [a.raw_normalized, a]));

      const resolved: any[] = [];
      const unknowns: any[] = [];
      for (const r of targets) {
        const raw = `${r.make || ""} ${r.model || ""}`.trim();
        const key = normalizeModel(raw);
        if (!key) continue;
        const exact = byNormModel.get(normalizeModel(r.model || ""));
        if (exact) { resolved.push({ entry_id: r.id, registry_id: exact.id, confidence: 1, reason: "Exact model match", source: "exact", raw }); continue }
        const al = aliasMap.get(key);
        if (al?.registry_id) { resolved.push({ entry_id: r.id, registry_id: al.registry_id, confidence: Number(al.confidence ?? 0.9), reason: al.reason || "Previously resolved", source: "alias", raw }); continue }
        unknowns.push({ key, raw, entry_id: r.id, make: r.make, model: r.model, equipment_type: r.equipment_type, tr: r.tr });
      }

      // de-duplicate unknowns by normalized key — one API decision per distinct
      // string, applied to every row that shares it
      const distinct = new Map<string, any>();
      unknowns.forEach((x) => { if (!distinct.has(x.key)) distinct.set(x.key, x) })
      const distinctList = [...distinct.values()];

      const proposals: any[] = []
      for (let i = 0; i < distinctList.length; i += CHUNK) {
        const chunk = distinctList.slice(i, i + CHUNK);
        const candIds = new Set<string>();
        const lines = chunk.map((x) => {
          const cands = shortlist(x, reg, CAND_PER_ROW, BTU_PER_TON);
          cands.forEach((c: any) => candIds.add(c.id));
          return {
            key: x.key,
            surveyed: { make: x.make, model: x.model, equipment_type: x.equipment_type, tr: x.tr },
            candidates: cands.map((c: any) => ({ id: c.id, make: c.make, model_no: c.model_no, equipment_type: c.equipment_type, tr: c.tr, seer: c.equivalent_seer })),
          };
        });
        const system = [
          { type: "text", text: MATCH_SYSTEM, cache_control: { type: "ephemeral" } },
        ];
        const out = await callClaude(model, system, [{ role: "user", content: JSON.stringify({ units: lines }) }], [MATCH_TOOL], "record_matches");
        for (const m of (out?.matches || [])) {
          // SAFETY: the id must exist in our registry AND have been offered
          if (m.registry_id && (!regById.has(m.registry_id) || !candIds.has(m.registry_id))) continue;
          const src = distinct.get(m.key);
          if (!src) continue;
          proposals.push({
            key: m.key, raw: src.raw, registry_id: m.registry_id || null,
            confidence: Math.max(0, Math.min(1, Number(m.confidence) || 0)),
            reason: String(m.reason || "").slice(0, 200),
            entry_ids: unknowns.filter((u) => u.key === m.key).map((u) => u.entry_id),
            registry: m.registry_id ? regById.get(m.registry_id) : null,
          });
        }
      }

      await logRun({
        model, rows_requested: distinctList.length, rows_resolved: proposals.filter((p) => p.registry_id).length,
        rows_from_cache: resolved.length, success: true,
      });
      return json({
        ok: true, job: "match",
        cached: resolved, proposals,
        stats: { targets: targets.length, from_cache: resolved.length, asked: distinctList.length, ...usage },
      });
    }

    // ======================= JOB: REPLACE / ADJUST =========================
    if (job === "replace" || job === "adjust") {
      const model = S.model_replace || "claude-sonnet-4-5-20250929";

      const { data: catalog } = await admin.from("ac_catalog")
        .select("id,description,equipment_type,make,model,size_category,capacity_btu,capacity_tr,seer,ieer,unit_cost,labor_cost").eq("is_active", true);
      const cat = catalog || [];
      const catById = new Map(cat.map((c: any) => [c.id, c]));
      const { data: registry } = await admin.from("old_model_registry").select("id,equipment_type,make,model_no,tr,t1_btu,equivalent_seer");
      const regById = new Map((registry || []).map((r: any) => [r.id, r]));

      const { data: memory } = await admin.from("replacement_choices").select("registry_id,catalog_item_id,source,reason");
      const memMap = new Map((memory || []).map((m: any) => [m.registry_id, m]));

      // delta-only: rows with a matched old model and no replacement yet
      // (adjust re-runs the affected subset the caller names)
      const only: string[] = Array.isArray(body.entry_ids) ? body.entry_ids : [];
      const targets = rows.filter((r: any) => r.registry_id && (job === "adjust" ? (only.length ? only.includes(r.id) : true) : !r.catalog_item_id));

      const cached: any[] = [], unknowns: any[] = [];
      for (const r of targets) {
        const mem = job === "adjust" ? null : memMap.get(r.registry_id);
        if (mem?.catalog_item_id) { cached.push({ entry_id: r.id, catalog_item_id: mem.catalog_item_id, reason: mem.reason || "Previously chosen", source: mem.source, confidence: 1 }); continue }
        unknowns.push({ key: r.registry_id, entry_id: r.id, old: regById.get(r.registry_id) || { make: r.make, model_no: r.model, tr: r.tr } });
      }
      const distinct = new Map<string, any>();
      unknowns.forEach((x) => { if (!distinct.has(x.key)) distinct.set(x.key, x) });
      const distinctList = [...distinct.values()];

      const proposals: any[] = [];
      for (let i = 0; i < distinctList.length; i += CHUNK) {
        const chunk = distinctList.slice(i, i + CHUNK);
        const candIds = new Set<string>();
        const lines = chunk.map((x) => {
          const cands = shortlist({ equipment_type: x.old?.equipment_type, tr: trOf(x.old, BTU_PER_TON), make: x.old?.make, model: x.old?.model_no }, cat, CAND_PER_ROW, BTU_PER_TON);
          cands.forEach((c: any) => candIds.add(c.id));
          return {
            key: x.key,
            old_unit: { make: x.old?.make, model: x.old?.model_no, equipment_type: x.old?.equipment_type, tr: trOf(x.old, BTU_PER_TON), seer: x.old?.equivalent_seer, btu: x.old?.t1_btu },
            candidates: cands.map((c: any) => ({ id: c.id, description: c.description, equipment_type: c.equipment_type, make: c.make, model: c.model, btu: c.capacity_btu, tr: c.capacity_tr, seer: c.seer ?? c.ieer, unit_cost: c.unit_cost, labor_cost: c.labor_cost })),
          };
        });
        const system = [
          { type: "text", text: REPLACE_SYSTEM, cache_control: { type: "ephemeral" } },
          { type: "text", text: `CONSTRAINTS: capacity tolerance ±${tol}% of the old unit's capacity; the retrofit must reach at least ${minSav}% energy savings, which requires a materially higher SEER than the old unit.`, cache_control: { type: "ephemeral" } },
        ];
        const userContent: any[] = [{ type: "text", text: JSON.stringify({ units: lines }) }];
        if (job === "adjust" && instruction) userContent.push({ type: "text", text: `ESCO PREFERENCE (apply where it does not break a hard constraint): ${instruction}` });
        const out = await callClaude(model, system, [{ role: "user", content: userContent }], [REPLACE_TOOL], "record_replacements");
        for (const ch of (out?.choices || [])) {
          if (ch.catalog_item_id && (!catById.has(ch.catalog_item_id) || !candIds.has(ch.catalog_item_id))) continue;  // reject invented ids
          const src = distinct.get(ch.key);
          if (!src) continue;
          proposals.push({
            key: ch.key, registry_id: ch.key, catalog_item_id: ch.catalog_item_id || null,
            confidence: Math.max(0, Math.min(1, Number(ch.confidence) || 0)),
            reason: String(ch.reason || "").slice(0, 200),
            entry_ids: unknowns.filter((u) => u.key === ch.key).map((u) => u.entry_id),
            old: src.old, catalog: ch.catalog_item_id ? catById.get(ch.catalog_item_id) : null,
          });
        }
      }

      await logRun({
        model, rows_requested: distinctList.length, rows_resolved: proposals.filter((p) => p.catalog_item_id).length,
        rows_from_cache: cached.length, success: true,
      });
      return json({
        ok: true, job,
        cached, proposals,
        stats: { targets: targets.length, from_cache: cached.length, asked: distinctList.length, ...usage },
      });
    }

    // ======================= JOB: SELECT (9D-4b) ===========================
    // Propose the project's 'Aprvd Project Unit' shortlist. Compliance is
    // decided HERE by the same formulas as savingSheet.js, and re-decided by
    // that lib on the client before the ESCO sees a single row — the AI only
    // consolidates and applies the ESCO's stated preference.
    if (job === "select") {
      const model = S.model_replace || "claude-sonnet-4-5-20250929";

      const { data: chf } = await admin.from("category_hours_factors").select("assumed_old_eff").eq("category", "ac").maybeSingle();
      const assumedOldEff = Number(chf?.assumed_old_eff) || 8;

      const { data: catalog } = await admin.from("ac_catalog")
        .select("id,description,equipment_type,make,model,capacity_btu,capacity_tr,seer,ieer,unit_cost,labor_cost").eq("is_active", true);
      const cat = catalog || [];
      const catById = new Map(cat.map((c: any) => [c.id, c]));
      const { data: registry } = await admin.from("old_model_registry").select("id,equipment_type,make,model_no,tr,t1_btu,equivalent_seer");
      const regById = new Map((registry || []).map((r: any) => [r.id, r]));
      const { data: bldgs } = await admin.from("buildings").select("id,is_residential").eq("project_id", project_id);
      const residential = new Set((bldgs || []).filter((b: any) => b.is_residential).map((b: any) => b.id));

      // in-scope rows only — residential buildings and inverter units are out
      // of replacement scope and must never pull a model into the shortlist
      const scope = rows.filter((r: any) => !residential.has(r.building_id) && r.inverter !== true);

      // group identical old units: one AI decision serves every row that shares
      // the same old model, which is where most of the token saving comes from
      const groups = new Map<string, any>();
      for (const r of scope) {
        const reg: any = r.registry_id ? regById.get(r.registry_id) : null;
        // BTU/ton from constants — the same conversion savingSheet.js oldBtu()
        // uses. A literal 12000 here was the pre-C1 capacity path.
        const btu = Number(r.tr) > 0 ? Number(r.tr) * BTU_PER_TON : (reg?.t1_btu != null ? Number(reg.t1_btu) : null);
        const seer = reg?.equivalent_seer != null ? Number(reg.equivalent_seer) : assumedOldEff;
        if (!btu || !seer) continue;
        const key = r.registry_id || normalizeModel(`${r.make || ""} ${r.model || ""} ${r.tr || ""}`);
        if (!key) continue;
        const g = groups.get(key) || {
          key, btu, seer, equipment_type: r.equipment_type || reg?.equipment_type || "",
          make: r.make || reg?.make || "", model: r.model || reg?.model_no || "",
          units: 0, entry_ids: [] as string[],
        };
        g.units += Number(r.qty) || 1;
        g.entry_ids.push(r.id);
        groups.set(key, g);
      }
      const groupList = [...groups.values()];

      // compliance — LITERALLY the same code as savingSheet.js isCompliant(),
      // not a re-statement of it. Both are one-line adaptors over
      // complianceVerdict() in ../_shared/compliance.js.
      //
      // What this replaced, and why it mattered: the old body multiplied by
      // `seasonal` unconditionally, so the gate demanded ≈16.7% raw savings
      // while the browser demanded 15% and the sheet reported the raw figure —
      // the server silently withheld compliant units from the shortlist. It
      // also matched equipment types by bidirectional SUBSTRING over
      // normalizeModel(), so "Split" covered "Split AC" here and did not there.
      //
      // `engine` is empty: the shipped default is workbook-faithful (no seasonal
      // factor), exactly as the client ships. When T-C2 resolves, ONE module
      // changes and both runtimes move together.
      const engine = {};
      const compliant = (g: any, c: any) => serverCompliant(g, c, C, engine).ok;
      const optionsFor = new Map<string, any[]>();
      groupList.forEach((g) => optionsFor.set(g.key, cat.filter((c: any) => compliant(g, c))));
      const coverable = groupList.filter((g) => (optionsFor.get(g.key) || []).length > 0);
      const impossible = groupList.filter((g) => (optionsFor.get(g.key) || []).length === 0)
        .map((g) => ({ key: g.key, make: g.make, model: g.model, units: g.units, entry_ids: g.entry_ids }));

      if (!coverable.length) {
        await logRun({ model, rows_requested: 0, rows_resolved: 0, rows_from_cache: 0, success: true, error: "no_compliant_options" });
        return json({ ok: true, job: "select", selection: [], impossible, groups: groupList.length, used_ai: false,
          message: "No approved catalog unit satisfies the capacity and savings rules for these surveyed units.", stats: { ...usage } });
      }

      // A single distinct model needs no judgement — skip the API entirely.
      const distinctOptions = new Set<string>();
      coverable.forEach((g) => (optionsFor.get(g.key) || []).forEach((c: any) => distinctOptions.add(c.id)));
      if (distinctOptions.size <= 1 && !instruction) {
        const only = catById.get([...distinctOptions][0]);
        await logRun({ model, rows_requested: 0, rows_resolved: only ? 1 : 0, rows_from_cache: coverable.length, success: true });
        return json({
          ok: true, job: "select", used_ai: false, groups: groupList.length, impossible,
          selection: only ? [{ catalog_item_id: only.id, covers: coverable.map((g) => g.key), reason: "The only approved unit that satisfies the capacity and savings rules" }] : [],
          group_index: coverable.map((g) => ({ key: g.key, entry_ids: g.entry_ids, units: g.units })),
          stats: { groups: groupList.length, asked: 0, ...usage },
        });
      }

      const proposals: any[] = [];
      let note = "";
      for (let i = 0; i < coverable.length; i += CHUNK) {
        const chunk = coverable.slice(i, i + CHUNK);
        const candIds = new Set<string>();
        const lines = chunk.map((g) => {
          // already-compliant options only, best SEER first, capped for cost
          const opts = (optionsFor.get(g.key) || [])
            .slice()
            .sort((a: any, b: any) => (Number(b.seer ?? b.ieer) || 0) - (Number(a.seer ?? a.ieer) || 0))
            .slice(0, CAND_PER_ROW);
          opts.forEach((c: any) => candIds.add(c.id));
          return {
            key: g.key, units: g.units,
            old_unit: { make: g.make, model: g.model, equipment_type: g.equipment_type, btu: g.btu, seer: g.seer },
            candidates: opts.map((c: any) => ({ id: c.id, description: c.description, make: c.make, model: c.model, btu: c.capacity_btu, seer: c.seer ?? c.ieer, unit_cost: c.unit_cost, labor_cost: c.labor_cost })),
          };
        });
        const system = [
          { type: "text", text: SELECT_SYSTEM, cache_control: { type: "ephemeral" } },
        ];
        const userContent: any[] = [{ type: "text", text: JSON.stringify({ groups: lines }) }];
        if (instruction) userContent.push({ type: "text", text: `ESCO PREFERENCE (apply only where it still covers every group): ${instruction}` });
        const out = await callClaude(model, system, [{ role: "user", content: userContent }], [SELECT_TOOL], "record_selection");
        if (out?.note && !note) note = String(out.note).slice(0, 300);
        for (const s of (out?.selection || [])) {
          // SAFETY: real catalog id, and one we actually offered
          if (!s.catalog_item_id || !catById.has(s.catalog_item_id) || !candIds.has(s.catalog_item_id)) continue;
          // a model may only claim groups whose own candidate list contained it
          const covers = (Array.isArray(s.covers) ? s.covers : [])
            .filter((k: string) => (optionsFor.get(k) || []).some((c: any) => c.id === s.catalog_item_id));
          if (!covers.length) continue;
          proposals.push({ catalog_item_id: s.catalog_item_id, covers, reason: String(s.reason || "").slice(0, 200) });
        }
      }

      await logRun({
        model, rows_requested: coverable.length,
        rows_resolved: proposals.length, rows_from_cache: 0, success: true,
      });
      return json({
        ok: true, job: "select", used_ai: true, note,
        selection: proposals, impossible, groups: groupList.length,
        // the client maps group keys back to survey rows and re-verifies each
        // pick with the deterministic lib before showing anything
        group_index: coverable.map((g) => ({ key: g.key, entry_ids: g.entry_ids, units: g.units })),
        stats: { groups: groupList.length, asked: coverable.length, ...usage },
      });
    }

    return json({ error: "bad_request", message: `Unknown job "${job}".` }, 400);
  } catch (e) {
    const msg = String(e).slice(0, 200);
    await logRun({ rows_requested: 0, rows_resolved: 0, rows_from_cache: 0, success: false, error: msg });
    console.error("saving-sheet-agent exception", msg);
    return json({ error: "agent_failed", message: "The AI assistant is unavailable right now — everything else still works." }, 502);
  }
});
