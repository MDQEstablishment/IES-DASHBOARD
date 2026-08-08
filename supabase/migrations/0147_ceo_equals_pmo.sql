-- 0147 — ceo is PMO-equivalent.
--
-- OWNER RULING 2026-08-08, deliberately overriding the documented design. The
-- Settings screen said "Portfolio-wide read access · no settings or write
-- actions" and the database agreed; the owner has decided ceo gets what pmo
-- gets. This is an intentional change of the truth, not a drift correction, so
-- the screen text is updated in the same commit rather than left describing the
-- old rule.
--
-- WHY THIS IS ITS OWN MIGRATION. 0146 gave ceo project-level authority through
-- authority_roles. But ceo=pmo reaches much further: ~35 legacy policies and 10
-- SECURITY DEFINER functions still name 'pmo' directly, predating
-- authority_roles. Folding that into a membership migration would have hidden
-- the blast radius inside an unrelated change. Here it is visible and
-- reviewable on its own.
--
-- WHY IT IS DONE PROGRAMMATICALLY. Forty-five hand edits is forty-five chances
-- to miss one, and a missed one is exactly the silent half-applied state this
-- sprint keeps finding. The rewrite is mechanical and is verified afterwards by
-- re-querying the catalogue for any surviving expression that names pmo without
-- ceo — the migration fails if one remains.
--
-- WHAT IS DELIBERATELY NOT TOUCHED:
--   role_rank()       — the seniority ladder. ceo stays rank 1, pmo rank 2.
--                       Equivalent AUTHORITY is not equivalent SENIORITY: a ceo
--                       must still outrank a pmo for profiles_guard, or a pmo
--                       could edit a ceo's role.
--   is_broad_reader() — already includes ceo.
--   Policies that already name ceo — skipped, not double-added.

-- ── 1. policies ─────────────────────────────────────────────────────────────
do $$
declare
  r        record;
  v_qual   text;
  v_check  text;
  v_roles  text;
  v_cmd    text;
  n        int := 0;
begin
  for r in
    select c.relname                                as tbl,
           p.polname                                as name,
           p.polcmd                                 as cmd,
           pg_get_expr(p.polqual, p.polrelid)       as qual,
           pg_get_expr(p.polwithcheck, p.polrelid)  as wcheck,
           (select string_agg(quote_ident(rolname), ', ')
              from pg_roles where oid = any(p.polroles)) as roles
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n2 on n2.oid = c.relnamespace and n2.nspname = 'public'
     where (coalesce(pg_get_expr(p.polqual, p.polrelid), '') ||
            coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) like '%''pmo''::user_role%'
       and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') ||
            coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) not like '%''ceo''::user_role%'
  loop
    -- equality form first, so the array form below cannot corrupt it
    v_qual  := replace(coalesce(r.qual, ''),
                 'auth_role() = ''pmo''::user_role',
                 'auth_role() = ANY (ARRAY[''pmo''::user_role, ''ceo''::user_role])');
    v_check := replace(coalesce(r.wcheck, ''),
                 'auth_role() = ''pmo''::user_role',
                 'auth_role() = ANY (ARRAY[''pmo''::user_role, ''ceo''::user_role])');
    -- array form: widen the membership list
    if v_qual not like '%''ceo''::user_role%' then
      v_qual := replace(v_qual, '''pmo''::user_role', '''pmo''::user_role, ''ceo''::user_role');
    end if;
    if v_check not like '%''ceo''::user_role%' then
      v_check := replace(v_check, '''pmo''::user_role', '''pmo''::user_role, ''ceo''::user_role');
    end if;

    v_cmd := case r.cmd when 'r' then 'select' when 'a' then 'insert'
                        when 'w' then 'update' when 'd' then 'delete' else 'all' end;
    v_roles := coalesce(r.roles, 'public');

    execute format('drop policy %I on public.%I', r.name, r.tbl);
    execute format('create policy %I on public.%I for %s to %s %s %s',
      r.name, r.tbl, v_cmd, v_roles,
      case when nullif(v_qual, '')  is not null then 'using (' || v_qual || ')'  else '' end,
      case when nullif(v_check, '') is not null then 'with check (' || v_check || ')' else '' end);
    n := n + 1;
  end loop;
  raise notice 'ceo added to % policies', n;
end $$;

-- ── 2. SECURITY DEFINER functions ───────────────────────────────────────────
do $$
declare r record; src text; n int := 0;
begin
  for r in
    select oid, proname from pg_proc
     where pronamespace = 'public'::regnamespace
       and pg_get_functiondef(oid) ~ '''pmo'''
       and proname not in ('role_rank', 'is_broad_reader')
  loop
    src := pg_get_functiondef(r.oid);
    if src ~ '''ceo''' then continue; end if;

    -- form A: is distinct from 'pmo'  ->  <> all (array['pmo','ceo'])
    src := replace(src,
      'public.auth_role() is distinct from ''pmo''::public.user_role',
      'public.auth_role() <> all (array[''pmo'',''ceo'']::public.user_role[])');
    -- form B: array['admin','pmo',...]  ->  add 'ceo'
    src := replace(src, '''admin'',''pmo''', '''admin'',''pmo'',''ceo''');
    src := replace(src, '''admin'', ''pmo''', '''admin'', ''pmo'', ''ceo''');

    execute src;
    n := n + 1;
  end loop;
  raise notice 'ceo added to % functions', n;
end $$;

-- ── 3. the migration fails if anything was missed ───────────────────────────
do $$
declare leftover text;
begin
  select string_agg(c.relname || '.' || p.polname, ', ')
    into leftover
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   where (coalesce(pg_get_expr(p.polqual, p.polrelid), '') ||
          coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) like '%''pmo''::user_role%'
     and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') ||
          coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) not like '%''ceo''::user_role%';
  if leftover is not null then
    raise exception 'policies still name pmo without ceo: %', leftover;
  end if;

  select string_agg(proname, ', ') into leftover
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and pg_get_functiondef(oid) ~ '''pmo'''
     and pg_get_functiondef(oid) !~ '''ceo'''
     and proname not in ('role_rank');
  if leftover is not null then
    raise exception 'functions still name pmo without ceo: %', leftover;
  end if;
end $$;
