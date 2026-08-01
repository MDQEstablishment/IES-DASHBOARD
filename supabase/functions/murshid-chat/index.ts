// supabase/functions/murshid-chat/index.ts
// Sprint 9L(3) — مُرشد's chat endpoint.
//
// This file is deliberately THIN. Every security decision — what may be read,
// what must be refused, what a refusal says, what a call costs — lives in
// core.ts, which is pure and is tested on every commit. Here we do only:
// authenticate, run the queries core.ts describes, call the model, meter.
//
// THE TWO CLIENTS, AND WHY IT MATTERS:
//   userClient  — built from the CALLER's Authorization header. EVERY question
//                 about programme data goes through it, so RLS answers as the
//                 asking user. This is what makes "مُرشد can only see what you
//                 can see" true by construction rather than by promise.
//   admin       — service role, used for exactly three things that are not
//                 about the user's data: reading ai_settings, summing this
//                 month's spend, and writing the meter row. It NEVER reads a
//                 programme table, so it can never widen an answer.
//
// SECRET: MURSHID_API_KEY, falling back to ANTHROPIC_API_KEY. Per Supabase
// project, and each client company has its own project — that is the isolation
// boundary. Never logged, never echoed, never stored in ai_settings (which the
// browser can read).

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  SCREEN_PACKS, SYSTEM_PROMPT, MAX_QUESTION_CHARS, CAP_MESSAGE, DISABLED_MESSAGE,
  screenQuestion, buildContextBlock, estimateCostUsd, capExceeded,
  FORBIDDEN_COLUMNS, FORBIDDEN_TABLES,
} from "./core.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const API_KEY = Deno.env.get("MURSHID_API_KEY") || Deno.env.get("ANTHROPIC_API_KEY");
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let userId: string | null = null;
  let model = "";
  const usage = { tokens_in: 0, tokens_out: 0, cache_read: 0, cache_write: 0, cost: 0 };

  const logRun = async (extra: Record<string, unknown>) => {
    try {
      await admin.from("ai_runs").insert({
        job: "murshid", project_id: null, created_by: userId, model: model || null,
        tokens_in: usage.tokens_in, tokens_out: usage.tokens_out,
        cache_read_tokens: usage.cache_read, cache_write_tokens: usage.cache_write,
        cost_usd: usage.cost, ...extra,
      });
    } catch (_) { /* metering must never break the answer */ }
  };

  try {
    // ---- who is asking ----------------------------------------------------
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized", message: "الرجاء تسجيل الدخول." }, 401);
    userId = u.user.id;

    const body = await req.json().catch(() => ({}));
    const screen: string | null = body.screen ? String(body.screen).slice(0, 60) : null;
    const params: Record<string, string> = body.params && typeof body.params === "object" ? body.params : {};
    const question: string = String(body.question || "").slice(0, MAX_QUESTION_CHARS).trim();
    if (!question) return json({ error: "bad_request", message: "اكتب سؤالك أولاً." }, 400);

    // ---- settings: the flag, the models, the cap --------------------------
    const { data: settingRows } = await admin.from("ai_settings").select("key,value");
    const S: Record<string, string> = {};
    (settingRows || []).forEach((r: { key: string; value: string }) => { S[r.key] = r.value });

    if (String(S.murshid_enabled) !== "true") {
      return json({ refused: true, kind: "disabled", answer: DISABLED_MESSAGE });
    }

    model = (String(S.murshid_escalate) === "true"
      ? S.murshid_model_escalated
      : S.murshid_model) || "claude-haiku-4-5-20251001";

    // ---- the deterministic refusals, BEFORE any spend ---------------------
    const refusal = screenQuestion(question);
    if (refusal) {
      await logRun({ success: true, error: `refused:${refusal.kind}`, rows_requested: 0 });
      return json({ refused: true, kind: refusal.kind, answer: refusal.message });
    }

    // ---- the hard monthly cap, also before any spend ----------------------
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const { data: spendRows } = await admin
      .from("ai_runs").select("cost_usd").eq("job", "murshid")
      .gte("created_at", monthStart.toISOString());
    const spent = (spendRows || []).reduce((a: number, r: { cost_usd: number }) => a + Number(r.cost_usd || 0), 0);
    const cap = Number(S.murshid_monthly_cap_usd ?? 10);
    if (capExceeded(spent, cap)) {
      await logRun({ success: false, error: "cap_exceeded", rows_requested: 0 });
      return json({ refused: true, kind: "cap", answer: CAP_MESSAGE });
    }

    if (!API_KEY) {
      await logRun({ success: false, error: "missing_key", rows_requested: 0 });
      return json({ error: "unconfigured", message: "لم يُضبط مفتاح المساعد بعد." }, 503);
    }

    // ---- context: the allow-list, through the CALLER's client -------------
    const packs = SCREEN_PACKS[screen || ""] || [];
    const sections: { label: string; rows: Record<string, unknown>[] }[] = [];
    let rowCount = 0;
    for (const p of packs) {
      // belt and braces: refuse to run a pack that violates the audit rules,
      // even though auditPacks() is asserted green on every commit
      if (FORBIDDEN_TABLES.includes(p.table)) continue;
      if (p.columns.some((c) => c === "*" || FORBIDDEN_COLUMNS.includes(c))) continue;
      if (p.eq && !params[p.eq.param]) continue;

      let q = userClient.from(p.table).select(p.columns.join(","));
      if (p.eq) q = q.eq(p.eq.column, params[p.eq.param]);
      if (p.order) q = q.order(p.order.column, { ascending: p.order.ascending });
      const { data, error } = await q.limit(p.limit);
      if (error || !data) continue;             // a denied read is simply absent
      rowCount += data.length;
      sections.push({ label: p.label, rows: data as Record<string, unknown>[] });
    }

    const context = buildContextBlock(screen, sections);

    // ---- the model call. System prompt is a CACHED prefix. ----------------
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 900,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: `${context}\n\nسؤال المستخدم:\n${question}` }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      await logRun({ success: false, error: `api_${res.status}`, rows_requested: rowCount });
      console.error("[murshid] model error", res.status, detail.slice(0, 300));
      return json({ error: "upstream", message: "تعذّر الحصول على إجابة الآن. حاول مرة أخرى." }, 502);
    }

    const payload = await res.json();
    usage.tokens_in = payload?.usage?.input_tokens || 0;
    usage.tokens_out = payload?.usage?.output_tokens || 0;
    usage.cache_read = payload?.usage?.cache_read_input_tokens || 0;
    usage.cache_write = payload?.usage?.cache_creation_input_tokens || 0;
    usage.cost = estimateCostUsd(model, usage);

    const answer = (payload?.content || [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text).join("\n").trim();

    await logRun({ success: true, rows_requested: rowCount, rows_resolved: sections.length });
    return json({ answer: answer || "لم أستطع صياغة إجابة. حاول إعادة صياغة السؤال." });
  } catch (e) {
    console.error("[murshid] ", e instanceof Error ? e.message : String(e));
    await logRun({ success: false, error: "exception" });
    return json({ error: "server", message: "حدث خطأ غير متوقع." }, 500);
  }
});
