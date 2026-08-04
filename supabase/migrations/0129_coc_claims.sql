-- COC Builder, unit 1 of 5 — the claims ledger.
--
-- The unit of certification is the PAIR: one building × one ESM. A certificate
-- consumes a rectangle of pairs (its chosen ESMs × its chosen buildings). The
-- one rule the whole feature rests on is that a pair is certified ONCE — no
-- second certificate may claim it, whatever the UI shows, whoever is racing,
-- and whatever SQL a client sends.
--
-- THE PRIMARY KEY IS THAT INVARIANT. It is not a uniqueness hint bolted onto a
-- log; `primary key (building_id, esm_code)` IS the double-counting proof. A
-- second certificate claiming a claimed pair is a unique violation, raised by
-- the storage engine, before any application code gets an opinion. Nothing —
-- no UI filter, no concurrent tab, no direct PostgREST call, no future RPC
-- written by someone who has not read this file — can get past it. Hiding used
-- pairs in the builder is a courtesy; this is the enforcement.
--
-- Note what the key does NOT include: project_id. A building belongs to exactly
-- one project, so (building_id, esm_code) is already project-unique; putting
-- project_id in the key would let the same pair be claimed twice by naming a
-- different project and would turn the invariant into a suggestion. project_id
-- is carried as a denormalised column because the coverage view and the RLS
-- policy both need it without a join, not because it identifies anything.
--
-- ---------------------------------------------------------------------------
-- KEYED BY root_coc_id — REVISIONS INHERIT WITH ZERO WRITES
--
-- The claim points at the LINEAGE ROOT, not at the certificate. create_coc_revision
-- (0114) carries `root_coc_id = coalesce(src.root_coc_id, src.id)` forward onto
-- every revision, so revising a rejected certificate — rev 1 superseded, rev 2
-- created, coverage copied — moves nothing here at all. The claim was made by
-- the lineage and stays with the lineage. There is no revision branch in this
-- table, no "update the claim to point at the new coc", and therefore no way
-- for a revision to drop a claim on the floor or to fail against its own
-- lineage's key. The chain is intact by construction rather than by care.
--
-- The corollary is the release path: `on delete cascade` from cocs(id). Delete
-- the draft root and its claims go with it, so the pairs return to the pool.
-- Delete a mid-lineage revision and nothing is released, because the revision
-- is not what the claims point at — restore_prior_coc_revision (0114) handles
-- that case and the claim never moves. One deletion frees pairs; the other
-- cannot, which is exactly the asymmetry the workflow wants.
--
-- ---------------------------------------------------------------------------
-- RLS — READ THROUGH can_read_project, NO CLIENT WRITE PATH AT ALL
--
-- SELECT uses the same `can_read_project(project_id)` fence that cocs,
-- coc_project_settings and coc_beneficiary_assignments use since 0113. Broad
-- readers see everything; projm and proje see their own projects.
--
-- There is deliberately NO insert, update or delete policy for any client role,
-- and the table grants are revoked down to a bare SELECT for authenticated on
-- top of that. Both gates are shut on purpose: a policy-only lock would still
-- leave the table one careless `create policy` away from being writable, and a
-- grant-only lock says nothing about intent.
--
-- The revoke is `revoke all`, not `revoke insert, update, delete`, and that is
-- not tidiness. Supabase's default privileges hand anon and authenticated the
-- full set on every new table in public — including TRUNCATE, WHICH ROW-LEVEL
-- SECURITY DOES NOT GATE AT ALL. A table whose entire purpose is that its rows
-- cannot be forged or removed by a client must not leave the one verb that
-- empties it in a client role's hands, however unreachable PostgREST makes it
-- today. TRIGGER goes for the same reason: it is the right to attach code to
-- this table.
--
-- Claims are written exclusively by generate_cocs — SECURITY DEFINER, inside
-- the `app.coc_rpc` GUC fence of 0114 — in unit 3. Until then nothing writes
-- this table at all, which is why this commit is inert.
--
-- This is not the murshid_conversations situation (0128) where an admin read
-- override was deliberately withheld; here reads follow the project fence like
-- the rest of the COC family, and it is the WRITES that have no client path.
--
-- ---------------------------------------------------------------------------
-- BACKFILL — WRITTEN THOUGH IT MATCHES NOTHING TODAY
--
-- `cocs` currently holds 0 rows, so the backfill below inserts nothing. It is
-- written anyway, because a migration is a statement about any database it is
-- ever run against — a restored snapshot, a rebuilt staging copy — and one that
-- silently produced an unclaimed pool over live certificates would be worse
-- than no backfill at all.
--
-- It claims, for every LIVE LINEAGE HEAD (a coc with no successor and not
-- itself superseded), that head's covered buildings × its esm_codes, attributed
-- to the lineage root.
--
-- `ON CONFLICT DO NOTHING` IS NOT ACCEPTABLE HERE AND IS NOT USED. A conflict
-- during backfill does not mean "already done"; it means two live certificate
-- lineages in the restored data cover the same (building, ESM) pair — real
-- double-coverage, the precise thing this table exists to make impossible.
-- Swallowing it would encode the corruption as the new baseline and hand the
-- programme a pool that quietly under-reports what is left to certify. So the
-- insert raises, the migration aborts, and a human looks at the two
-- certificates. `select distinct` guards only against a degenerate esm_codes
-- array repeating a code inside ONE certificate, so the raise means what it
-- says: two lineages, not one bad array.

-- ── the table ────────────────────────────────────────────────────────────────
create table if not exists public.coc_claims (
  project_id  uuid not null references public.projects(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  esm_code    text not null,
  root_coc_id uuid not null references public.cocs(id)     on delete cascade,
  primary key (building_id, esm_code)
);

comment on table public.coc_claims is
  'One row per certified (building, ESM) pair. The primary key IS the double-counting invariant: a pair can be claimed by exactly one certificate lineage. Written only by generate_cocs under the app.coc_rpc fence; never by a client.';
comment on column public.coc_claims.root_coc_id is
  'The lineage ROOT, not the current revision. create_coc_revision preserves root_coc_id, so a revision inherits the claim with zero writes here; deleting the root cascades the claims and releases the pairs.';
comment on column public.coc_claims.project_id is
  'Denormalised from buildings for the coverage view and the RLS fence. Deliberately NOT part of the key — a building has one project, and keying on it would let the same pair be claimed twice.';

-- The coverage view scans a whole project; the cascade and the pool RPC walk by
-- lineage root. Neither is served by the (building_id, esm_code) key.
create index if not exists coc_claims_project_idx on public.coc_claims (project_id);
create index if not exists coc_claims_root_idx    on public.coc_claims (root_coc_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.coc_claims enable row level security;

drop policy if exists coc_claims_read on public.coc_claims;
create policy coc_claims_read on public.coc_claims
  for select to authenticated
  using (public.can_read_project(project_id));

-- No insert / update / delete policy — see the header. The grants go too, down
-- to a bare SELECT, so the table is closed at both layers rather than at one.
-- TRUNCATE in particular is not reachable by any policy and must be revoked.
revoke all on public.coc_claims from anon;
revoke all on public.coc_claims from authenticated;
grant select on public.coc_claims to authenticated;

-- ── backfill ─────────────────────────────────────────────────────────────────
do $$
declare n bigint;
begin
  insert into public.coc_claims (project_id, building_id, esm_code, root_coc_id)
  select distinct c.project_id, cb.building_id, x.esm_code, coalesce(c.root_coc_id, c.id)
    from public.cocs c
    join public.coc_covered_buildings cb on cb.coc_id = c.id
    cross join lateral unnest(c.esm_codes) as x(esm_code)
   where c.superseded_by_coc_id is null
     and c.status <> 'superseded';
  get diagnostics n = row_count;
  raise notice 'BACKFILL: % claim(s) inserted from existing certificates', n;
exception when unique_violation then
  raise exception
    'coc_claims backfill: two live certificate lineages cover the same (building, ESM) pair. This is real double-coverage in the source data, not a re-run artefact — resolve the overlapping certificates by hand before applying this migration. ON CONFLICT DO NOTHING is deliberately not used here.';
end $$;

-- ── PROOF (T1-direct, T5) ────────────────────────────────────────────────────
-- Runs as the `authenticated` role for everything a client could do, and as the
-- migration owner only where a SECURITY DEFINER RPC would run. Fixtures are
-- created and removed inside the block, and every table touched is asserted
-- back to its starting count — including audit_log, whose trigger rows for the
-- fixtures are removed so the owner is not left reading about a test project
-- that never existed.
do $$
declare
  v_pmo   uuid;
  v_other uuid;
  v_proj  uuid := gen_random_uuid();
  v_b1    uuid;
  v_coc   uuid := gen_random_uuid();
  v_coc2  uuid := gen_random_uuid();
  c_proj  bigint; c_bld bigint; c_coc bigint; c_ccb bigint; c_claim bigint; c_audit bigint;
  n       bigint;
  blocked boolean;
begin
  select count(*) into c_proj  from public.projects;
  select count(*) into c_bld   from public.buildings;
  select count(*) into c_coc   from public.cocs;
  select count(*) into c_ccb   from public.coc_covered_buildings;
  select count(*) into c_claim from public.coc_claims;
  select count(*) into c_audit from public.audit_log;

  select id into v_pmo   from public.profiles where role = 'pmo'   and not archived limit 1;
  select id into v_other from public.profiles where role = 'projm' and not archived limit 1;
  if v_pmo is null then
    raise notice 'SKIPPED — needs a pmo profile to build fixtures; found none';
    return;
  end if;

  -- ---- fixtures, as a real client ---------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pmo::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.projects (id, code, name, pm_id)
    values (v_proj, 'ZZ0129', 'coc_claims proof fixture', v_pmo);
  insert into public.buildings (project_id, code, name, scope_status)
    values (v_proj, 'ZZ0129-B1', 'Proof building', 'in_scope'::public.building_scope_status)
    returning id into v_b1;
  insert into public.cocs (id, project_id, seq, code, reference_no, esm_bundle,
                           esm_codes, revision, root_coc_id, status, created_by)
    values (v_coc, v_proj, 1, 'ZZ0129-COC-001', 'ZZ0129-COC-001', 'ESM1',
            array['ESM1'], 1, v_coc, 'draft', v_pmo);
  insert into public.coc_covered_buildings (coc_id, building_id) values (v_coc, v_b1);
  insert into public.cocs (id, project_id, seq, code, reference_no, esm_bundle,
                           esm_codes, revision, root_coc_id, status, created_by)
    values (v_coc2, v_proj, 2, 'ZZ0129-COC-002', 'ZZ0129-COC-002', 'ESM1',
            array['ESM1'], 1, v_coc2, 'draft', v_pmo);

  -- ---- T1-direct, part 1: a client cannot write a claim at all ----------
  blocked := false;
  begin
    insert into public.coc_claims (project_id, building_id, esm_code, root_coc_id)
      values (v_proj, v_b1, 'ESM1', v_coc);
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then
    raise exception 'FAIL (T1-direct): authenticated inserted directly into coc_claims';
  end if;

  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'coc_claims' and cmd <> 'SELECT';
  if n <> 0 then
    raise exception 'FAIL (T1-direct): % non-SELECT policy(ies) exist on coc_claims', n;
  end if;
  raise notice 'PASS (T1-direct/a): a direct client INSERT is refused, and no write policy exists';

  reset role;

  -- the other half of "closed at both layers": no client role holds any verb
  -- but SELECT — TRUNCATE especially, which no policy could have stopped.
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'coc_claims'
     and grantee in ('anon', 'authenticated')
     and not (grantee = 'authenticated' and privilege_type = 'SELECT');
  if n <> 0 then
    raise exception 'FAIL (T1-direct): % grant(s) beyond authenticated SELECT remain on coc_claims', n;
  end if;

  -- ---- T1-direct, part 2: even the definer cannot claim a pair twice -----
  insert into public.coc_claims (project_id, building_id, esm_code, root_coc_id)
    values (v_proj, v_b1, 'ESM1', v_coc);

  blocked := false;
  begin
    insert into public.coc_claims (project_id, building_id, esm_code, root_coc_id)
      values (v_proj, v_b1, 'ESM1', v_coc2);
  exception when unique_violation then blocked := true;
  end;
  if not blocked then
    raise exception 'FAIL (T1-direct): a second certificate claimed an already-claimed pair';
  end if;
  raise notice 'PASS (T1-direct/b): as definer, a second lineage claiming (B1, ESM1) violates the primary key';

  -- ---- the SELECT fence reads the way the rest of the COC family does ----
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pmo::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.coc_claims where building_id = v_b1;
  if n <> 1 then raise exception 'FAIL: a broad reader cannot see the claim through coc_claims_read'; end if;
  reset role;

  if v_other is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_other::text, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.coc_claims;
    if n <> 0 then raise exception 'LEAK: a projm who runs no project sees % claim row(s)', n; end if;
    reset role;
    raise notice 'PASS: broad reader sees the claim, a non-member projm sees zero';
  end if;

  -- ---- T5: deleting the lineage root releases its pairs ------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pmo::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from public.cocs where id = v_coc;
  reset role;

  select count(*) into n from public.coc_claims where root_coc_id = v_coc;
  if n <> 0 then raise exception 'FAIL (T5): % claim(s) survived the deletion of their root', n; end if;
  select count(*) into n from public.coc_claims where building_id = v_b1 and esm_code = 'ESM1';
  if n <> 0 then raise exception 'FAIL (T5): the pair is still claimed after the root was deleted'; end if;

  -- and the pair is genuinely free again: the same claim can now be made by
  -- the other certificate, which the primary key refused a moment ago.
  insert into public.coc_claims (project_id, building_id, esm_code, root_coc_id)
    values (v_proj, v_b1, 'ESM1', v_coc2);
  raise notice 'PASS (T5): deleting the root cascaded its claims and the pair is offerable again';

  -- ---- cleanup -----------------------------------------------------------
  perform set_config('request.jwt.claims', '', true);
  delete from public.cocs      where project_id = v_proj;   -- claims + coverage cascade
  delete from public.buildings where project_id = v_proj;
  delete from public.projects  where id = v_proj;
  delete from public.audit_log where record_id = any (array[v_proj, v_b1, v_coc, v_coc2]);

  select count(*) into n from public.projects;
  if n <> c_proj then raise exception 'FAIL: projects % -> %', c_proj, n; end if;
  select count(*) into n from public.buildings;
  if n <> c_bld then raise exception 'FAIL: buildings % -> %', c_bld, n; end if;
  select count(*) into n from public.cocs;
  if n <> c_coc then raise exception 'FAIL: cocs % -> %', c_coc, n; end if;
  select count(*) into n from public.coc_covered_buildings;
  if n <> c_ccb then raise exception 'FAIL: coc_covered_buildings % -> %', c_ccb, n; end if;
  select count(*) into n from public.coc_claims;
  if n <> c_claim then raise exception 'FAIL: coc_claims % -> %', c_claim, n; end if;
  select count(*) into n from public.audit_log;
  if n <> c_audit then raise exception 'FAIL: audit_log % -> %', c_audit, n; end if;
  raise notice 'PASS: every table the proof touched is back to its starting count';
end $$;
