// supabase/functions/extract-delivery-pdf/index.ts
// Sprint 8D — read a supplier delivery-note PDF with Claude Haiku 4.5 and return
// structured lines matched against the materials catalog. Enforces a hard monthly
// cap (1000 extractions) and logs cost/tokens for every call (success or failure).
//
// Inputs : { project_id: uuid, pdf_path: string }  (PDF already uploaded to the
//           private `delivery-notes` bucket by the client)
// Output : { extracted, lines_with_matches }  | { error, message }
// Secret : ANTHROPIC_API_KEY (Edge Function secret — never logged or echoed)

import { createClient } from "jsr:@supabase/supabase-js@2";

const MODEL = "claude-haiku-4-5-20251001";
const MONTHLY_CAP = 1000;
// Haiku 4.5 token pricing (USD per million tokens) — used only for the cost log.
const PRICE_IN = 1.0, PRICE_OUT = 5.0;
const WRITE_ROLES = ["admin", "pmo", "projm", "progm", "procm", "proco", "proje"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const EXTRACT_TOOL = {
  name: "record_delivery_note",
  description: "Record the structured contents of a supplier delivery note.",
  input_schema: {
    type: "object",
    properties: {
      supplier: { type: ["string", "null"] },
      po_ref: { type: ["string", "null"] },
      invoice_no: { type: ["string", "null"] },
      delivery_date: { type: ["string", "null"], description: "ISO YYYY-MM-DD or null" },
      delivery_to_address: { type: ["string", "null"] },
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            material_code: { type: ["string", "null"] },
            material_description: { type: "string" },
            qty: { type: "number" },
            unit: { type: ["string", "null"] },
            raw_text: { type: "string" },
          },
          required: ["material_description", "qty", "raw_text"],
        },
      },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
    },
    required: ["lines", "confidence"],
  },
};

const SYSTEM = [
  "You extract structured data from supplier delivery notes (Saudi Arabia; text may be Arabic, English or mixed, and the PDF may be scanned).",
  "Return ONE call to record_delivery_note. Rules:",
  "- One entry in `lines` per delivered material row in the document's line-item table.",
  "- `qty` must be a number. If a unit is shown (pcs, set, box, m, kg…), put it in `unit`.",
  "- `material_code` only if an explicit code/SKU is printed; otherwise null.",
  "- `raw_text` = the original row text as printed (keep Arabic as-is, do not translate).",
  "- `delivery_date` as ISO YYYY-MM-DD if present, else null.",
  "- Never invent rows or quantities. Set confidence honestly.",
].join("\n");

const tokenize = (s: string) =>
  (s || "").toLowerCase().replace(/[^a-z0-9؀-ۿ\s]/g, " ").split(/\s+/).filter((t) => t.length > 1);

function bestMatch(line: any, catalog: any[]) {
  const code = (line.material_code || "").trim().toLowerCase();
  if (code) {
    const exact = catalog.find((m) => (m.code || "").toLowerCase() === code);
    if (exact) return { m: exact, type: "code" };
  }
  const lt = tokenize(line.material_description);
  if (!lt.length) return null;
  let best: any = null, bestScore = 0;
  for (const m of catalog) {
    const ct = new Set(tokenize((m.name || "") + " " + (m.code || "")));
    if (!ct.size) continue;
    const hit = lt.filter((t) => ct.has(t)).length;
    const score = hit / lt.length; // share of the line's tokens found in the candidate
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return bestScore >= 0.75 ? { m: best, type: "fuzzy" } : null;
}

// Fuzzy-match a line's description to a CATEGORY (tier 2) when no variant matched,
// so the UI can offer a one-click "create variant under this category".
function bestCategory(line: any, categories: any[]) {
  const lt = tokenize(line.material_description);
  if (!lt.length) return null;
  let best: any = null, bestScore = 0;
  for (const c of categories) {
    const ct = new Set(tokenize((c.name_en || "") + " " + (c.code || "")));
    if (!ct.size) continue;
    const hit = lt.filter((t) => ct.has(t)).length;
    const score = hit / lt.length;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return bestScore >= 0.75 ? { c: best } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let project_id = "", pdf_path = "", userId: string | null = null;
  // best-effort logger; never throws
  const log = async (ok: boolean, extra: Record<string, unknown> = {}) => {
    try {
      await admin.from("pdf_extraction_log").insert({
        project_id: project_id || null, created_by: userId, success: ok, ...extra,
      });
    } catch (_) { /* logging must never break the response */ }
  };

  try {
    if (!ANTHROPIC_API_KEY) return json({ error: "extraction_failed", message: "Extraction is not configured." }, 500);

    // --- auth: identify the caller and check role -----------------------------
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized", message: "Sign in to extract delivery notes." }, 401);
    userId = u.user.id;
    const { data: prof } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (!prof || !WRITE_ROLES.includes(prof.role)) {
      return json({ error: "unauthorized", message: "Your role can't create deliveries." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    project_id = body.project_id || "";
    pdf_path = body.pdf_path || "";
    if (!project_id || !pdf_path) return json({ error: "invalid_pdf", message: "Missing project or file." }, 400);

    // HEIC/HEIF isn't accepted by the model — reject early (don't spend a cap slot).
    const ext = (pdf_path.split(".").pop() || "").toLowerCase();
    if (ext === "heic" || ext === "heif") {
      return json({ error: "unsupported_format_heic", message: "iPhone HEIC photos aren't supported yet — please save as JPG and re-upload." }, 415);
    }

    // --- monthly cap ----------------------------------------------------------
    const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const { count } = await admin.from("pdf_extraction_log").select("*", { count: "exact", head: true })
      .gte("created_at", monthStart.toISOString());
    if ((count ?? 0) >= MONTHLY_CAP) {
      return json({ error: "monthly_cap_reached", message: `Monthly extraction limit (${MONTHLY_CAP}) reached. Try next month or enter manually.` }, 429);
    }

    // --- download the PDF -----------------------------------------------------
    const dl = await admin.storage.from("delivery-notes").download(pdf_path);
    if (dl.error || !dl.data) { await log(false, { error: "download_failed" }); return json({ error: "invalid_pdf", message: "Could not read the uploaded PDF." }, 400); }
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    let binary = ""; for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);
    // PDF → document block (today's behavior); image → image block. Haiku 4.5 is
    // multimodal and reads scanned PDFs and photos directly.
    const isPdf = ext === "pdf" || (dl.data.type || "") === "application/pdf";
    const imgMime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    const pages = isPdf ? ((binary.match(/\/Type\s*\/Page[^s]/g) || []).length || null) : 1;
    const mediaBlock = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
      : { type: "image", source: { type: "base64", media_type: imgMime, data: b64 } };

    // --- call Claude (forced tool = guaranteed JSON shape) --------------------
    const ar = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        temperature: 0,
        system: SYSTEM,
        tools: [EXTRACT_TOOL],
        tool_choice: { type: "tool", name: "record_delivery_note" },
        messages: [{
          role: "user",
          content: [
            mediaBlock,
            { type: "text", text: "Extract this delivery note." },
          ],
        }],
      }),
    });

    if (!ar.ok) {
      const t = await ar.text();
      await log(false, { pages, error: `anthropic_${ar.status}` });
      console.error("anthropic error", ar.status, t.slice(0, 300));
      return json({ error: "extraction_failed", message: "The AI could not read this PDF. Enter it manually." }, 502);
    }
    const resp = await ar.json();
    const usage = resp.usage || {};
    const tokens_in = usage.input_tokens ?? null, tokens_out = usage.output_tokens ?? null;
    const cost_usd = ((tokens_in || 0) / 1e6) * PRICE_IN + ((tokens_out || 0) / 1e6) * PRICE_OUT;
    const toolBlock = (resp.content || []).find((c: any) => c.type === "tool_use");
    if (!toolBlock?.input) { await log(false, { pages, tokens_in, tokens_out, cost_usd, error: "no_tool_use" }); return json({ error: "extraction_failed", message: "The AI returned no structured data." }, 502); }
    const extracted = toolBlock.input;
    if (!Array.isArray(extracted.lines) || extracted.lines.length === 0) {
      await log(false, { pages, tokens_in, tokens_out, cost_usd, error: "no_lines" });
      return json({ error: "extraction_failed", message: "No delivery lines were found in the PDF." }, 422);
    }

    // --- match each line: exact/fuzzy variant, else fuzzy category ------------
    const { data: catalog } = await admin.from("materials").select("id,code,name,unit,esm_id,category_id,brand");
    const { data: categories } = await admin.from("material_categories").select("id,code,name_en,default_unit,esm_id");
    const lines_with_matches = extracted.lines.map((ln: any) => {
      const mt = bestMatch(ln, catalog || []);
      if (mt) {
        return {
          ...ln, matched: true, match_type: mt.type,
          material_id: mt.m.id, catalog_code: mt.m.code, catalog_name: mt.m.name,
          catalog_unit: mt.m.unit, esm_id: mt.m.esm_id,
          matched_category_id: mt.m.category_id || null, suggested_brand: null,
        };
      }
      // no variant — try to at least pin the category so the UI can offer "create variant"
      const cat = bestCategory(ln, categories || []);
      return {
        ...ln, matched: false, match_type: null,
        material_id: null, catalog_code: null, catalog_name: null, catalog_unit: cat?.c?.default_unit || ln.unit || null, esm_id: cat?.c?.esm_id || null,
        matched_category_id: cat?.c?.id || null, matched_category_code: cat?.c?.code || null,
        matched_category_name: cat?.c?.name_en || null,
        suggested_brand: (ln.material_code || (ln.material_description || "").split(/\s+/)[0] || "").slice(0, 40) || null,
      };
    });

    await log(true, { pages, tokens_in, tokens_out, cost_usd });
    return json({ extracted, lines_with_matches });
  } catch (e) {
    await log(false, { error: "exception" });
    console.error("extract-delivery-pdf exception", String(e).slice(0, 300));
    return json({ error: "extraction_failed", message: "Unexpected error. Please try again or enter manually." }, 500);
  }
});
