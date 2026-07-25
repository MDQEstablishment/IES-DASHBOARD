-- Sprint 9D-4: AI SAVING-SHEET AGENT — memory, usage log, settings.
-- The AI never does arithmetic (all savings math stays in the deterministic JS
-- lib from 9D-3). It only does judgement work: fuzzy model matching, best
-- replacement choice, conversational adjustment.
--
-- COST DISCIPLINE lives here: model_aliases is PERMANENT MEMORY — a raw model
-- string resolved once (by AI or human) is never sent to the model again, in
-- ANY project. Human decisions (source='human') are never overwritten by AI.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'ai_source') then
    create type public.ai_source as enum ('ai', 'human');
  end if;
end $$;

-- raw surveyed text -> old_model_registry row (global, cross-project)
create table if not exists public.model_aliases (
  id uuid primary key default gen_random_uuid(),
  raw_normalized text not null unique,          -- lower, collapsed whitespace, punctuation-stripped
  raw_sample text,                               -- one original spelling, for humans
  registry_id uuid references public.old_model_registry(id) on delete set null,
  confidence numeric check (confidence >= 0 and confidence <= 1),
  source public.ai_source not null default 'ai',
  reason text,
  times_seen integer not null default 1,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
create index if not exists idx_alias_registry on public.model_aliases(registry_id);

-- remembered best replacement per matched old model (ESCO overrides win)
create table if not exists public.replacement_choices (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null references public.old_model_registry(id) on delete cascade,
  catalog_item_id uuid not null references public.ac_catalog(id) on delete cascade,
  source public.ai_source not null default 'ai',
  reason text,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (registry_id)
);

-- every AI call: what ran, how many rows, tokens, estimated cost
create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  job text not null,                             -- match | replace | adjust
  model text,
  rows_requested integer default 0,
  rows_resolved integer default 0,
  rows_from_cache integer default 0,             -- resolved locally, ZERO tokens
  tokens_in integer, tokens_out integer,
  cache_read_tokens integer, cache_write_tokens integer,
  cost_usd numeric,
  success boolean not null default true,
  error text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_runs_created on public.ai_runs(created_at desc);

-- retunable without a deploy: model per job + monthly USD cap
create table if not exists public.ai_settings (
  key text primary key,
  value text not null,
  description text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.ai_settings (key, value, description) values
  ('model_match', 'claude-haiku-4-5-20251001', 'Model for fuzzy old-model matching (high volume, mechanical)'),
  ('model_replace', 'claude-sonnet-4-5-20250929', 'Model for replacement choice + justification (judgement)'),
  ('monthly_cap_usd', '25', 'Hard monthly spend cap (USD) across all AI agent jobs'),
  ('min_auto_confidence', '0.85', 'Confidence at or above which a match may be bulk-accepted')
on conflict (key) do nothing;

-- touch triggers
drop trigger if exists model_aliases_touch on public.model_aliases;
create trigger model_aliases_touch before update on public.model_aliases
  for each row execute function public.tarshid_ref_touch();
drop trigger if exists replacement_choices_touch on public.replacement_choices;
create trigger replacement_choices_touch before update on public.replacement_choices
  for each row execute function public.tarshid_ref_touch();
drop trigger if exists ai_settings_touch on public.ai_settings;
create trigger ai_settings_touch before update on public.ai_settings
  for each row execute function public.tarshid_ref_touch();

-- RLS: read authenticated; write pmo/admin. The Edge Function uses the service
-- role (bypasses RLS) after checking the caller's role itself.
alter table public.model_aliases enable row level security;
drop policy if exists alias_read on public.model_aliases;
create policy alias_read on public.model_aliases for select to authenticated using (true);
drop policy if exists alias_write on public.model_aliases;
create policy alias_write on public.model_aliases for all to authenticated
  using (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role))
  with check (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role));
grant select, insert, update on public.model_aliases to authenticated;

alter table public.replacement_choices enable row level security;
drop policy if exists repl_read on public.replacement_choices;
create policy repl_read on public.replacement_choices for select to authenticated using (true);
drop policy if exists repl_write on public.replacement_choices;
create policy repl_write on public.replacement_choices for all to authenticated
  using (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role))
  with check (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role));
grant select, insert, update on public.replacement_choices to authenticated;

alter table public.ai_runs enable row level security;
drop policy if exists airuns_read on public.ai_runs;
create policy airuns_read on public.ai_runs for select to authenticated using (true);
grant select on public.ai_runs to authenticated;

alter table public.ai_settings enable row level security;
drop policy if exists aiset_read on public.ai_settings;
create policy aiset_read on public.ai_settings for select to authenticated using (true);
drop policy if exists aiset_write on public.ai_settings;
create policy aiset_write on public.ai_settings for update to authenticated
  using (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role))
  with check (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role));
grant select, update on public.ai_settings to authenticated;

-- audit + realtime
drop trigger if exists audit_model_aliases on public.model_aliases;
create trigger audit_model_aliases after insert or update or delete on public.model_aliases
  for each row execute function public.audit_trigger_fn();
drop trigger if exists audit_replacement_choices on public.replacement_choices;
create trigger audit_replacement_choices after insert or update or delete on public.replacement_choices
  for each row execute function public.audit_trigger_fn();
drop trigger if exists audit_ai_settings on public.ai_settings;
create trigger audit_ai_settings after insert or update or delete on public.ai_settings
  for each row execute function public.audit_trigger_fn();
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='ai_runs') then
    alter publication supabase_realtime add table public.ai_runs;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='model_aliases') then
    alter publication supabase_realtime add table public.model_aliases;
  end if;
end $$;
alter table public.ai_runs replica identity full;
alter table public.model_aliases replica identity full;

-- survey_entries: remember which registry row a survey line resolved to, and
-- whether a human or the AI decided it (human decisions are never overwritten).
alter table public.survey_entries
  add column if not exists registry_id uuid references public.old_model_registry(id) on delete set null,
  add column if not exists match_source public.ai_source,
  add column if not exists match_confidence numeric;
