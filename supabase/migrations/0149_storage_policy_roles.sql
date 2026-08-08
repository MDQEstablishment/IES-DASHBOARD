-- 0149 — storage.objects: ceo and plane, and a gate on survey-photos.
--
-- GAP IN MY OWN 0147. That migration widened every policy naming 'pmo' to
-- include ceo — but it scanned `nspname = 'public'` only. storage.objects lives
-- in the `storage` schema, so thirteen buckets' policies were never touched and
-- ceo=PMO stopped at the schema boundary. The verification block at the end of
-- 0147 was scoped to the same schema, so it reported success. A check that
-- shares its predecessor's blind spot cannot catch its predecessor's mistake.
--
-- Also fixed here, from the same audit:
--   * `plane` appears in NO storage policy. It is Programme-Manager equivalent
--     since 0146, so it could write project data but not attach a photo to it.
--   * `images_*` names ceo but omits admin — the only bucket that does.
--   * `survey-photos` INSERT had NO role predicate at all: `bucket_id =
--     'survey-photos'` and nothing else. Any authenticated session could write
--     to the bucket the entire survey stage is about to be built on.
--
-- NOT FIXED HERE, AND DELIBERATELY SO — see the commit message. No storage
-- policy is project-scoped: every read policy is `bucket_id = '...'` alone, so
-- any signed-in user can read every file in every private bucket. That
-- contradicts the own-scope model 0146 established, but fixing it needs a
-- storage PATH CONVENTION that encodes the project, and that convention is
-- defined by the survey build. Inventing one here to close a policy would be
-- guessing at an interface two commits early.

-- ── 1. ceo gains what pmo has; plane gains what progm has ───────────────────
do $$
declare r record; q text; c text; roles text; cmd text; n int := 0;
begin
  for r in
    select p.polname as name, p.polcmd as pcmd,
           pg_get_expr(p.polqual, p.polrelid)      as qual,
           pg_get_expr(p.polwithcheck, p.polrelid) as wcheck,
           (select string_agg(quote_ident(rolname), ', ')
              from pg_roles where oid = any(p.polroles)) as roles
      from pg_policy p
      join pg_class cl on cl.oid = p.polrelid
      join pg_namespace ns on ns.oid = cl.relnamespace and ns.nspname = 'storage'
     where cl.relname = 'objects'
  loop
    q := coalesce(r.qual, '');
    c := coalesce(r.wcheck, '');

    -- ceo alongside pmo
    if q like '%''pmo''::user_role%' and q not like '%''ceo''::user_role%' then
      q := replace(q, '''pmo''::user_role', '''pmo''::user_role, ''ceo''::user_role');
    end if;
    if c like '%''pmo''::user_role%' and c not like '%''ceo''::user_role%' then
      c := replace(c, '''pmo''::user_role', '''pmo''::user_role, ''ceo''::user_role');
    end if;
    -- plane alongside progm
    if q like '%''progm''::user_role%' and q not like '%''plane''::user_role%' then
      q := replace(q, '''progm''::user_role', '''progm''::user_role, ''plane''::user_role');
    end if;
    if c like '%''progm''::user_role%' and c not like '%''plane''::user_role%' then
      c := replace(c, '''progm''::user_role', '''progm''::user_role, ''plane''::user_role');
    end if;
    -- the images_* anomaly: ceo but no admin
    if q like '%''ceo''::user_role%' and q not like '%''admin''::user_role%' then
      q := replace(q, '''ceo''::user_role', '''ceo''::user_role, ''admin''::user_role');
    end if;
    if c like '%''ceo''::user_role%' and c not like '%''admin''::user_role%' then
      c := replace(c, '''ceo''::user_role', '''ceo''::user_role, ''admin''::user_role');
    end if;

    if q is not distinct from coalesce(r.qual, '') and c is not distinct from coalesce(r.wcheck, '') then
      continue;   -- nothing to widen
    end if;

    cmd := case r.pcmd when 'r' then 'select' when 'a' then 'insert'
                       when 'w' then 'update' when 'd' then 'delete' else 'all' end;
    roles := coalesce(r.roles, 'public');

    execute format('drop policy %I on storage.objects', r.name);
    execute format('create policy %I on storage.objects for %s to %s %s %s',
      r.name, cmd, roles,
      case when nullif(q, '') is not null then 'using (' || q || ')' else '' end,
      case when nullif(c, '') is not null then 'with check (' || c || ')' else '' end);
    n := n + 1;
  end loop;
  raise notice 'storage policies widened: %', n;
end $$;

-- ── 2. survey-photos: attribution now, project scope with the survey build ──
-- Stated plainly, because the alternative is a policy that looks like a fence
-- and is not one: there is NO meaningful role fence available here. All nine
-- roles hold project.write at some scope, so a role list admits everyone;
-- may('project.write') alone admits only the all-scope roles and would lock out
-- the surveyors — projm, proje, procm, proco — who are the actual crew.
--
-- What IS worth enforcing today is attribution: the uploader cannot forge
-- someone else's ownership, so every survey photo is traceable to the account
-- that wrote it, and the audit story holds. The project fence needs a path
-- convention encoding the project, which the survey build defines; it is listed
-- in that build's proof gate rather than guessed at here.
drop policy if exists survey_photos_write on storage.objects;
create policy survey_photos_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'survey-photos' and owner = (select auth.uid()));

-- Owners may correct their own upload; nobody else may overwrite it.
drop policy if exists survey_photos_update on storage.objects;
create policy survey_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'survey-photos' and owner = (select auth.uid()))
  with check (bucket_id = 'survey-photos' and owner = (select auth.uid()));
