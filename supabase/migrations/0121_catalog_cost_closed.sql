-- 9L(2b) — task #32, narrowed: catalog cost columns are CLOSED.
--
-- ============================================================================
-- THIS IS A TEMPORARY MECHANISM. The Saving Sheet sprint DROPS this trigger as
-- part of the real catalog_costs split. Do not mistake it for the permanent
-- design: the permanent design is a separate pmo/admin-only catalog_costs
-- table, and it is deferred — not cancelled — because that sprint has to touch
-- src/lib/savingSheet.js anyway, and doing the rewire now and again later is
-- exactly the double work this project forbids.
-- ============================================================================
--
-- THE REQUIREMENT: nobody outside pmo/admin may see catalog costs before any
-- client sees مُرشد.
--
-- WHY THE TWO OBVIOUS MECHANISMS DO NOT WORK. Both were tested against this
-- database and both failed; these are findings, not opinions:
--
--  1. A column-level REVOKE is a silent NO-OP while the table grant stands.
--     Running `revoke select (unit_cost, labor_cost) on lighting_catalog from
--     authenticated` and then reading as a projm returned the column happily —
--     table-level SELECT already covers every column, so the column revoke
--     changes nothing until the table grant is dropped first.
--
--  2. Dropping the table grant hides the costs from pmo TOO. Supabase runs
--     every signed-in user as the single `authenticated` database role; the
--     application roles are distinguished by auth_role() inside RLS, which is
--     row-level and cannot mask a column. So any grant that hides a cost from a
--     project manager hides it from the PMO identically. "Deny projm" and
--     "allow pmo" are not simultaneously expressible through grants here.
--
--  3. A security_invoker view with `case when is_cost_reader() then unit_cost
--     end` would give per-role masking with no application change — but it
--     BREAKS THE TARSHID IMPORT. That import calls
--     .upsert({ onConflict: 'equipment_type,model_no' }), which emits
--     ON CONFLICT, and a view carries no unique constraint for it to bind to.
--     Tested: "there is no unique or exclusion constraint matching the ON
--     CONFLICT specification". Fixing it would mean editing
--     src/lib/tarshidImport.js, a module under the frozen sha256 manifest —
--     the very thing this narrowed approach exists to avoid.
--
--  4. misc_catalog has no cost columns at all, so it is a no-op everywhere.
--
-- THE MECHANISM THAT DOES WORK: forbid the DATA rather than mask it. A cost
-- that cannot be stored cannot be read by anyone, so the requirement is met by
-- construction rather than by a filter that has to be right every time. The
-- columns stay, all 33 code references stay, every read path is untouched, and
-- pmo/admin keep reading the columns exactly as before — they simply stay NULL.
--
-- The one behaviour change: a pmo importing a Tarshid sheet that carries cost
-- columns now gets a clear, readable refusal instead of a silent write. That is
-- the intended outcome before the split, and it costs nothing today because the
-- columns are empty (verified at apply time by the guard below).

-- ---------------------------------------------------------------------------
-- Guard: refuse to install if any cost has been entered since this was written.
-- Installing over real data would make it silently unreachable.
-- ---------------------------------------------------------------------------
do $$
declare n_light int; n_ac int;
begin
  select count(*) into n_light from public.lighting_catalog
   where unit_cost is not null or labor_cost is not null;
  select count(*) into n_ac from public.ac_catalog
   where unit_cost is not null or labor_cost is not null;

  if n_light <> 0 or n_ac <> 0 then
    raise exception
      'ABORT: catalog costs are no longer empty (lighting=%, ac=%). This migration assumes zero populated cost rows; installing it now would strand that data behind a write ban. Move the costs to catalog_costs first, then re-apply.',
      n_light, n_ac;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The trigger
-- ---------------------------------------------------------------------------
create or replace function public.catalog_cost_closed()
returns trigger
language plpgsql
as $$
begin
  if new.unit_cost is not null or new.labor_cost is not null then
    -- Written to be read by a person mid-import, not decoded from a SQLSTATE.
    raise exception
      'Equipment costs are not stored on the % catalogue. Unit cost and labor cost belong in the separate, restricted "catalog_costs" table, which only the PMO and administrators can see. Remove the cost columns from this import (or leave them blank) and the rest of the row will save normally. Offending item: %.',
      tg_table_name,
      coalesce(nullif(btrim(new.model), ''), 'row id ' || coalesce(new.id::text, '(new)'))
      using errcode = 'check_violation',
            hint = 'This restriction is temporary and lifts when the catalog_costs split ships.';
  end if;
  return new;
end $$;

comment on function public.catalog_cost_closed() is
  '9L(2b), TEMPORARY: rejects cost writes on the equipment catalogues so costs cannot be seen by anyone outside pmo/admin before the catalog_costs split. The Saving Sheet sprint drops this trigger as part of that split.';

drop trigger if exists trg_lighting_cost_closed on public.lighting_catalog;
create trigger trg_lighting_cost_closed
  before insert or update on public.lighting_catalog
  for each row execute function public.catalog_cost_closed();

drop trigger if exists trg_ac_cost_closed on public.ac_catalog;
create trigger trg_ac_cost_closed
  before insert or update on public.ac_catalog
  for each row execute function public.catalog_cost_closed();
