-- 0150 — ONE write path for buildings, shared by the modal and the importer.
--
-- The owner's rule: a building added by hand and a building imported from Excel
-- must be the SAME ROW — same defaults, same code, same audit. The only way to
-- guarantee that is for there to be exactly one thing that inserts a building.
-- This is it. Two implementations that "agree" is the arrangement that has
-- already cost this project three bugs of the divergence class.
--
-- Code minting, coordinate normalisation, duplicate detection, defaults and the
-- audit row all live INSIDE the function, so neither caller can skip a step or
-- do it differently. The modal calls it with a one-element array.

-- ── audit: one row per import (and per manual add) ──────────────────────────
create table if not exists public.building_import_log (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid references public.profiles(id),
  source      text not null check (source in ('app', 'import')),
  file_name   text,
  row_count   int  not null default 0,
  accepted    int  not null default 0,
  held        int  not null default 0,
  -- the held rows, verbatim, so a decision can be revisited without the file
  held_rows   jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists building_import_log_project_idx
  on public.building_import_log (project_id, created_at desc);

alter table public.building_import_log enable row level security;

drop policy if exists building_import_log_read on public.building_import_log;
create policy building_import_log_read on public.building_import_log
  for select to authenticated using (public.may('project.write', project_id));

-- No INSERT policy on purpose: the log is written by the SECURITY DEFINER
-- function below and by nothing else. A client that could write its own audit
-- row could write a flattering one.

-- ── coordinate parsing: decimal OR DMS, one canonical decimal out ───────────
-- Lives in SQL rather than JS because the owner's rule puts normalisation
-- inside the shared write path. A JS helper would be a second copy the moment
-- anything else inserted a building.
create or replace function public.parse_coord(p_raw text)
returns numeric
language plpgsql
immutable
as $$
declare
  s     text;
  hemi  text := null;
  neg   boolean := false;
  parts numeric[];
  val   numeric;
begin
  if p_raw is null then return null; end if;
  s := upper(btrim(p_raw));
  if s = '' then return null; end if;

  -- Hemisphere letter — but ONLY at the very start or the very end, and with
  -- one guard that matters: in "24D42M49.5S" the trailing S is SECONDS, not
  -- South. Reading it as a hemisphere would silently flip the sign and put the
  -- building in the wrong half of the world, which is far worse than refusing
  -- to parse. So when minutes are marked with M, a trailing S is a unit.
  if s ~ '^[NSEW]' then
    hemi := substring(s from '^([NSEW])');
    s := btrim(substring(s from 2));
  elsif s ~ '[NSEW]$' and not s ~ '[0-9]\s*M' then
    hemi := substring(s from '([NSEW])$');
    s := btrim(left(s, length(s) - 1));
  end if;
  -- unit letters are separators, not digits
  s := btrim(regexp_replace(s, '[DMS]', ' ', 'g'));
  if s like '-%' then neg := true; s := btrim(substring(s from 2)); end if;

  -- plain decimal
  if s ~ '^[0-9]+(\.[0-9]+)?$' then
    val := s::numeric;
  else
    -- DMS in any of 24°42'49.5", 24 42 49.5, 24d42m49.5s — take the numbers in order
    select array_agg(m[1]::numeric order by ord)
      into parts
      from regexp_matches(s, '([0-9]+(?:\.[0-9]+)?)', 'g') with ordinality as t(m, ord);
    if parts is null or array_length(parts, 1) = 0 then return null; end if;
    val := parts[1]
         + coalesce(parts[2], 0) / 60.0
         + coalesce(parts[3], 0) / 3600.0;
  end if;

  -- coalesce, not bare IN: hemi is NULL for an unsigned decimal, and NULL in a
  -- boolean OR is the kind of three-valued subtlety that reads as correct
  if neg or coalesce(hemi, '') in ('S', 'W') then val := -val; end if;
  return round(val, 8);
exception when others then
  -- an unparseable coordinate is never a reason to lose the building
  return null;
end $$;

comment on function public.parse_coord(text) is
  'Decimal or DMS coordinate string to a canonical decimal. NULL when unparseable — the caller keeps the row and the original text.';

-- ── the single write path ───────────────────────────────────────────────────
-- p_rows: [{"name":..., "lat":..., "lng":..., "notes":...}, ...]
-- lat/lng arrive as TEXT exactly as supplied; normalisation happens here.
create or replace function public.import_buildings(
  p_project_id uuid,
  p_rows       jsonb,
  p_source     text default 'import',
  p_file_name  text default null
)
returns table (row_index int, outcome text, code text, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r            jsonb;
  idx          int := 0;
  proj_code    text;
  next_seq     int;
  nm           text;
  nm_norm      text;
  lat_raw      text;
  lng_raw      text;
  lat_val      numeric;
  lng_val      numeric;
  gps_raw      text;
  new_code     text;
  n_ok         int := 0;
  n_held       int := 0;
  held_list    jsonb := '[]'::jsonb;
  seen         text[] := array[]::text[];
begin
  if p_source not in ('app', 'import') then
    raise exception 'source must be app or import';
  end if;

  -- Authority re-checked here rather than trusted from the caller. The function
  -- is SECURITY DEFINER, so it runs with rights the caller does not have; that
  -- makes this check the fence, not a formality.
  if not public.may('project.write', p_project_id) then
    raise exception 'not authorised to add buildings to this project'
      using errcode = '42501';
  end if;

  select p.code into proj_code from public.projects p where p.id = p_project_id;
  if proj_code is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  -- Serialise code minting per project so two simultaneous imports cannot mint
  -- the same number. Transaction-scoped: released on commit or rollback.
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));

  -- Highest existing B-number in THIS project. Scoped by project_id, so there is
  -- no need to match the code prefix — which avoids escaping the project code
  -- into a regex or a LIKE pattern, where a '_' or '-' would quietly misbehave.
  -- Codes that do not match the pattern yield NULL and are ignored by max().
  select coalesce(max((substring(b.code from '-B([0-9]+)$'))::int), 0)
    into next_seq
    from public.buildings b
   where b.project_id = p_project_id;

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    idx := idx + 1;
    nm := btrim(coalesce(r->>'name', ''));
    -- normalised only for COMPARISON; the stored name is always as supplied
    nm_norm := lower(regexp_replace(nm, '\s+', ' ', 'g'));
    lat_raw := nullif(btrim(coalesce(r->>'lat', '')), '');
    lng_raw := nullif(btrim(coalesce(r->>'lng', '')), '');

    if nm = '' then
      n_held := n_held + 1;
      held_list := held_list || jsonb_build_object('row', idx, 'reason', 'building name is empty', 'data', r);
      row_index := idx; outcome := 'held'; code := null;
      reason := 'Building name is empty.';
      return next; continue;
    end if;

    if nm_norm = any(seen) then
      n_held := n_held + 1;
      held_list := held_list || jsonb_build_object('row', idx, 'reason', 'duplicate within file', 'data', r);
      row_index := idx; outcome := 'held'; code := null;
      reason := 'Duplicate of an earlier row in this file — not merged, decide which to keep.';
      return next; continue;
    end if;

    if exists (
      select 1 from public.buildings b
       where b.project_id = p_project_id
         and lower(regexp_replace(b.name, '\s+', ' ', 'g')) = nm_norm
    ) then
      n_held := n_held + 1;
      held_list := held_list || jsonb_build_object('row', idx, 'reason', 'already in project', 'data', r);
      row_index := idx; outcome := 'held'; code := null;
      reason := 'A building with this name is already in the project — not merged.';
      return next; continue;
    end if;

    seen := seen || nm_norm;

    lat_val := public.parse_coord(lat_raw);
    lng_val := public.parse_coord(lng_raw);
    -- out of range is treated as unparseable: keep the building, drop the point
    if lat_val is not null and (lat_val < -90  or lat_val > 90)  then lat_val := null; end if;
    if lng_val is not null and (lng_val < -180 or lng_val > 180) then lng_val := null; end if;

    -- the original text, preserved verbatim, whatever format it arrived in
    gps_raw := nullif(btrim(concat_ws(', ', lat_raw, lng_raw)), '');

    next_seq := next_seq + 1;
    new_code := proj_code || '-B' || lpad(next_seq::text, 4, '0');

    insert into public.buildings (project_id, code, name, gps, location_lat, location_lng, remarks)
    values (p_project_id, new_code, nm, gps_raw, lat_val, lng_val,
            nullif(btrim(coalesce(r->>'notes', '')), ''));

    n_ok := n_ok + 1;
    row_index := idx; outcome := 'accepted'; code := new_code;
    reason := case
      when lat_raw is null and lng_raw is null then null
      when lat_val is null or lng_val is null
        then 'Imported, but the coordinate could not be read — the original text is kept on the building.'
      else null end;
    return next;
  end loop;

  insert into public.building_import_log
    (project_id, user_id, source, file_name, row_count, accepted, held, held_rows)
  values (p_project_id, auth.uid(), p_source, p_file_name, idx, n_ok, n_held, held_list);

  return;
end $$;

revoke all on function public.import_buildings(uuid, jsonb, text, text) from public;
grant execute on function public.import_buildings(uuid, jsonb, text, text) to authenticated;

comment on function public.import_buildings(uuid, jsonb, text, text) is
  'The only path that inserts a building. Mints <PROJECT>-Bxxxx in list order, normalises coordinates keeping the original, holds duplicates rather than merging them, and writes one audit row. Called by the Add-building modal with a single row and by the Excel importer with the file.';
