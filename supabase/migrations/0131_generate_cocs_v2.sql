-- COC Builder, unit 3 of 5 — generate_cocs learns to say no, and two fences close.
--
-- Units 1 and 2 were inert: a ledger nothing wrote and a read RPC nothing
-- called. This one puts them into the write path, and closes the two holes the
-- design's own self-review found (§11) plus the audit hole §5 named.
--
-- Three things happen here, all additive (CREATE OR REPLACE on functions, one
-- new trigger; nothing is dropped):
--
--   1. generate_cocs re-verifies eligibility, refuses mixed beneficiaries, and
--      writes coc_claims — per row, in a subtransaction, so one bad row cannot
--      take the good ones down with it.
--   2. the cocs state fence grows a DELETE branch: outside the RPC GUC only a
--      draft may be deleted.
--   3. coc_covered_buildings gets the same GUC fence, because coverage that can
--      be edited behind the claims ledger's back makes the ledger a liar.
--
-- ---------------------------------------------------------------------------
-- 1. THE RETURN CONTRACT — UNCHANGED FOR SUCCESS, DELIBERATELY
--
-- CocGenerateWizard.jsx:107 reads exactly three things: `data.ok`, `data.coc_ids`
-- and `data.error`. That shape is preserved byte for byte:
--
--     success   {ok: true,  created: <int>, coc_ids: [...], errors: [...]}
--     refusal   {ok: false, error: 'forbidden' | 'invalid_project'}
--
-- `errors` is NEW and additive; the shipped wizard ignores unknown keys, so it
-- keeps working untouched until unit 4 replaces it.
--
-- `ok` STAYS TRUE WHEN SOME ROWS FAIL, and that is a decision worth defending.
-- The wizard aborts the whole run on `!data.ok` — so returning false on a
-- partial failure would abandon certificates the call had already created,
-- leaving orphan drafts with no PDFs. `ok` therefore means "the call was
-- authorised and processed"; per-row outcomes live in `errors`, and `coc_ids`
-- contains exactly the rows that succeeded. A wizard that ignores `errors`
-- degrades to today's behaviour — silently skipping rows it cannot create,
-- which is precisely what the current code already does for rows carrying
-- `exists_coc_id`. Unit 4 renders `errors` and the silence ends.
--
-- Row indices in `errors` are ZERO-BASED, matching the JS array the caller sent.
--
-- ---------------------------------------------------------------------------
-- ELIGIBILITY IS NOT RE-IMPLEMENTED HERE — IT IS READ FROM coc_pool
--
-- The design's self-review caught the version of this where the RPC trusted the
-- rows it was sent. The fix is not to paste the predicate into a second place
-- (two copies drift, and the copy that drifts is the one nobody reads); it is to
-- call coc_pool(p_project_id) — the single source of truth from 0130 — once per
-- invocation and index it by (building_id, esm_code). A pair absent from that
-- map has no scope; a pair present with ready = false is incomplete. Both fail
-- the row, and the error names the pair with its planned and installed counts so
-- the caller can say WHY rather than just "no".
--
-- coc_pool is SECURITY INVOKER and generate_cocs is SECURITY DEFINER, so the
-- pool runs here as the definer and its RLS scoping does not apply. THAT IS SAFE
-- ONLY BECAUSE generate_cocs HAS ALREADY CALLED can_read_project(p_project_id)
-- ABOVE — the caller is known to be entitled to this project before the pool is
-- read, and the pool is read for no other project. If that check is ever removed
-- from the top of this function, this call becomes a cross-project read. It is
-- written here so that nobody removes it by accident.
--
-- ---------------------------------------------------------------------------
-- ONE SUBTRANSACTION PER ROW, AND WHY THE SEQUENCE COUNTER IS TOUCHED LAST
--
-- Each row's three inserts — cocs, coc_covered_buildings, coc_claims — live in
-- a BEGIN/EXCEPTION block, so a claims collision rolls back that row's
-- certificate too. Without it the loser of a race would leave a numbered draft
-- certificate covering pairs it does not own.
--
-- plpgsql variables are NOT rolled back with a subtransaction, so `v_seq` is
-- advanced on the LAST line inside the block, after every insert has succeeded.
-- A failed row therefore does not burn a certificate number, and the next row
-- reuses it.
--
-- The handler discriminates on CONSTRAINT_NAME rather than assuming every
-- unique violation is a claims collision: `coc_claims_pkey` is
-- 'already_claimed' and names the pairs (re-queried AFTER the rollback, so it
-- reports the claims that were already there, not the ones we just tried to
-- write); anything else is reported as 'conflict' with the constraint name
-- instead of being mislabelled. Non-unique errors are deliberately NOT caught —
-- an unexpected failure should abort loudly rather than be swallowed per row.
--
-- ---------------------------------------------------------------------------
-- 2. THE DELETE FENCE (design §5)
--
-- cocs_state_fence covered INSERT and UPDATE only, and cocs_write is FOR ALL, so
-- today any manager can `delete from cocs where status = 'sent'` and the
-- certificate, its coverage and (since 0129) its claims vanish with it. For a
-- document the programme submits to TARSHID that is an audit hole. Outside the
-- GUC, DELETE is now allowed only on a draft.
--
-- The DELETE branch runs BEFORE the `if v_rpc then return new` early exit,
-- because on DELETE there is no NEW — returning it from a BEFORE trigger would
-- return NULL and silently cancel the delete. That ordering is load-bearing.
--
-- KNOWN UI CONSEQUENCE, FLAGGED FOR UNIT 4: CocHome.jsx:167 renders a Delete
-- button on every certificate regardless of status, and its confirm dialog even
-- has copy for the sent/approved case. Deleting an issued certificate now fails
-- with the message below, which CocHome surfaces verbatim in its error toast —
-- so the message is written for a human, not for a log. The button belongs
-- behind a draft check; that is a src/ change and this commit is migration-only.
--
-- ---------------------------------------------------------------------------
-- 3. FENCING coc_covered_buildings (design §11c)
--
-- The self-review's adversarial walk: a direct insert into coc_covered_buildings
-- widens a draft's rectangle without touching coc_claims, so the CERTIFICATE
-- covers a pair no claim records — the claims invariant holds while coverage
-- lies about it, and a second certificate can then legitimately claim that pair
-- and print it too. Same GUC, same idiom as the cocs fence.
--
-- Verified before writing it: nothing in src/ writes this table. The three call
-- sites (CocGenerateWizard.jsx:122, CocDetailDrawer.jsx:22, CocHome.jsx:42) are
-- all SELECTs, and the only functions that write it are generate_cocs and
-- create_coc_revision, both of which raise the GUC first. Client SELECT is
-- untouched.
--
-- THE DELETE BRANCH HAS A CASCADE EXEMPTION, AND IT IS NOT A LOOPHOLE.
-- coc_covered_buildings hangs off cocs and buildings by ON DELETE CASCADE, and a
-- BEFORE DELETE trigger on the child DOES fire when the parent cascade runs —
-- verified empirically against this database before this was written. Fencing
-- DELETE naively would therefore break the one client path the design says must
-- keep working: CocHome deleting a draft. The discriminator is that referential
-- integrity fires the child delete AFTER the parent row is gone, so inside the
-- trigger the parent is invisible:
--
--     direct delete of a coverage row   -> parent coc visible    -> refused
--     cascade from cocs or buildings    -> parent already gone   -> allowed
--
-- Measured, not assumed: coc_parent_exists was true in the direct case and
-- false in the cascade case. Narrowing a live certificate's coverage by hand is
-- what gets refused; tidying up after a deleted parent is what gets through.
--
-- ---------------------------------------------------------------------------
-- A CAVEAT ABOUT THE GUC THAT THE PROOF BELOW HAD TO WORK AROUND
--
-- set_config('app.coc_rpc', 'on', true) is TRANSACTION-local, not
-- function-local. Once any of these RPCs runs, the fences are open for the rest
-- of that transaction. Through PostgREST that is harmless — every request is its
-- own transaction and the flag dies with it — but it means (a) the proof block
-- must clear the GUC by hand before every fence assertion, or it would be
-- testing nothing, and (b) any FUTURE server-side function that calls one of
-- these RPCs and then writes cocs or coverage directly would find the fences
-- already open. No such function exists today. Naming it so that it is a known
-- property rather than a surprise.

-- ---------------------------------------------------------------------------
-- 1. generate_cocs, extended
-- ---------------------------------------------------------------------------
create or replace function public.generate_cocs(p_project_id uuid, p_rows jsonb default null::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rows    jsonb;
  v_row     jsonb;
  v_i       int;
  v_proj    record;
  v_seq     int;
  v_try_seq int;
  v_id      uuid;
  v_code    text;
  v_esm     text[];
  v_bids    uuid[];
  v_created uuid[] := '{}';
  v_errors  jsonb  := '[]'::jsonb;
  v_pool    jsonb  := '{}'::jsonb;
  v_bad     jsonb;
  v_names   text[];
  v_claimed jsonb;
  v_con     text;
begin
  if public.auth_role() <> all (array['admin','pmo','projm','progm','proje']::public.user_role[]) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  -- Load-bearing for the coc_pool call below: see the header.
  if not public.can_read_project(p_project_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select id, code into v_proj from projects where id = p_project_id and deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid_project'); end if;

  perform set_config('app.coc_rpc', 'on', true);

  v_rows := coalesce(p_rows, coc_plan_preview(p_project_id));

  -- Eligibility, read once from the single source of truth (0130), indexed as
  -- '<building_id>|<esm_code>'. Claims do not affect readiness, so one read at
  -- the top stays correct for every row in the batch.
  select coalesce(jsonb_object_agg(p.building_id::text || '|' || p.esm_code,
           jsonb_build_object('ready', p.ready, 'planned', p.planned, 'installed', p.installed)),
         '{}'::jsonb)
    into v_pool
  from public.coc_pool(p_project_id) p;

  select coalesce(max(seq), 0) into v_seq from cocs where project_id = p_project_id;

  for v_row, v_i in
    select t.val, (t.ord - 1)::int
      from jsonb_array_elements(v_rows) with ordinality as t(val, ord)
  loop
    -- Unchanged from 0083/0114: a row the planner already matched to a live
    -- certificate is skipped, not failed. Not an error; not reported as one.
    if v_row->>'exists_coc_id' is not null then continue; end if;

    v_esm  := array(select jsonb_array_elements_text(v_row->'esm_codes'));
    v_bids := array(select (jsonb_array_elements_text(v_row->'building_ids'))::uuid);
    if coalesce(array_length(v_esm, 1), 0) = 0 or coalesce(array_length(v_bids, 1), 0) = 0 then
      continue;
    end if;

    -- (a) every pair must be in the pool AND ready
    select coalesce(jsonb_agg(jsonb_build_object(
             'building_id', x.bid,
             'esm_code',    x.ecode,
             'planned',     coalesce((v_pool -> (x.bid::text || '|' || x.ecode) ->> 'planned')::bigint, 0),
             'installed',   coalesce((v_pool -> (x.bid::text || '|' || x.ecode) ->> 'installed')::bigint, 0)
           ) order by x.bid, x.ecode), '[]'::jsonb)
      into v_bad
    from (
      select t1.bid, t2.ecode
        from unnest(v_bids) as t1(bid)
        cross join unnest(v_esm) as t2(ecode)
    ) x
    where coalesce((v_pool -> (x.bid::text || '|' || x.ecode) ->> 'ready')::boolean, false) is not true;

    if jsonb_array_length(v_bad) > 0 then
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object('row', v_i, 'error', 'not_ready', 'pairs', v_bad));
      continue;
    end if;

    -- (b) one certificate, one beneficiary
    select array_agg(distinct a.beneficiary_name) into v_names
      from coc_beneficiary_assignments a
     where a.project_id = p_project_id
       and a.building_id = any (v_bids)
       and a.beneficiary_name is not null;

    if coalesce(array_length(v_names, 1), 0) > 1 then
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object('row', v_i, 'error', 'mixed_beneficiary', 'names', to_jsonb(v_names)));
      continue;
    end if;

    -- (c) create it, claims and all, or none of it
    v_try_seq := v_seq + 1;
    v_id      := gen_random_uuid();
    v_code    := v_proj.code || '-COC-' || lpad(v_try_seq::text, 3, '0');
    begin
      insert into cocs (id, project_id, seq, code, reference_no, esm_bundle, esm_codes,
                        revision, root_coc_id, status, created_by)
      values (v_id, p_project_id, v_try_seq, v_code, v_code, array_to_string(v_esm, '+'), v_esm,
              1, v_id, 'draft', auth.uid());

      insert into coc_covered_buildings (coc_id, building_id)
      select distinct v_id, t.bid from unnest(v_bids) as t(bid);

      insert into coc_claims (project_id, building_id, esm_code, root_coc_id)
      select distinct p_project_id, t1.bid, t2.ecode, v_id
        from unnest(v_bids) as t1(bid)
        cross join unnest(v_esm) as t2(ecode);

      -- last: a variable assignment survives a subtransaction rollback, so a
      -- failed row must not have advanced the certificate number.
      v_seq     := v_try_seq;
      v_created := v_created || v_id;
    exception when unique_violation then
      get stacked diagnostics v_con = constraint_name;
      if v_con = 'coc_claims_pkey' then
        -- after the rollback, so these are the claims that were already there
        select coalesce(jsonb_agg(jsonb_build_object(
                 'building_id', cc.building_id,
                 'esm_code',    cc.esm_code,
                 'claim_root',  cc.root_coc_id) order by cc.building_id, cc.esm_code), '[]'::jsonb)
          into v_claimed
          from coc_claims cc
         where cc.building_id = any (v_bids)
           and cc.esm_code    = any (v_esm);
        v_errors := v_errors || jsonb_build_array(
          jsonb_build_object('row', v_i, 'error', 'already_claimed', 'pairs', v_claimed));
      else
        v_errors := v_errors || jsonb_build_array(
          jsonb_build_object('row', v_i, 'error', 'conflict', 'constraint', v_con));
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'created', coalesce(array_length(v_created, 1), 0),
    'coc_ids', to_jsonb(v_created),
    'errors', v_errors);
end $function$;

-- ---------------------------------------------------------------------------
-- 2. the cocs state fence, now with a DELETE branch
-- ---------------------------------------------------------------------------
create or replace function public.cocs_state_fence()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_rpc boolean := coalesce(current_setting('app.coc_rpc', true), '') = 'on';
begin
  -- DELETE FIRST: on delete there is no NEW, and returning NEW from a BEFORE
  -- trigger would return NULL and cancel the operation outright.
  if tg_op = 'DELETE' then
    if not v_rpc and old.status <> 'draft' then
      raise exception 'This certificate has already been issued — it can be superseded with a new revision, but not deleted'
        using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;

  if v_rpc then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A hand-made row may only ever be a fresh draft.
    if new.status <> 'draft'
       or new.generated_at is not null
       or new.sent_at is not null
       or new.pdf_path is not null
       or coalesce(new.revision, 1) <> 1
       or new.superseded_by_coc_id is not null then
      raise exception 'A certificate can only be created as a draft — use generate_cocs() or create_coc_revision()'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if new.status               is distinct from old.status
     or new.pdf_path             is distinct from old.pdf_path
     or new.generated_at         is distinct from old.generated_at
     or new.sent_at              is distinct from old.sent_at
     or new.revision             is distinct from old.revision
     or new.superseded_by_coc_id is distinct from old.superseded_by_coc_id
     or new.root_coc_id          is distinct from old.root_coc_id
     or new.seq                  is distinct from old.seq
     or new.code                 is distinct from old.code
     or new.reference_no         is distinct from old.reference_no then
    raise exception 'A certificate''s state is set by the certificate workflow, not by direct edit'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end $$;

drop trigger if exists trg_cocs_state_fence on public.cocs;
create trigger trg_cocs_state_fence
  before insert or update or delete on public.cocs
  for each row execute function public.cocs_state_fence();

-- ---------------------------------------------------------------------------
-- 3. the coverage fence
-- ---------------------------------------------------------------------------
create or replace function public.coc_covered_buildings_fence()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_rpc boolean := coalesce(current_setting('app.coc_rpc', true), '') = 'on';
begin
  if v_rpc then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    -- Cascade exemption, measured not assumed: referential integrity fires this
    -- trigger only after the parent row has gone, so an invisible parent means
    -- "the certificate or the building was deleted", not "a client is narrowing
    -- a live certificate's coverage". Without this, deleting a draft from
    -- CocHome would be blocked by its own cascade.
    if not exists (select 1 from public.cocs c where c.id = old.coc_id)
       or not exists (select 1 from public.buildings b where b.id = old.building_id) then
      return old;
    end if;
  end if;

  raise exception 'A certificate''s coverage is set by the certificate workflow, not by direct edit'
    using errcode = 'insufficient_privilege';
end $$;

drop trigger if exists trg_coc_covered_buildings_fence on public.coc_covered_buildings;
create trigger trg_coc_covered_buildings_fence
  before insert or update or delete on public.coc_covered_buildings
  for each row execute function public.coc_covered_buildings_fence();

-- ---------------------------------------------------------------------------
-- PROOF — T1-RPC, T2-RPC, T3, T4, T6, T-fence-cb, mixed batch
-- ---------------------------------------------------------------------------
-- Runs as `authenticated`; fixtures created and removed inside the block; every
-- table seeded is asserted back to its starting count, audit_log included.
--
-- NOTE THE set_config('app.coc_rpc', '', true) CALLS. The GUC is transaction-
-- local, so every generate_cocs / mark_* / create_coc_revision call in this
-- block leaves the fences open behind it. Each fence assertion clears the flag
-- first; without that the T6 and T-fence-cb tests would pass while proving
-- nothing at all.
do $$
declare
  v_pmo   uuid; v_other uuid; v_mat text;
  v_proj  uuid := gen_random_uuid();
  v_b1 uuid; v_b2 uuid; v_b3 uuid; v_b4 uuid;
  v_pe1 uuid; v_pe2 uuid;
  v_s31 uuid; v_sx uuid;
  v_res jsonb; v_ids uuid[] := '{}'; v_tmp uuid[]; v_il uuid;
  v_coc uuid; v_rev uuid; v_draft uuid;
  n bigint; blocked boolean; v_err text;
  -- c_* are the starting counts and are never reassigned; s_* are mid-test
  -- snapshots, kept separate so a snapshot cannot quietly become the baseline.
  c_proj bigint; c_bld bigint; c_pe bigint; c_bis bigint; c_il bigint;
  c_coc bigint; c_ccb bigint; c_claim bigint; c_ben bigint; c_audit bigint; c_ledger bigint;
  s_coc bigint; s_claim bigint;
begin
  select count(*) into c_proj   from public.projects;
  select count(*) into c_bld    from public.buildings;
  select count(*) into c_pe     from public.project_esms;
  select count(*) into c_bis    from public.building_item_scope;
  select count(*) into c_il     from public.install_log;
  select count(*) into c_coc    from public.cocs;
  select count(*) into c_ccb    from public.coc_covered_buildings;
  select count(*) into c_claim  from public.coc_claims;
  select count(*) into c_ben    from public.coc_beneficiary_assignments;
  select count(*) into c_audit  from public.audit_log;
  select count(*) into c_ledger from public.stock_ledger;

  select id into v_pmo   from public.profiles where role = 'pmo'   and not archived limit 1;
  select id into v_other from public.profiles where role = 'projm' and not archived limit 1;
  select code into v_mat from public.materials order by code limit 1;
  if v_pmo is null or v_mat is null then
    raise notice 'SKIPPED — needs a pmo profile and a material to build fixtures';
    return;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pmo::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ---- fixtures ----------------------------------------------------------
  insert into public.projects (id, code, name, pm_id)
    values (v_proj, 'ZZ0131', 'generate_cocs v2 proof fixture', v_pmo);
  v_ids := v_ids || v_proj;

  insert into public.buildings (project_id, code, name, scope_status)
    values (v_proj, 'ZZ0131-B1', 'B1', 'in_scope'::public.building_scope_status) returning id into v_b1;
  insert into public.buildings (project_id, code, name, scope_status)
    values (v_proj, 'ZZ0131-B2', 'B2', 'in_scope'::public.building_scope_status) returning id into v_b2;
  insert into public.buildings (project_id, code, name, scope_status)
    values (v_proj, 'ZZ0131-B3', 'B3', 'in_scope'::public.building_scope_status) returning id into v_b3;
  insert into public.buildings (project_id, code, name, scope_status)
    values (v_proj, 'ZZ0131-B4', 'B4', 'in_scope'::public.building_scope_status) returning id into v_b4;
  v_ids := v_ids || v_b1 || v_b2 || v_b3 || v_b4;

  insert into public.project_esms (project_id, esm_id, ordinal)
    select v_proj, e.id, 1 from public.esms e where e.code = 'ESM1' returning id into v_pe1;
  insert into public.project_esms (project_id, esm_id, ordinal)
    select v_proj, e.id, 2 from public.esms e where e.code = 'ESM2' returning id into v_pe2;
  v_ids := v_ids || v_pe1 || v_pe2;

  -- ready pairs: B1xE1, B2xE1, B1xE2, B2xE2, B4xE1
  -- not ready:   B3xE1 (9/10, completed mid-test), B3xE2 (3/8, stays incomplete)
  insert into public.building_item_scope (building_id, project_esm_id, sub_type, material_code, planned_qty)
    values (v_b1, v_pe1, 'M', v_mat, 10) returning id into v_sx;  v_ids := v_ids || v_sx;
  insert into public.install_log (entry_date, building_id, scope_id, qty, qa_status, installed_by_id)
    values (current_date, v_b1, v_sx, 10, 'pending_qa'::public.install_qa_status, v_pmo) returning id into v_il;
  v_ids := v_ids || v_il;

  insert into public.building_item_scope (building_id, project_esm_id, sub_type, material_code, planned_qty)
    values (v_b2, v_pe1, 'M', v_mat, 10) returning id into v_sx;  v_ids := v_ids || v_sx;
  insert into public.install_log (entry_date, building_id, scope_id, qty, qa_status, installed_by_id)
    values (current_date, v_b2, v_sx, 10, 'pending_qa'::public.install_qa_status, v_pmo) returning id into v_il;
  v_ids := v_ids || v_il;

  insert into public.building_item_scope (building_id, project_esm_id, sub_type, material_code, planned_qty)
    values (v_b1, v_pe2, 'M', v_mat, 5) returning id into v_sx;  v_ids := v_ids || v_sx;
  insert into public.install_log (entry_date, building_id, scope_id, qty, qa_status, installed_by_id)
    values (current_date, v_b1, v_sx, 5, 'pending_qa'::public.install_qa_status, v_pmo) returning id into v_il;
  v_ids := v_ids || v_il;

  insert into public.building_item_scope (building_id, project_esm_id, sub_type, material_code, planned_qty)
    values (v_b2, v_pe2, 'M', v_mat, 5) returning id into v_sx;  v_ids := v_ids || v_sx;
  insert into public.install_log (entry_date, building_id, scope_id, qty, qa_status, installed_by_id)
    values (current_date, v_b2, v_sx, 5, 'pending_qa'::public.install_qa_status, v_pmo) returning id into v_il;
  v_ids := v_ids || v_il;

  insert into public.building_item_scope (building_id, project_esm_id, sub_type, material_code, planned_qty)
    values (v_b4, v_pe1, 'M', v_mat, 2) returning id into v_sx;  v_ids := v_ids || v_sx;
  insert into public.install_log (entry_date, building_id, scope_id, qty, qa_status, installed_by_id)
    values (current_date, v_b4, v_sx, 2, 'pending_qa'::public.install_qa_status, v_pmo) returning id into v_il;
  v_ids := v_ids || v_il;

  insert into public.building_item_scope (building_id, project_esm_id, sub_type, material_code, planned_qty)
    values (v_b3, v_pe1, 'M', v_mat, 10) returning id into v_s31;  v_ids := v_ids || v_s31;
  insert into public.install_log (entry_date, building_id, scope_id, qty, qa_status, installed_by_id)
    values (current_date, v_b3, v_s31, 9, 'pending_qa'::public.install_qa_status, v_pmo) returning id into v_il;
  v_ids := v_ids || v_il;

  insert into public.building_item_scope (building_id, project_esm_id, sub_type, material_code, planned_qty)
    values (v_b3, v_pe2, 'M', v_mat, 8) returning id into v_sx;  v_ids := v_ids || v_sx;
  insert into public.install_log (entry_date, building_id, scope_id, qty, qa_status, installed_by_id)
    values (current_date, v_b3, v_sx, 3, 'pending_qa'::public.install_qa_status, v_pmo) returning id into v_il;
  v_ids := v_ids || v_il;

  -- ---- T2-RPC: a 9-of-10 pair is refused, then accepted ------------------
  v_res := public.generate_cocs(v_proj, jsonb_build_array(jsonb_build_object(
             'building_ids', jsonb_build_array(v_b3), 'esm_codes', jsonb_build_array('ESM1'))));
  if (v_res->>'created')::int <> 0
     or v_res->'errors'->0->>'error' <> 'not_ready'
     or (v_res->'errors'->0->'pairs'->0->>'building_id')::uuid <> v_b3
     or  v_res->'errors'->0->'pairs'->0->>'esm_code' <> 'ESM1'
     or (v_res->'errors'->0->'pairs'->0->>'planned')::bigint <> 10
     or (v_res->'errors'->0->'pairs'->0->>'installed')::bigint <> 9 then
    raise exception 'FAIL (T2-RPC): expected not_ready 10/9, got %', v_res;
  end if;
  select count(*) into n from public.cocs where project_id = v_proj;
  if n <> 0 then raise exception 'FAIL (T2-RPC): a refused row still created % certificate(s)', n; end if;
  raise notice 'PASS (T2-RPC/a): 9 of 10 refused as not_ready, naming the pair with planned 10 / installed 9';

  insert into public.install_log (entry_date, building_id, scope_id, qty, qa_status, installed_by_id)
    values (current_date, v_b3, v_s31, 1, 'pending_qa'::public.install_qa_status, v_pmo) returning id into v_il;
  v_ids := v_ids || v_il;

  v_res := public.generate_cocs(v_proj, jsonb_build_array(jsonb_build_object(
             'building_ids', jsonb_build_array(v_b3), 'esm_codes', jsonb_build_array('ESM1'))));
  if (v_res->>'ok')::boolean is not true or (v_res->>'created')::int <> 1
     or jsonb_array_length(v_res->'errors') <> 0 then
    raise exception 'FAIL (T2-RPC): completing the install should have succeeded, got %', v_res;
  end if;
  v_ids := v_ids || array(select (jsonb_array_elements_text(v_res->'coc_ids'))::uuid);
  raise notice 'PASS (T2-RPC/b): the tenth unit installed -> the same row generates';

  -- ---- T1-RPC: the pair can only be claimed once -------------------------
  v_res := public.generate_cocs(v_proj, jsonb_build_array(jsonb_build_object(
             'building_ids', jsonb_build_array(v_b1, v_b2), 'esm_codes', jsonb_build_array('ESM1'))));
  if (v_res->>'created')::int <> 1 then raise exception 'FAIL (T1-RPC): setup generate failed %', v_res; end if;
  v_coc := (v_res->'coc_ids'->>0)::uuid;
  v_ids := v_ids || v_coc;
  select count(*) into n from public.coc_claims where root_coc_id = v_coc;
  if n <> 2 then raise exception 'FAIL (T1-RPC): expected 2 claims for the rectangle, got %', n; end if;

  select count(*) into s_coc   from public.cocs;      -- snapshot before the losing call
  select count(*) into s_claim from public.coc_claims;
  v_res := public.generate_cocs(v_proj, jsonb_build_array(jsonb_build_object(
             'building_ids', jsonb_build_array(v_b1), 'esm_codes', jsonb_build_array('ESM1'))));
  if (v_res->>'created')::int <> 0
     or v_res->'errors'->0->>'error' <> 'already_claimed'
     or jsonb_array_length(v_res->'errors'->0->'pairs') <> 1
     or (v_res->'errors'->0->'pairs'->0->>'building_id')::uuid <> v_b1
     or  v_res->'errors'->0->'pairs'->0->>'esm_code' <> 'ESM1'
     or (v_res->'errors'->0->'pairs'->0->>'claim_root')::uuid <> v_coc then
    raise exception 'FAIL (T1-RPC): expected already_claimed naming (B1, ESM1), got %', v_res;
  end if;
  select count(*) into n from public.cocs;
  if n <> s_coc then raise exception 'FAIL (T1-RPC): the losing row left a certificate behind (% -> %)', s_coc, n; end if;
  select count(*) into n from public.coc_claims;
  if n <> s_claim then raise exception 'FAIL (T1-RPC): the losing row left claims behind (% -> %)', s_claim, n; end if;
  raise notice 'PASS (T1-RPC): the second certificate is refused already_claimed, and its subtransaction left no coc row and no claims';

  -- ---- T3: one certificate, one beneficiary ------------------------------
  insert into public.coc_beneficiary_assignments (project_id, building_id, beneficiary_name)
    values (v_proj, v_b1, 'Alpha Directorate'), (v_proj, v_b2, 'Beta Directorate');
  v_res := public.generate_cocs(v_proj, jsonb_build_array(jsonb_build_object(
             'building_ids', jsonb_build_array(v_b1, v_b2), 'esm_codes', jsonb_build_array('ESM2'))));
  if (v_res->>'created')::int <> 0
     or v_res->'errors'->0->>'error' <> 'mixed_beneficiary'
     or not (v_res->'errors'->0->'names' @> '["Alpha Directorate"]'::jsonb)
     or not (v_res->'errors'->0->'names' @> '["Beta Directorate"]'::jsonb) then
    raise exception 'FAIL (T3): expected mixed_beneficiary with both names, got %', v_res;
  end if;
  raise notice 'PASS (T3/a): a rectangle spanning two beneficiaries is refused, both names returned';

  update public.coc_beneficiary_assignments set beneficiary_name = 'Alpha Directorate'
   where project_id = v_proj and building_id = v_b2;
  v_res := public.generate_cocs(v_proj, jsonb_build_array(jsonb_build_object(
             'building_ids', jsonb_build_array(v_b1, v_b2), 'esm_codes', jsonb_build_array('ESM2'))));
  if (v_res->>'created')::int <> 1 or jsonb_array_length(v_res->'errors') <> 0 then
    raise exception 'FAIL (T3): one beneficiary should pass, got %', v_res;
  end if;
  v_ids := v_ids || array(select (jsonb_array_elements_text(v_res->'coc_ids'))::uuid);
  raise notice 'PASS (T3/b): the same rectangle under one beneficiary generates';

  -- ---- mixed batch: a bad row must not sink a good one -------------------
  select count(*) into s_coc from public.cocs;
  v_res := public.generate_cocs(v_proj, jsonb_build_array(
             jsonb_build_object('building_ids', jsonb_build_array(v_b3), 'esm_codes', jsonb_build_array('ESM2')),
             jsonb_build_object('building_ids', jsonb_build_array(v_b4), 'esm_codes', jsonb_build_array('ESM1'))));
  if (v_res->>'created')::int <> 1
     or jsonb_array_length(v_res->'errors') <> 1
     or (v_res->'errors'->0->>'row')::int <> 0
     or v_res->'errors'->0->>'error' <> 'not_ready' then
    raise exception 'FAIL (mixed batch): expected 1 created + 1 not_ready at row 0, got %', v_res;
  end if;
  v_ids := v_ids || array(select (jsonb_array_elements_text(v_res->'coc_ids'))::uuid);
  select count(*) into n from public.coc_claims where building_id = v_b4 and esm_code = 'ESM1';
  if n <> 1 then raise exception 'FAIL (mixed batch): the valid row did not claim its pair'; end if;
  select count(*) into n from public.coc_claims where building_id = v_b3 and esm_code = 'ESM2';
  if n <> 0 then raise exception 'FAIL (mixed batch): the refused row claimed a pair'; end if;
  raise notice 'PASS (mixed batch): the valid row generated and claimed, the not_ready row errored at index 0 and claimed nothing';

  -- ---- T-fence-cb: coverage is the workflow's, not the client's ----------
  perform set_config('app.coc_rpc', '', true);   -- the RPCs above left it on
  blocked := false; v_err := null;
  begin
    insert into public.coc_covered_buildings (coc_id, building_id) values (v_coc, v_b4);
  exception when insufficient_privilege then blocked := true; v_err := sqlerrm;
  end;
  if not blocked then raise exception 'FAIL (T-fence-cb): a client widened a certificate''s coverage'; end if;
  blocked := false;
  begin
    delete from public.coc_covered_buildings where coc_id = v_coc and building_id = v_b1;
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'FAIL (T-fence-cb): a client narrowed a live certificate''s coverage'; end if;
  select count(*) into n from public.coc_covered_buildings where coc_id = v_coc;
  if n <> 2 then raise exception 'FAIL (T-fence-cb): generate_cocs should have written 2 coverage rows, found %', n; end if;
  raise notice 'PASS (T-fence-cb): direct INSERT and DELETE are refused; the same rows written through generate_cocs are present';

  -- ---- T4: the revision chain, end to end through the shipped RPCs -------
  select count(*) into s_claim from public.coc_claims;
  v_res := public.mark_coc_generated(v_coc, 'proof/0131.pdf');
  if not (v_res->>'ok')::boolean then raise exception 'FAIL (T4): mark_coc_generated %', v_res; end if;
  v_res := public.mark_coc_sent(v_coc);
  if not (v_res->>'ok')::boolean then raise exception 'FAIL (T4): mark_coc_sent %', v_res; end if;

  -- ---- T6/a: a sent certificate cannot be deleted ------------------------
  perform set_config('app.coc_rpc', '', true);
  blocked := false; v_err := null;
  begin
    delete from public.cocs where id = v_coc;
  exception when insufficient_privilege then blocked := true; v_err := sqlerrm;
  end;
  if not blocked then raise exception 'FAIL (T6): a sent certificate was deleted'; end if;
  raise notice 'PASS (T6/a): deleting a sent certificate is refused — "%"', v_err;

  v_res := public.log_coc_feedback(v_coc, 'rejected', 'proof fixture');
  if not (v_res->>'ok')::boolean then raise exception 'FAIL (T4): log_coc_feedback %', v_res; end if;
  v_res := public.create_coc_revision(v_coc);
  if not (v_res->>'ok')::boolean then raise exception 'FAIL (T4): create_coc_revision %', v_res; end if;
  v_rev := (v_res->>'coc_id')::uuid;  v_ids := v_ids || v_rev;

  select count(*) into n from public.coc_claims;
  if n <> s_claim then raise exception 'FAIL (T4): the revision changed the claim count (% -> %)', s_claim, n; end if;
  select count(*) into n from public.coc_claims where root_coc_id = v_coc;
  if n <> 2 then raise exception 'FAIL (T4): the lineage lost its claims, % left', n; end if;
  select count(*) into n from public.cocs where id = v_rev and root_coc_id = v_coc and revision = 2;
  if n <> 1 then raise exception 'FAIL (T4): the revision did not inherit root_coc_id'; end if;
  select count(*) into n from public.cocs where id = v_coc and status = 'superseded' and superseded_by_coc_id = v_rev;
  if n <> 1 then raise exception 'FAIL (T4): the source was not superseded'; end if;
  raise notice 'PASS (T4): revision inherits the root, source superseded, claims unchanged at 2';

  -- ---- T6/b: the CocHome delete-a-revision path still works --------------
  -- restore the prior revision, then delete the draft revision exactly as
  -- CocHome.jsx:120-123 does: RPC first, then a plain client DELETE.
  v_res := public.restore_prior_coc_revision(v_rev);
  if not (v_res->>'ok')::boolean then raise exception 'FAIL (T6): restore_prior_coc_revision %', v_res; end if;
  perform set_config('app.coc_rpc', '', true);   -- the client DELETE is unfenced
  delete from public.cocs where id = v_rev;
  select count(*) into n from public.cocs where id = v_rev;
  if n <> 0 then raise exception 'FAIL (T6): the draft revision was not deleted'; end if;
  select count(*) into n from public.cocs where id = v_coc and status = 'rejected' and superseded_by_coc_id is null;
  if n <> 1 then raise exception 'FAIL (T6): the prior revision was not restored'; end if;
  select count(*) into n from public.coc_claims where root_coc_id = v_coc;
  if n <> 2 then raise exception 'FAIL (T6): deleting a revision released the lineage''s claims'; end if;
  raise notice 'PASS (T6/b): restore-then-delete of a draft revision works, and the lineage keeps its claims';

  -- ---- T6/c: a plain draft deletes, and releases its pairs ---------------
  perform set_config('app.coc_rpc', '', true);
  select id into v_draft from public.cocs
   where project_id = v_proj and status = 'draft' and id <> v_coc
   order by seq limit 1;
  if v_draft is null then raise exception 'FAIL (T6): no draft left to delete'; end if;
  select count(*) into s_claim from public.coc_claims;
  delete from public.cocs where id = v_draft;
  select count(*) into n from public.cocs where id = v_draft;
  if n <> 0 then raise exception 'FAIL (T6): a draft could not be deleted'; end if;
  select count(*) into n from public.coc_claims;
  if n >= s_claim then raise exception 'FAIL (T6): deleting the draft root did not release its claims'; end if;
  raise notice 'PASS (T6/c): a draft deletes through the plain client path, its coverage cascades past the coverage fence, and its claims are released';

  -- ---- cleanup -----------------------------------------------------------
  reset role;
  perform set_config('request.jwt.claims', '', true);
  -- the fences are the workflow's; the cleanup acts as the workflow
  perform set_config('app.coc_rpc', 'on', true);
  select coalesce(array_agg(id), '{}') into v_tmp from public.cocs where project_id = v_proj;
  v_ids := v_ids || v_tmp;

  delete from public.cocs                    where project_id = v_proj;
  delete from public.coc_beneficiary_assignments where project_id = v_proj;
  delete from public.install_log             where building_id in (v_b1, v_b2, v_b3, v_b4);
  delete from public.building_item_scope     where building_id in (v_b1, v_b2, v_b3, v_b4);
  delete from public.buildings               where project_id = v_proj;
  delete from public.project_esms            where project_id = v_proj;
  delete from public.projects                where id = v_proj;
  delete from public.audit_log               where record_id = any (v_ids);
  -- coc_beneficiary_assignments is keyed (project_id, building_id) and has NO
  -- id column, so audit_trigger_fn writes record_id = NULL for it — those rows
  -- cannot be swept by id and have to be found through the payload. Worth
  -- knowing beyond this cleanup: every audit row for an id-less table is
  -- untraceable to the row it describes. Pre-existing, not this feature's to fix.
  delete from public.audit_log
   where entity_type = 'coc_beneficiary_assignments'
     and coalesce(payload#>>'{new,project_id}', payload#>>'{old,project_id}') = v_proj::text;

  select count(*) into n from public.projects;
  if n <> c_proj then raise exception 'FAIL: projects % -> %', c_proj, n; end if;
  select count(*) into n from public.buildings;
  if n <> c_bld then raise exception 'FAIL: buildings % -> %', c_bld, n; end if;
  select count(*) into n from public.project_esms;
  if n <> c_pe then raise exception 'FAIL: project_esms % -> %', c_pe, n; end if;
  select count(*) into n from public.building_item_scope;
  if n <> c_bis then raise exception 'FAIL: building_item_scope % -> %', c_bis, n; end if;
  select count(*) into n from public.install_log;
  if n <> c_il then raise exception 'FAIL: install_log % -> %', c_il, n; end if;
  select count(*) into n from public.cocs;
  if n <> c_coc then raise exception 'FAIL: cocs % -> %', c_coc, n; end if;
  select count(*) into n from public.coc_covered_buildings;
  if n <> c_ccb then raise exception 'FAIL: coc_covered_buildings % -> %', c_ccb, n; end if;
  select count(*) into n from public.coc_claims;
  if n <> c_claim then raise exception 'FAIL: coc_claims % -> %', c_claim, n; end if;
  select count(*) into n from public.coc_beneficiary_assignments;
  if n <> c_ben then raise exception 'FAIL: coc_beneficiary_assignments % -> %', c_ben, n; end if;
  select count(*) into n from public.stock_ledger;
  if n <> c_ledger then raise exception 'FAIL: stock_ledger % -> %', c_ledger, n; end if;
  select count(*) into n from public.audit_log;
  if n <> c_audit then raise exception 'FAIL: audit_log % -> %', c_audit, n; end if;
  raise notice 'PASS: every table the proof seeded is back to its starting count';
end $$;
