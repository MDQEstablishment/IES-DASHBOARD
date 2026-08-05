-- ===========================================================================
-- 0136 — SCOPE EXCLUSIONS: the escape hatch that makes the gates enforceable
-- Saving Sheet U4 (design §5 U4, §0.1)
-- ===========================================================================
-- Until now `low-savings`, `capacity-out` and `type-mismatch` were COSMETIC.
-- savingSheet.js computed them, SavingSheetTab.jsx drew them as coloured chips,
-- and a sheet with any number of them generated anyway. TARSHID's Instr. sheet
-- states them as requirements, so U4 promotes them to BLOCKING readiness items.
--
-- A blocking gate needs a legitimate way out, or it is not a gate — it is a
-- deadlock that the first person to hit it will route around by editing survey
-- data until the flag disappears. The design (§5 U4) names the two honest
-- exits: RESOLVE the row (a different replacement, a corrected survey) or
-- EXPLICITLY EXCLUDE it from replacement scope. This migration builds the
-- second one, and builds it so that it cannot be taken quietly:
--
--   "No silent override; an exclusion is recorded with who and why."
--
-- WHY COLUMNS ON survey_entries AND NOT A SEPARATE TABLE. The exclusion is a
-- property OF the surveyed row — one row, one decision, no history to model
-- (the audit trigger already keeps the history, and it has since 0027). A
-- side table would need its own RLS, its own uniqueness, and a join on every
-- read of the saving-sheet table, to hold at most one row per entry.
-- ---------------------------------------------------------------------------
alter table public.survey_entries
  add column if not exists scope_excluded        boolean not null default false,
  add column if not exists scope_exclusion_reason text,
  add column if not exists scope_excluded_by      uuid references public.profiles(id),
  add column if not exists scope_excluded_at      timestamptz;

comment on column public.survey_entries.scope_excluded is
  'U4 — this surveyed row is deliberately out of REPLACEMENT scope. It leaves the saving sheet''s totals and stops blocking generation. Never set silently: the trigger below stamps who and refuses a blank reason.';
comment on column public.survey_entries.scope_exclusion_reason is
  'U4 — why. Free text, required, never blank. This is what a TARSHID reviewer reads when they ask why a surveyed unit is not in the replacement list.';
comment on column public.survey_entries.scope_excluded_by is
  'U4 — WHO decided, stamped from the session by the trigger. Never taken from the client payload while a session exists.';
comment on column public.survey_entries.scope_excluded_at is
  'U4 — when. Stamped by the trigger; re-stamped when the REASON changes, because a new reason is a new decision.';

-- ---------------------------------------------------------------------------
-- THE ATTRIBUTION IS NOT NEGOTIABLE, AND NOT SUPPLIED BY THE CALLER.
--
-- PostgREST lets a client send any column it has UPDATE rights to, so
-- "recorded with who" is worth nothing if the client chooses the who. The
-- trigger takes the actor from the SESSION (auth.uid()) and discards whatever
-- arrived in the payload.
--
-- The auth.uid() IS NULL branch is not a hole. It is unreachable from the
-- application: survey_entries' UPDATE policy is
-- `created_by = auth.uid() OR w_proj(project_id)` and both sides need a uid, so
-- an anonymous session cannot reach this trigger at all. The branch exists for
-- server-side contexts that have no JWT — migrations, the proof block below, a
-- future service job — and even there it REFUSES an unattributed exclusion; it
-- merely accepts an explicitly named actor instead of inventing one.
-- ---------------------------------------------------------------------------
create or replace function public.survey_scope_exclusion_stamp()
returns trigger
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  actor uuid := auth.uid();
begin
  if not coalesce(new.scope_excluded, false) then
    -- Un-excluding wipes the record clean. Leaving a stale reason behind would
    -- put "excluded because the room is being demolished" on a row that is back
    -- in scope, which is worse than no reason at all.
    new.scope_excluded          := false;
    new.scope_exclusion_reason  := null;
    new.scope_excluded_by       := null;
    new.scope_excluded_at       := null;
    return new;
  end if;

  new.scope_exclusion_reason := nullif(btrim(coalesce(new.scope_exclusion_reason, '')), '');
  if new.scope_exclusion_reason is null then
    raise exception 'a scope exclusion needs a reason — this row would leave the saving sheet with nothing recorded as to why'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT'
     or not coalesce(old.scope_excluded, false)
     or new.scope_exclusion_reason is distinct from old.scope_exclusion_reason then
    -- a new exclusion, or a new REASON for one: a fresh decision, freshly attributed
    if actor is not null then
      new.scope_excluded_by := actor;
    elsif new.scope_excluded_by is null then
      raise exception 'a scope exclusion must be attributable, and this session has no authenticated user to attribute it to'
        using errcode = 'check_violation';
    end if;
    new.scope_excluded_at := now();
  else
    -- an untouched exclusion keeps its ORIGINAL attribution; an unrelated edit
    -- to the row must not silently re-sign someone else's decision
    new.scope_excluded_by := old.scope_excluded_by;
    new.scope_excluded_at := old.scope_excluded_at;
  end if;
  return new;
end
$fn$;

comment on function public.survey_scope_exclusion_stamp() is
  'U4 — stamps scope-exclusion attribution from the session and refuses a blank reason. The client cannot choose who excluded a row.';

drop trigger if exists survey_entries_scope_exclusion on public.survey_entries;
create trigger survey_entries_scope_exclusion
  before insert or update on public.survey_entries
  for each row execute function public.survey_scope_exclusion_stamp();

-- The trigger normalises; the constraint is what makes the normalisation a
-- GUARANTEE rather than a habit. Belt and braces on purpose: a future
-- `alter table ... disable trigger` would otherwise silently reopen the hole.
alter table public.survey_entries
  drop constraint if exists survey_entries_scope_exclusion_attributed;
alter table public.survey_entries
  add constraint survey_entries_scope_exclusion_attributed check (
    (scope_excluded = false
       and scope_exclusion_reason is null
       and scope_excluded_by is null
       and scope_excluded_at is null)
    or
    (scope_excluded = true
       and scope_exclusion_reason is not null
       and btrim(scope_exclusion_reason) <> ''
       and scope_excluded_by is not null
       and scope_excluded_at is not null)
  );

-- Reading the saving sheet's row table means reading exclusions for a whole
-- project at once; this keeps that from degrading into a seq scan as the
-- survey grows. Partial, because the overwhelming majority of rows are not
-- excluded and indexing `false` 50,000 times buys nothing.
create index if not exists survey_entries_scope_excluded_idx
  on public.survey_entries (project_id)
  where scope_excluded;

-- ===========================================================================
-- PROOF (0128/0131 idiom — exercise it, then clean up to exact counts)
-- ===========================================================================
do $pf$
declare
  n int;
  v_project uuid; v_building uuid; v_actor uuid; v_actor2 uuid; v_entry uuid;
  t_stamp timestamptz;
  c_entries bigint;
  ok boolean;
begin
  -- 1. shape
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'survey_entries'
     and column_name in ('scope_excluded','scope_exclusion_reason','scope_excluded_by','scope_excluded_at');
  if n <> 4 then raise exception 'FAIL: expected the 4 exclusion columns, found %', n; end if;

  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'survey_entries'
     and column_name = 'scope_excluded' and is_nullable = 'NO' and column_default = 'false';
  if n <> 1 then raise exception 'FAIL: scope_excluded must be NOT NULL DEFAULT false — every pre-U4 row is in scope'; end if;

  select count(*) into n from pg_constraint
   where conrelid = 'public.survey_entries'::regclass
     and conname = 'survey_entries_scope_exclusion_attributed';
  if n <> 1 then raise exception 'FAIL: the attribution constraint is missing'; end if;

  select count(*) into n from pg_trigger
   where tgrelid = 'public.survey_entries'::regclass
     and tgname = 'survey_entries_scope_exclusion' and not tgisinternal;
  if n <> 1 then raise exception 'FAIL: the stamping trigger is missing'; end if;

  -- 2. every existing row is in scope and unmarked — this migration changes no data
  select count(*) into n from public.survey_entries
   where scope_excluded or scope_exclusion_reason is not null
      or scope_excluded_by is not null or scope_excluded_at is not null;
  if n <> 0 then raise exception 'FAIL: % existing rows came out of the migration already excluded', n; end if;

  -- 3. BEHAVIOUR. Needs a real row, so build a disposable project and remove it.
  select count(*) into c_entries from public.survey_entries;
  select id into v_actor  from public.profiles order by created_at limit 1;
  select id into v_actor2 from public.profiles where id <> v_actor order by created_at limit 1;
  if v_actor is null then
    raise notice 'SKIP: no profile exists to attribute a test exclusion to; shape proven, behaviour not exercised';
    return;
  end if;

  insert into public.projects (name, code)
    values ('U4 exclusion proof — delete me', 'U4PROOF')
    returning id into v_project;
  insert into public.buildings (project_id, name, code)
    values (v_project, 'Proof building', 'U4PROOF-B1')
    returning id into v_building;
  insert into public.survey_entries (project_id, building_id, category, qty, created_by, equipment_type, model)
    values (v_project, v_building, 'ac', 1, v_actor, 'Split AC', 'PROOF-1')
    returning id into v_entry;

  -- 3a. a blank reason is refused
  ok := false;
  begin
    update public.survey_entries set scope_excluded = true, scope_exclusion_reason = '   ' where id = v_entry;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: an exclusion with a blank reason was accepted'; end if;

  -- 3b. a real exclusion stamps who and when, from the supplied actor (no JWT here)
  update public.survey_entries
     set scope_excluded = true,
         scope_exclusion_reason = '  Unit serves a plant room scheduled for demolition  ',
         scope_excluded_by = v_actor
   where id = v_entry;
  select count(*) into n from public.survey_entries
   where id = v_entry and scope_excluded
     and scope_exclusion_reason = 'Unit serves a plant room scheduled for demolition'   -- trimmed
     and scope_excluded_by = v_actor and scope_excluded_at is not null;
  if n <> 1 then raise exception 'FAIL: the exclusion was not stamped and trimmed as expected'; end if;

  -- 3c. THE FORGERY GUARD. An unrelated edit that also tries to re-sign the
  -- decision — exactly the shape of a hand-crafted PostgREST PATCH — leaves the
  -- original attribution standing, because the reason did not change and the
  -- trigger restores OLD over whatever the payload claimed.
  select scope_excluded_at into t_stamp from public.survey_entries where id = v_entry;
  update public.survey_entries
     set remarks = 'unrelated edit',
         scope_excluded_by = coalesce(v_actor2, v_actor),
         scope_excluded_at = now() - interval '30 days'
   where id = v_entry;
  select count(*) into n from public.survey_entries
   where id = v_entry and scope_excluded_by = v_actor and scope_excluded_at = t_stamp;
  if n <> 1 then raise exception 'FAIL: an unrelated edit re-signed or back-dated someone else''s decision'; end if;

  -- 3d. a NEW REASON is a NEW DECISION, so it is re-attributed to whoever made
  -- it. Proven by the ACTOR moving, not by the timestamp: scope_excluded_at is
  -- now(), the TRANSACTION clock, so two decisions inside one transaction carry
  -- the same instant by design — pg_sleep cannot move it and a test that
  -- expected it to would be testing a fiction.
  if v_actor2 is not null then
    update public.survey_entries
       set scope_exclusion_reason = 'Revised: the tenant vacated instead',
           scope_excluded_by = v_actor2
     where id = v_entry;
    select count(*) into n from public.survey_entries
     where id = v_entry and scope_excluded_by = v_actor2
       and scope_exclusion_reason = 'Revised: the tenant vacated instead';
    if n <> 1 then raise exception 'FAIL: changing the reason did not re-attribute the decision'; end if;
  else
    raise notice 'SKIP 3d: only one profile exists, so re-attribution cannot be observed';
  end if;

  -- 3e. un-excluding wipes the record clean
  update public.survey_entries set scope_excluded = false where id = v_entry;
  select count(*) into n from public.survey_entries
   where id = v_entry and scope_excluded = false and scope_exclusion_reason is null
     and scope_excluded_by is null and scope_excluded_at is null;
  if n <> 1 then raise exception 'FAIL: un-excluding left a stale reason or attribution behind'; end if;

  raise notice 'PASS: blank reason refused, exclusion stamped and trimmed, attribution stable across unrelated edits, re-stamped on a new reason, un-exclusion wipes clean';

  -- 4. cleanup to EXACT counts
  delete from public.survey_entries where id = v_entry;
  delete from public.buildings where id = v_building;
  delete from public.projects where id = v_project;
  select count(*) into n from public.survey_entries;
  if n <> c_entries then raise exception 'FAIL: survey_entries left at %, started at %', n, c_entries; end if;
  select count(*) into n from public.projects where code = 'U4PROOF';
  if n <> 0 then raise exception 'FAIL: the proof project survived'; end if;
  raise notice 'PASS: every table the proof touched is back to its starting count';
end
$pf$;
