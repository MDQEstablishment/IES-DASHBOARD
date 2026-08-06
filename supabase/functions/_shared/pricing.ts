// supabase/functions/_shared/pricing.ts
//
// ONE PRICE TABLE. Every Edge Function that spends Anthropic tokens meters them
// from here, so the numbers in `ai_runs.cost_usd` and `pdf_extraction_log` are
// comparable by construction rather than by coincidence.
//
// WHAT THIS REPLACED, AND WHY IT WAS NOT MERELY UNTIDY. The table existed in
// three places:
//   · murshid-chat/core.ts:450        — full, with cache pricing
//   · saving-sheet-agent/index.ts:47  — byte-identical copy of the above
//   · extract-delivery-pdf/index.ts:16 — `PRICE_IN = 1.0, PRICE_OUT = 5.0`, a
//     PARTIAL copy: Haiku only, and NO cache pricing at all. Its cost line
//     (`:208`) therefore charged cache-read and cache-write tokens at zero,
//     UNDER-REPORTING every cached call — and the model id it priced was itself
//     hardcoded, so pointing that function at Sonnet would have billed it at
//     Haiku rates without a word.
//
// core.ts carried the comment "Same table and rounding as the 9D-4 agent, so
// the two meters agree." That was a promise maintained by hand across two files
// and contradicted by a third. It is now true by construction.
//
// PRICES ARE USD PER MILLION TOKENS, published list prices, used for LOG
// ESTIMATES ONLY — the authoritative bill is Anthropic's. When a model is added
// to ai_settings its row belongs here in the same commit, or `priceOf` will
// quietly fall back to DEFAULT_PRICE.

export type ModelPrice = { in: number; out: number; cacheRead: number; cacheWrite: number };

export const PRICE: Record<string, ModelPrice> = {
  "claude-haiku-4-5-20251001": { in: 1.0, out: 5.0, cacheRead: 0.1, cacheWrite: 1.25 },
  "claude-sonnet-4-5-20250929": { in: 3.0, out: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
};

// An UNKNOWN model is priced as the most expensive thing we run, deliberately:
// a wrong estimate that is too high trips the monthly cap early and someone
// looks; one that is too low spends real money and says nothing.
export const DEFAULT_PRICE: ModelPrice = { in: 3.0, out: 15.0, cacheRead: 0.3, cacheWrite: 3.75 };

export const priceOf = (m: string): ModelPrice => PRICE[m] || DEFAULT_PRICE;

export type Usage = {
  tokens_in?: number; tokens_out?: number; cache_read?: number; cache_write?: number;
};

/** USD for one call, rounded to the micro-dollar the ai_runs column stores. */
export function estimateCostUsd(model: string, u: Usage): number {
  const p = priceOf(model);
  const cost =
    ((u.tokens_in || 0) * p.in +
      (u.tokens_out || 0) * p.out +
      (u.cache_read || 0) * p.cacheRead +
      (u.cache_write || 0) * p.cacheWrite) / 1_000_000;
  return Math.round(cost * 1e6) / 1e6;
}

/**
 * The four usage numbers, read out of an Anthropic `messages` response in one
 * place. Every caller was destructuring `resp.usage` by hand, and the one that
 * forgot `cache_read_input_tokens` is exactly the under-reporting bug above.
 */
export function usageOf(resp: unknown): Required<Usage> {
  const u = ((resp as { usage?: Record<string, number> })?.usage) || {};
  return {
    tokens_in: u.input_tokens || 0,
    tokens_out: u.output_tokens || 0,
    cache_read: u.cache_read_input_tokens || 0,
    cache_write: u.cache_creation_input_tokens || 0,
  };
}
