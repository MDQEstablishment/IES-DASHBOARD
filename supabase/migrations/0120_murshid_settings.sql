-- 9L(2a) — مُرشد's non-secret knobs.
--
-- WHERE THE API KEY IS NOT. ai_settings is read straight from the browser by
-- AiUsageMeter through PostgREST, so anything in this table is shipped to every
-- signed-in device. A key stored here would not be "server-side" in any sense
-- worth the words. The assistant's key lives where the existing agent's key
-- already lives: an Edge Function secret (MURSHID_API_KEY, falling back to
-- ANTHROPIC_API_KEY), which is per Supabase project — and since every client
-- company gets its own project and its own deploy, per-project IS per-company.
-- That is the isolation boundary this platform actually has.
--
-- So this table gets only the knobs that are safe to read: whether the
-- assistant is on, which models it may use, and what it may spend.
--
-- murshid_enabled STARTS FALSE and stays false until the red-team suite has a
-- recorded pass against the deployed function. The flag, not the deploy, is the
-- client-exposure gate — which is what lets the code ship and be reviewed
-- without exposing anyone.
--
-- The cap is SEPARATE from monthly_cap_usd so the assistant cannot drain the
-- saving-sheet agent's budget, or vice versa. Both are enforced the same way:
-- the function sums its own runs in ai_runs before calling the model.
--
-- ai_runs needs no change at all — `job` is free text and `project_id` is
-- nullable, so Murshid meters into the existing table as job='murshid'.

insert into public.ai_settings (key, value, description) values
  ('murshid_enabled', 'false',
   'Master switch for the مُرشد assistant chat. Stays false until the red-team suite passes against the deployed function.'),
  ('murshid_model', 'claude-haiku-4-5-20251001',
   'Default model for مُرشد answers (high volume, grounded, cheap).'),
  ('murshid_model_escalated', 'claude-sonnet-4-5-20250929',
   'Model used when مُرشد escalation is switched on for harder questions.'),
  ('murshid_escalate', 'false',
   'When true, مُرشد uses the escalated model instead of the default.'),
  ('murshid_monthly_cap_usd', '10',
   'Hard monthly spend cap (USD) for مُرشد alone, separate from the agent cap.')
on conflict (key) do nothing;
