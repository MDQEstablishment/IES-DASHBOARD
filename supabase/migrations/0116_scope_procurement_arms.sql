-- 9K(1e) — scope ONLY the projm/proje arms of the procurement family
-- (CRITICAL C1, part 5 of 5 — the last of the sixteen).
--
-- This family is deliberately treated differently from the other four, on the
-- owner's standing instruction: procurement is a PROGRAMME-WIDE function.
-- A procurement manager or coordinator buys, receives and moves stock across
-- every project at once; fencing them to a project would break the job, not
-- secure it. So:
--
--   · READS stay global on all three tables. Untouched, deliberately.
--   · procm, proco, pmo, ceo, progm, admin keep their writes global. Untouched.
--   · Only projm and proje — the two roles whose authority is defined by a
--     project in every other family — are fenced to their own projects.
--
-- The shape of the added conjunct is therefore different from 0112-0115. Rather
-- than an unconditional `and can_read_project(project_id)`, which would fence
-- everybody, it fences by role:
--
--     and (auth_role() <> all (array['projm','proje']::user_role[])
--          or project_id is null
--          or public.can_read_project(project_id))
--
-- Read it as: if you are not one of the two scoped roles, nothing changes.
--
-- THE `project_id is null` ARM IS NOT AN OVERSIGHT — it is the flagged decision.
-- Main-warehouse stock movements are recorded with no project at all: ManageEsms
-- writes material_movements rows whose project_id is NULL, and a projm may use
-- that page today. There is one such row live right now. Fencing NULL-project
-- rows would take main-warehouse recording away from projm and proje, which is
-- a visible loss of function, not a hiding of other projects' rows — so under
-- the owner's rule ("anything that would change what a legitimate user
-- currently SEES or does beyond hiding other projects' rows: stop and flag")
-- the null arm keeps today's behaviour exactly. Tightening it is a separate
-- decision with a UI consequence, and it is not made here.
--
-- material_movements is split across two policies (mm_insert / mm_update) with
-- no DELETE policy at all; that shape is preserved. Note its array has no
-- 'admin' and does have 'ceo' — reproduced verbatim, oddities included.

-- ---------------------------------------------------------------------------
-- material_deliveries  (write policy is granted to public — reproduced as found)
-- ---------------------------------------------------------------------------
drop policy if exists material_deliveries_write on public.material_deliveries;
create policy material_deliveries_write on public.material_deliveries
  for all to public
  using (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'progm'::user_role, 'procm'::user_role, 'proco'::user_role, 'proje'::user_role])
    and (auth_role() <> all (array['projm','proje']::user_role[])
         or project_id is null
         or public.can_read_project(project_id))
  )
  with check (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'progm'::user_role, 'procm'::user_role, 'proco'::user_role, 'proje'::user_role])
    and (auth_role() <> all (array['projm','proje']::user_role[])
         or project_id is null
         or public.can_read_project(project_id))
  );

-- ---------------------------------------------------------------------------
-- stock_ledger  (write policy is granted to public — reproduced as found)
-- ---------------------------------------------------------------------------
drop policy if exists stock_ledger_write on public.stock_ledger;
create policy stock_ledger_write on public.stock_ledger
  for all to public
  using (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'progm'::user_role, 'procm'::user_role, 'proco'::user_role, 'proje'::user_role])
    and (auth_role() <> all (array['projm','proje']::user_role[])
         or project_id is null
         or public.can_read_project(project_id))
  )
  with check (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'progm'::user_role, 'procm'::user_role, 'proco'::user_role, 'proje'::user_role])
    and (auth_role() <> all (array['projm','proje']::user_role[])
         or project_id is null
         or public.can_read_project(project_id))
  );

-- ---------------------------------------------------------------------------
-- material_movements — insert + update, no admin, with ceo; shape preserved
-- ---------------------------------------------------------------------------
drop policy if exists mm_insert on public.material_movements;
create policy mm_insert on public.material_movements
  for insert to authenticated
  with check (
    auth_role() = ANY (ARRAY['procm'::user_role, 'proco'::user_role, 'projm'::user_role, 'progm'::user_role, 'pmo'::user_role, 'ceo'::user_role])
    and (auth_role() <> all (array['projm','proje']::user_role[])
         or project_id is null
         or public.can_read_project(project_id))
  );

drop policy if exists mm_update on public.material_movements;
create policy mm_update on public.material_movements
  for update to authenticated
  using (
    auth_role() = ANY (ARRAY['procm'::user_role, 'proco'::user_role, 'projm'::user_role, 'progm'::user_role, 'pmo'::user_role, 'ceo'::user_role])
    and (auth_role() <> all (array['projm','proje']::user_role[])
         or project_id is null
         or public.can_read_project(project_id))
  )
  with check (
    auth_role() = ANY (ARRAY['procm'::user_role, 'proco'::user_role, 'projm'::user_role, 'progm'::user_role, 'pmo'::user_role, 'ceo'::user_role])
    and (auth_role() <> all (array['projm','proje']::user_role[])
         or project_id is null
         or public.can_read_project(project_id))
  );
