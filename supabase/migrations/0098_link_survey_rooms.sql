-- Sprint 9D-5: LINK SURVEY ROOMS TO BUILDING ROOMS.
-- survey_entries.room_name was free text with no relation to rooms(id), so a
-- building surveyed room-by-room still showed an EMPTY Rooms list at install
-- time and every room had to be retyped — a direct violation of the
-- zero-double-work rule. Worse, the two names drift ("غرفة 101" vs "Room 101")
-- so survey and installation can never be reconciled per room.
--
-- room_name is DELIBERATELY kept: it is the raw text the engineer read off the
-- door (provenance/audit), and rooms can be renamed later without rewriting
-- survey history.

-- ---------------------------------------------------------------------------
-- 1. the link column
-- ---------------------------------------------------------------------------
alter table public.survey_entries
  add column if not exists room_id uuid references public.rooms(id) on delete set null;
create index if not exists idx_survey_entries_room on public.survey_entries(room_id);

-- ---------------------------------------------------------------------------
-- 2. matching key — the single definition of "the same room"
--    · trim + collapse internal whitespace + casefold
--    · strip Arabic tatweel (U+0640), a decorative elongation that carries no
--      meaning: "غـرفة" and "غرفة" are the same room
--    · Arabic-Indic (U+0660..) and Persian (U+06F0..) digits fold to Latin, so
--      an existing "غرفة ٣" and a newly typed "غرفة 3" MATCH rather than
--      duplicate — the app already coerces Latin digits on input, so both
--      forms are genuinely in the data.
--    IMMUTABLE because a unique index is built on it.
-- ---------------------------------------------------------------------------
create or replace function public.room_key(p_name text)
returns text language sql immutable parallel safe as $$
  select lower(btrim(regexp_replace(
    translate(replace(coalesce(p_name, ''), chr(1600), ''),
              '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
    '\s+', ' ', 'g')))
$$;

-- One room per normalized name per building. This is what makes concurrent
-- inserts of the same name from two field phones collapse into ONE room —
-- the resolver relies on the conflict, never on check-then-insert.
create unique index if not exists rooms_building_name_key
  on public.rooms(building_id, public.room_key(name));

-- ---------------------------------------------------------------------------
-- 3. resolver: find-or-create, atomic, never duplicating or renaming
--    SECURITY DEFINER so a field engineer who may insert a survey row may also
--    create the room it names — but the write scope is enforced EXPLICITLY
--    against w_bld(), exactly the check survey_entries_ins applies, because
--    definer rights bypass RLS.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_room(p_building_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_raw text := btrim(coalesce(p_name, ''));
begin
  if v_raw = '' or p_building_id is null then return null; end if;
  -- Only an end-user call is scope-checked. A service-role/maintenance context
  -- (no JWT) already bypasses RLS everywhere else in the platform; re-imposing
  -- a check here would break admin imports without adding any protection.
  if auth.uid() is not null and not public.w_bld(p_building_id) then
    raise exception 'not authorised to add rooms to this building' using errcode = '42501';
  end if;

  -- existing room wins: never rename it to the newly typed spelling
  select id into v_id from public.rooms
   where building_id = p_building_id and public.room_key(name) = public.room_key(v_raw)
   limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.rooms(building_id, name) values (p_building_id, v_raw)
    on conflict (building_id, public.room_key(name)) do nothing
    returning id into v_id;

  -- lost the race against a concurrent insert of the same name: adopt theirs
  if v_id is null then
    select id into v_id from public.rooms
     where building_id = p_building_id and public.room_key(name) = public.room_key(v_raw)
     limit 1;
  end if;
  return v_id;
end $$;
revoke all on function public.resolve_room(uuid, text) from public;
grant execute on function public.resolve_room(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. auto-link on every survey write — the field app needs no new step
-- ---------------------------------------------------------------------------
create or replace function public.survey_entry_link_room()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and new.building_id is not distinct from old.building_id
     and new.room_name is not distinct from old.room_name
     and new.room_id is not distinct from old.room_id then
    return new;                                   -- nothing room-related changed
  end if;
  if coalesce(btrim(new.room_name), '') = '' then
    new.room_id := null;                          -- no name -> no room, create nothing
  else
    new.room_id := public.resolve_room(new.building_id, new.room_name);
  end if;
  return new;
end $$;

drop trigger if exists survey_entries_link_room on public.survey_entries;
create trigger survey_entries_link_room before insert or update on public.survey_entries
  for each row execute function public.survey_entry_link_room();

-- ---------------------------------------------------------------------------
-- 5. backfill for buildings already surveyed — explicit, idempotent, and
--    non-destructive. p_dry_run powers the confirmation preview in the UI.
-- ---------------------------------------------------------------------------
create or replace function public.backfill_rooms_from_survey(p_building_id uuid, p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_names int := 0; v_existing int := 0; v_create int := 0; v_linked int := 0; r record;
begin
  if auth.uid() is not null and not public.w_bld(p_building_id) then
    raise exception 'not authorised to add rooms to this building' using errcode = '42501';
  end if;

  select count(*) into v_names from (
    select distinct public.room_key(room_name) k from public.survey_entries
     where building_id = p_building_id and coalesce(btrim(room_name), '') <> '') d;
  select count(*) into v_existing from (
    select distinct public.room_key(se.room_name) k from public.survey_entries se
     where se.building_id = p_building_id and coalesce(btrim(se.room_name), '') <> ''
       and exists (select 1 from public.rooms rm
                    where rm.building_id = p_building_id
                      and public.room_key(rm.name) = public.room_key(se.room_name))) d;
  v_create := v_names - v_existing;

  if p_dry_run then
    select count(*) into v_linked from public.survey_entries
     where building_id = p_building_id and coalesce(btrim(room_name), '') <> '' and room_id is null;
    return jsonb_build_object('dry_run', true, 'distinct_names', v_names,
      'would_create', v_create, 'already_exist', v_existing, 'entries_to_link', v_linked);
  end if;

  -- one resolve per DISTINCT name, then link every entry that shares it
  for r in select distinct on (public.room_key(room_name)) room_name
             from public.survey_entries
            where building_id = p_building_id and coalesce(btrim(room_name), '') <> ''
            order by public.room_key(room_name), room_name
  loop
    perform public.resolve_room(p_building_id, r.room_name);
  end loop;

  with linked as (
    update public.survey_entries se set room_id = rm.id
      from public.rooms rm
     where se.building_id = p_building_id
       and rm.building_id = p_building_id
       and coalesce(btrim(se.room_name), '') <> ''
       and public.room_key(rm.name) = public.room_key(se.room_name)
       and se.room_id is distinct from rm.id
    returning 1)
  select count(*) into v_linked from linked;

  -- second run finds nothing left to create or link: a true no-op
  return jsonb_build_object('dry_run', false, 'distinct_names', v_names,
    'created', v_create, 'already_exist', v_existing, 'entries_linked', v_linked);
end $$;
revoke all on function public.backfill_rooms_from_survey(uuid, boolean) from public;
grant execute on function public.backfill_rooms_from_survey(uuid, boolean) to authenticated;
