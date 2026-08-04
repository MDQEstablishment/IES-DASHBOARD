-- COC Builder, unit 2 of 5 — coc_pool(), the one place eligibility is decided.
--
-- §3.3 of the design: a single read RPC that answers "which (building × ESM)
-- pairs exist, how far along is each, and who has claimed it". Step 1's per-ESM
-- counts, Step 2's building list, the coverage matrix and every empty state all
-- read this and nothing else. The UI never computes eligibility itself — a rule
-- that lives in two places is a rule that will disagree with itself, and the
-- one it disagrees with will be the database.
--
-- ---------------------------------------------------------------------------
-- THE ELIGIBILITY PREDICATE, EXACTLY AS IMPLEMENTED
--
-- A pair (building B, ESM E) is IN THE POOL when all of:
--
--   1. B.project_id = p_project_id
--   2. B.status_override is distinct from 'archived'   (building_status enum)
--   3. B.scope_status = 'in_scope'                     (building_scope_status)
--   4. E ∈ project_esms(p_project_id) with archived = false
--   5. at least one building_item_scope line for (B, E) has planned_qty > 0
--
-- and it is READY when, additionally:
--
--   6. EVERY such line s satisfies
--        Σ install_log.qty where scope_id = s.id and qa_status <> 'rejected'
--        >= s.planned_qty
--
-- Rule 3 is worth naming: `scope_status` is a three-valued enum — candidate /
-- in_scope / surplus — and only in_scope buildings are certifiable. A candidate
-- has not been accepted into the programme and a surplus one has been dropped
-- from it; neither is a thing you hand TARSHID a certificate for. Rule 2 uses
-- `is distinct from` rather than `<> 'archived'` because status_override is
-- nullable and `null <> 'archived'` is null, which would silently drop every
-- building whose status has never been overridden — the same shape 0083's
-- coc_plan_preview already uses.
--
-- Rule 6 is the 0100 rule: the QA gate is off and the canonical count is
-- everything NOT REJECTED, so pending_qa counts toward completion. Rejected
-- rows are excluded, which is why the proof below deliberately parks a rejected
-- quantity on a fixture line and asserts it never shows up in `installed`.
--
-- LINES WITH planned_qty = 0 NEITHER BLOCK NOR QUALIFY (T7). They are filtered
-- out before aggregation, which makes both halves true at once: a zero line
-- cannot fail rule 6 (it is not there to fail), and a pair whose lines are ALL
-- zero produces no group at all, so it is not in the pool. This also fixes what
-- `installed` means — it sums only over lines that planned something. A
-- quantity installed against a line that planned nothing is out-of-scope work
-- (0106 gave it its own table, other_installed_items); folding it into a pair's
-- progress would let a pair read 12 of 10 and make the percentage a lie.
--
-- PAIRS WITH NO SCOPE AT ALL ARE NOT RETURNED. The pool contains pairs that
-- exist; the coverage matrix renders '—' for the combinations it does not find,
-- rather than the RPC shipping a row per absent pair. On a project with 200
-- buildings and 6 ESMs that is the difference between 1200 rows and the few
-- hundred that mean something.
--
-- WHAT THIS CANNOT SAY, stated rather than approximated: delivery completeness
-- per building (0066 moved deliveries to a warehouse pool — per-building draw
-- IS install_log, so installation completeness subsumes it) and inspection or
-- handover status (no table carries it). If certification is ever meant to wait
-- on a signed WIR, that is new data, not a cleverer query.
--
-- ---------------------------------------------------------------------------
-- claim_root / claim_coc / claim_status — LINEAGE, NOT ROW
--
-- coc_claims is keyed by the lineage ROOT (0129), so `claim_root` is a straight
-- read. `claim_coc` is the lineage HEAD: the certificate a user should actually
-- open. The head is walked the way 0114 defines the chain — create_coc_revision
-- sets the source's `superseded_by_coc_id` and carries `root_coc_id` forward,
-- so the head is the row in the lineage with NO successor. `order by revision
-- desc limit 1` breaks the one transient tie the workflow can produce:
-- restore_prior_coc_revision clears a prior row's superseded_by_coc_id while
-- the superseding revision still exists, for the moment before the client
-- deletes it. Highest revision wins, which is the row that is really in front.
--
-- All three are NULL when the pair is unclaimed. That is the builder's
-- "offerable" test: ready and claim_root is null.
--
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER, DELIBERATELY
--
-- Nothing here needs elevation. Every table it reads already has the right RLS
-- — buildings and building_item_scope and install_log through
-- can_read_building, cocs and coc_claims through can_read_project — so running
-- as the caller makes the pool inherit the project fence for free and makes it
-- impossible for this function to become a way to read another project's
-- progress. A definer version would have had to re-implement can_read_project
-- internally and would have been one forgotten check away from a leak. The
-- proof below runs it as a projm who runs no project and asserts zero rows.
--
-- The ESM code comes from esms.code via project_esms — the same source
-- coc_plan_preview (0083) uses — not from project_esms.custom_name, so the
-- codes returned here are the codes that end up in cocs.esm_codes.

create or replace function public.coc_pool(p_project_id uuid)
returns table (
  building_id   uuid,
  building_code text,
  building_name text,
  esm_code      text,
  planned       bigint,
  installed     bigint,
  ready         boolean,
  claim_root    uuid,
  claim_coc     uuid,
  claim_status  text
)
language sql
stable
security invoker
set search_path = public
as $$
  with pe as (
    -- rule 4
    select x.id as project_esm_id, e.code as code
      from project_esms x
      join esms e on e.id = x.esm_id
     where x.project_id = p_project_id
       and x.archived = false
  ),
  bld as (
    -- rules 1, 2, 3
    select b.id, b.code, b.name
      from buildings b
     where b.project_id = p_project_id
       and b.status_override is distinct from 'archived'::building_status
       and b.scope_status = 'in_scope'::building_scope_status
  ),
  ln as (
    -- one row per scope line that planned something, with its not-rejected
    -- installed total (the 0100 rule). planned_qty = 0 lines are dropped here,
    -- which is what makes them neither block nor qualify.
    select s.building_id as bid,
           pe.code       as ecode,
           s.planned_qty as planned_qty,
           coalesce((select sum(il.qty)
                       from install_log il
                      where il.scope_id = s.id
                        and il.qa_status <> 'rejected'::install_qa_status), 0) as installed_qty
      from building_item_scope s
      join pe  on pe.project_esm_id = s.project_esm_id
      join bld on bld.id = s.building_id
     where s.planned_qty > 0
  ),
  pr as (
    select ln.bid,
           ln.ecode,
           sum(ln.planned_qty)::bigint   as sum_planned,
           sum(ln.installed_qty)::bigint as sum_installed,
           bool_and(ln.installed_qty >= ln.planned_qty) as all_done
      from ln
     group by ln.bid, ln.ecode
  )
  select pr.bid,
         bld.code,
         bld.name,
         pr.ecode,
         pr.sum_planned,
         pr.sum_installed,
         pr.all_done,
         cl.root_coc_id,
         head.id,
         head.status
    from pr
    join bld on bld.id = pr.bid
    left join coc_claims cl
           on cl.building_id = pr.bid
          and cl.esm_code    = pr.ecode
    left join lateral (
      select c.id, c.status
        from cocs c
       where coalesce(c.root_coc_id, c.id) = cl.root_coc_id
         and c.superseded_by_coc_id is null
       order by c.revision desc
       limit 1
    ) head on true
   order by bld.code, pr.ecode;
$$;

comment on function public.coc_pool(uuid) is
  'The COC builder pool: one row per eligible (building, ESM) pair with its planned/installed totals, readiness and current claim. SECURITY INVOKER — RLS does the project scoping. The single source of truth for eligibility; the UI must not recompute it.';

grant execute on function public.coc_pool(uuid) to authenticated;

-- ── PROOF (T2, T7, non-member, lineage head) ─────────────────────────────────
-- Runs as `authenticated`. Fixtures are created and removed inside the block
-- and every table seeded is asserted back to its starting count, audit_log
-- included.
--
-- install_log rows are seeded as pending_qa on purpose: it is the 0100 rule's
-- interesting case (not rejected, so it counts) and it keeps the fixtures out
-- of stock_ledger, whose trigger fires only on 'approved'.
do $$
declare
  v_pmo    uuid;
  v_other  uuid;
  v_mat    text;
  v_proj   uuid := gen_random_uuid();
  v_b1     uuid;   -- in_scope, the pair under test
  v_b2     uuid;   -- candidate: fully installed, must not appear
  v_b3     uuid;   -- archived:  fully installed, must not appear
  v_pe1    uuid;   -- ESM1
  v_pe2    uuid;   -- ESM2, zero-planned only
  v_s1     uuid;   -- B1 × ESM1, planned 10
  v_s0     uuid;   -- B1 × ESM1, planned 0   (T7)
  v_s2     uuid;   -- B1 × ESM2, planned 0   (T7, the "nor qualify" half)
  v_sb2    uuid;
  v_sb3    uuid;
  v_coc    uuid := gen_random_uuid();
  v_rev    uuid;
  v_il     uuid;
  v_ids    uuid[] := '{}';
  r        record;
  n        bigint;
  c_proj bigint; c_bld bigint; c_pe bigint; c_bis bigint; c_il bigint;
  c_coc bigint; c_ccb bigint; c_claim bigint; c_audit bigint; c_ledger bigint;
  v_res    jsonb;
begin
  select count(*) into c_proj   from public.projects;
  select count(*) into c_bld    from public.buildings;
  select count(*) into c_pe     from public.project_esms;
  select count(*) into c_bis    from public.building_item_scope;
  select count(*) into c_il     from public.install_log;
  select count(*) into c_coc    from public.cocs;
  select count(*) into c_ccb    from public.coc_covered_buildings;
  select count(*) into c_claim  from public.coc_claims;
  select count(*) into c_audit  from public.audit_log;
  select count(*) into c_ledger from public.stock_ledger;

  select id into v_pmo   from public.profiles where role = 'pmo'   and not archived limit 1;
  select id into v_other from public.profiles where role = 'projm' and not archived limit 1;
  select code into v_mat from public.materials order by code limit 1;
  if v_pmo is null or v_mat is null then
    raise notice 'SKIPPED — needs a pmo profile and at least one material to build fixtures';
    return;
  end if;

  -- ---- fixtures, as a real client ---------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pmo::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.projects (id, code, name, pm_id)
    values (v_proj, 'ZZ0130', 'coc_pool proof fixture', v_pmo);
  v_ids := v_ids || v_proj;

  insert into public.buildings (project_id, code, name, scope_status)
    values (v_proj, 'ZZ0130-B1', 'Pool building 1', 'in_scope'::public.building_scope_status)
    returning id into v_b1;
  insert into public.buildings (project_id, code, name, scope_status)
    values (v_proj, 'ZZ0130-B2', 'Pool building 2', 'candidate'::public.building_scope_status)
    returning id into v_b2;
  insert into public.buildings (project_id, code, name, scope_status, status_override)
    values (v_proj, 'ZZ0130-B3', 'Pool building 3', 'in_scope'::public.building_scope_status,
            'archived'::public.building_status)
    returning id into v_b3;
  v_ids := v_ids || v_b1 || v_b2 || v_b3;

  insert into public.project_esms (project_id, esm_id, ordinal)
    select v_proj, e.id, 1 from public.esms e where e.code = 'ESM1'
    returning id into v_pe1;
  insert into public.project_esms (project_id, esm_id, ordinal)
    select v_proj, e.id, 2 from public.esms e where e.code = 'ESM2'
    returning id into v_pe2;
  if v_pe1 is null or v_pe2 is null then
    raise exception 'FAIL: the ESM1/ESM2 catalogue rows the fixtures need are missing';
  end if;
  v_ids := v_ids || v_pe1 || v_pe2;

  -- B1 × ESM1: one real line, planned 10
  insert into public.building_item_scope (building_id, project_esm_id, sub_type, material_code, planned_qty)
    values (v_b1, v_pe1, 'PROOF-MAIN', v_mat, 10) returning id into v_s1;
  -- B2 (candidate) and B3 (archived): fully planned and fully installed, so
  -- their absence proves rules 2 and 3 rather than an empty-scope accident.
  insert into public.building_item_scope (building_id, project_esm_id, sub_type, material_code, planned_qty)
    values (v_b2, v_pe1, 'PROOF-MAIN', v_mat, 4) returning id into v_sb2;
  insert into public.building_item_scope (building_id, project_esm_id, sub_type, material_code, planned_qty)
    values (v_b3, v_pe1, 'PROOF-MAIN', v_mat, 4) returning id into v_sb3;
  v_ids := v_ids || v_s1 || v_sb2 || v_sb3;

  insert into public.install_log (entry_date, building_id, scope_id, qty, qa_status, installed_by_id)
    values (current_date, v_b2, v_sb2, 4, 'pending_qa'::public.install_qa_status, v_pmo)
    returning id into v_il;  v_ids := v_ids || v_il;
  insert into public.install_log (entry_date, building_id, scope_id, qty, qa_status, installed_by_id)
    values (current_date, v_b3, v_sb3, 4, 'pending_qa'::public.install_qa_status, v_pmo)
    returning id into v_il;  v_ids := v_ids || v_il;

  -- 9 of 10 installed, plus a REJECTED 5 that must never be counted (0100).
  insert into public.install_log (entry_date, building_id, scope_id, qty, qa_status, installed_by_id)
    values (current_date, v_b1, v_s1, 9, 'pending_qa'::public.install_qa_status, v_pmo)
    returning id into v_il;  v_ids := v_ids || v_il;
  insert into public.install_log (entry_date, building_id, scope_id, qty, qa_status, installed_by_id)
    values (current_date, v_b1, v_s1, 5, 'rejected'::public.install_qa_status, v_pmo)
    returning id into v_il;  v_ids := v_ids || v_il;

  -- ---- T2, part 1: 9 of 10 is not ready ---------------------------------
  select count(*) into n from public.coc_pool(v_proj);
  if n <> 1 then
    raise exception 'FAIL (eligibility): pool returned % row(s), expected exactly 1 (B1 × ESM1)', n;
  end if;
  select * into r from public.coc_pool(v_proj);
  if not found then raise exception 'FAIL (T2): the pool returned no row'; end if;
  if r.building_id <> v_b1 or r.esm_code <> 'ESM1' then
    raise exception 'FAIL (eligibility): pool returned the wrong pair (% × %)', r.building_code, r.esm_code;
  end if;
  if r.planned <> 10 or r.installed <> 9 or r.ready then
    raise exception 'FAIL (T2): expected planned 10 / installed 9 / ready false, got % / % / %',
      r.planned, r.installed, r.ready;
  end if;
  if r.claim_root is not null or r.claim_coc is not null or r.claim_status is not null then
    raise exception 'FAIL: an unclaimed pair reported a claim';
  end if;
  raise notice 'PASS (T2/a): 9 of 10 installed -> installed=9, ready=false; the rejected 5 was not counted; B2 (candidate) and B3 (archived) are absent though fully installed';

  -- ---- T2, part 2: the last unit flips it --------------------------------
  insert into public.install_log (entry_date, building_id, scope_id, qty, qa_status, installed_by_id)
    values (current_date, v_b1, v_s1, 1, 'pending_qa'::public.install_qa_status, v_pmo)
    returning id into v_il;  v_ids := v_ids || v_il;
  select * into r from public.coc_pool(v_proj);
  if not found then raise exception 'FAIL (T2): the pool returned no row'; end if;
  if r.planned <> 10 or r.installed <> 10 or not r.ready then
    raise exception 'FAIL (T2): expected planned 10 / installed 10 / ready true, got % / % / %',
      r.planned, r.installed, r.ready;
  end if;
  raise notice 'PASS (T2/b): the tenth unit -> installed=10, ready=true';

  -- ---- T7: planned_qty = 0 neither blocks nor qualifies -------------------
  -- (a) a zero line added to a ready pair changes nothing at all
  insert into public.building_item_scope (building_id, project_esm_id, sub_type, material_code, planned_qty)
    values (v_b1, v_pe1, 'PROOF-ZERO', v_mat, 0) returning id into v_s0;
  -- (b) a pair whose ONLY line is zero does not enter the pool
  insert into public.building_item_scope (building_id, project_esm_id, sub_type, material_code, planned_qty)
    values (v_b1, v_pe2, 'PROOF-ZERO', v_mat, 0) returning id into v_s2;
  v_ids := v_ids || v_s0 || v_s2;

  select count(*) into n from public.coc_pool(v_proj);
  if n <> 1 then
    raise exception 'FAIL (T7): a zero-planned line changed the pool to % row(s)', n;
  end if;
  select * into r from public.coc_pool(v_proj);
  if not found then raise exception 'FAIL (T7): the pool returned no row'; end if;
  if r.planned <> 10 or r.installed <> 10 or not r.ready then
    raise exception 'FAIL (T7): a zero-planned line changed the pair to % / % / %',
      r.planned, r.installed, r.ready;
  end if;
  select count(*) into n from public.coc_pool(v_proj) where esm_code = 'ESM2';
  if n <> 0 then
    raise exception 'FAIL (T7): a pair with only zero-planned scope entered the pool';
  end if;
  raise notice 'PASS (T7): a planned_qty=0 line neither blocked the ready pair nor qualified an unplanned one';

  -- ---- the claim columns, walked as 0114 defines the lineage --------------
  insert into public.cocs (id, project_id, seq, code, reference_no, esm_bundle,
                           esm_codes, revision, root_coc_id, status, created_by)
    values (v_coc, v_proj, 1, 'ZZ0130-COC-001', 'ZZ0130-COC-001', 'ESM1',
            array['ESM1'], 1, v_coc, 'draft', v_pmo);
  insert into public.coc_covered_buildings (coc_id, building_id) values (v_coc, v_b1);
  v_ids := v_ids || v_coc;
  reset role;
  -- unit 3 will do this inside generate_cocs; here the claim is placed the way
  -- a definer would, because the pool must report claims it did not create.
  insert into public.coc_claims (project_id, building_id, esm_code, root_coc_id)
    values (v_proj, v_b1, 'ESM1', v_coc);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pmo::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select * into r from public.coc_pool(v_proj);
  if not found then raise exception 'FAIL (claim): the pool returned no row'; end if;
  if r.claim_root <> v_coc or r.claim_coc <> v_coc or r.claim_status <> 'draft' then
    raise exception 'FAIL (claim): expected root/coc = % and status draft, got % / % / %',
      v_coc, r.claim_root, r.claim_coc, r.claim_status;
  end if;

  -- drive the real workflow to a revision and re-read: the ROOT must not move
  -- and the HEAD must.
  v_res := public.mark_coc_generated(v_coc, 'proof/0130.pdf');
  if not (v_res->>'ok')::boolean then raise exception 'FAIL: mark_coc_generated %', v_res; end if;
  v_res := public.mark_coc_sent(v_coc);
  if not (v_res->>'ok')::boolean then raise exception 'FAIL: mark_coc_sent %', v_res; end if;
  v_res := public.log_coc_feedback(v_coc, 'rejected', 'proof fixture');
  if not (v_res->>'ok')::boolean then raise exception 'FAIL: log_coc_feedback %', v_res; end if;
  v_res := public.create_coc_revision(v_coc);
  if not (v_res->>'ok')::boolean then raise exception 'FAIL: create_coc_revision %', v_res; end if;
  v_rev := (v_res->>'coc_id')::uuid;
  v_ids := v_ids || v_rev;

  select * into r from public.coc_pool(v_proj);
  if not found then raise exception 'FAIL (claim): the pool returned no row after the revision'; end if;
  if r.claim_root <> v_coc then
    raise exception 'FAIL (claim): the root moved on revision — % became %', v_coc, r.claim_root;
  end if;
  if r.claim_coc <> v_rev or r.claim_status <> 'draft' then
    raise exception 'FAIL (claim): head should be revision 2 (draft), got % / %', r.claim_coc, r.claim_status;
  end if;
  select count(*) into n from public.coc_claims where root_coc_id = v_coc;
  if n <> 1 then raise exception 'FAIL (claim): the revision changed the claim count to %', n; end if;
  raise notice 'PASS (claim): claim_root is the lineage root, claim_coc follows the head across a revision, and the revision wrote nothing to coc_claims';

  -- ---- non-member sees no pool at all ------------------------------------
  reset role;
  if v_other is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_other::text, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.coc_pool(v_proj);
    if n <> 0 then
      raise exception 'LEAK: a projm who does not run this project got % pool row(s)', n;
    end if;
    reset role;
    raise notice 'PASS (non-member): a projm outside the project gets zero pool rows through coc_pool';
  end if;

  -- ---- cleanup -----------------------------------------------------------
  perform set_config('request.jwt.claims', '', true);
  delete from public.cocs               where project_id = v_proj;   -- claims + coverage cascade
  delete from public.install_log        where building_id in (v_b1, v_b2, v_b3);
  delete from public.building_item_scope where building_id in (v_b1, v_b2, v_b3);
  delete from public.buildings          where project_id = v_proj;
  delete from public.project_esms       where project_id = v_proj;
  delete from public.projects           where id = v_proj;
  -- v_ids carries every row the fixtures created, including each install_log
  -- id, so the audit trail of a project that never existed goes with it.
  delete from public.audit_log          where record_id = any (v_ids);

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
  select count(*) into n from public.stock_ledger;
  if n <> c_ledger then raise exception 'FAIL: stock_ledger % -> %', c_ledger, n; end if;
  select count(*) into n from public.audit_log;
  if n <> c_audit then raise exception 'FAIL: audit_log % -> %', c_audit, n; end if;
  raise notice 'PASS: every table the proof seeded is back to its starting count';
end $$;
