-- supabase/migrations/0068_daily_progress.sql
-- Sprint 8I (B) — per-building Daily Progress logger. One batch per saved day with
-- one line per material installed; each line consumes from the project warehouse
-- via a stock_ledger 'consumption_out' row (reason already in the 0065 enum). The
-- save is all-or-nothing through log_daily_progress(), which hard-blocks any line
-- that would over-draw warehouse stock (no negative stock). Additive only.

-- ── tables ──────────────────────────────────────────────────────────────────
create table if not exists public.daily_progress_batch (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id),
  date date not null default current_date,
  manpower integer,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists daily_progress_batch_building_idx on public.daily_progress_batch (building_id, date desc);

create table if not exists public.daily_progress_line (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.daily_progress_batch(id) on delete cascade,
  esm_id uuid references public.esms(id),
  material_id uuid references public.materials(id),
  room_id uuid references public.rooms(id),
  qty numeric not null check (qty > 0),
  photos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists daily_progress_line_batch_idx on public.daily_progress_line (batch_id);
create index if not exists daily_progress_line_material_idx on public.daily_progress_line (material_id);

alter table public.daily_progress_batch enable row level security;
alter table public.daily_progress_line  enable row level security;
drop policy if exists daily_progress_batch_read on public.daily_progress_batch;
create policy daily_progress_batch_read on public.daily_progress_batch for select to public using (true);
drop policy if exists daily_progress_line_read on public.daily_progress_line;
create policy daily_progress_line_read on public.daily_progress_line for select to public using (true);
-- writes happen only through the security-definer RPC below (no direct write policy).

-- ── all-or-nothing save with a hard warehouse-stock block ───────────────────
-- p_lines = [{material_id, esm_id, room_id, qty, photos:[paths]}...]
-- Returns {ok:true, batch_id, lines, units} or a typed
-- {ok:false, error:'insufficient_stock', material_id, requested, available}.
create or replace function public.log_daily_progress(
  p_building_id uuid, p_date date, p_manpower integer, p_lines jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_project uuid; v_batch uuid; v_line jsonb;
  v_mid uuid; v_qty numeric; v_avail numeric; v_req numeric;
  v_units numeric := 0; v_count integer := 0;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    return jsonb_build_object('ok', false, 'error', 'no_lines');
  end if;
  select project_id into v_project from public.buildings where id = p_building_id;
  if v_project is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_building');
  end if;

  -- role gate (same write roles as deliveries / install)
  if public.auth_role() <> all (array['admin','pmo','projm','progm','procm','proco','proje']::public.user_role[]) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- validate stock per material (aggregate the requested qty across lines first)
  for v_mid, v_req in
    select (l->>'material_id')::uuid, sum((l->>'qty')::numeric)
    from jsonb_array_elements(p_lines) l
    group by (l->>'material_id')::uuid
  loop
    if v_mid is null then
      return jsonb_build_object('ok', false, 'error', 'missing_material');
    end if;
    select coalesce(sum(qty_on_hand), 0) into v_avail
    from public.project_warehouse_stock
    where project_id = v_project and variant_id = v_mid;
    if v_req > v_avail then
      return jsonb_build_object('ok', false, 'error', 'insufficient_stock',
        'material_id', v_mid, 'requested', v_req, 'available', v_avail);
    end if;
  end loop;

  -- all lines clear → write the batch, its lines, and the consumption ledger
  insert into public.daily_progress_batch (building_id, date, manpower, created_by)
  values (p_building_id, coalesce(p_date, current_date), p_manpower, auth.uid())
  returning id into v_batch;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_mid := (v_line->>'material_id')::uuid;
    v_qty := (v_line->>'qty')::numeric;
    insert into public.daily_progress_line (batch_id, esm_id, material_id, room_id, qty, photos)
    values (v_batch, nullif(v_line->>'esm_id','')::uuid, v_mid,
            nullif(v_line->>'room_id','')::uuid, v_qty,
            coalesce(v_line->'photos', '[]'::jsonb));
    insert into public.stock_ledger (project_id, variant_id, building_id, delta, reason, ref_table, ref_id, created_by)
    values (v_project, v_mid, p_building_id, -v_qty, 'consumption_out', 'daily_progress_batch', v_batch, auth.uid());
    v_units := v_units + v_qty;
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'batch_id', v_batch, 'lines', v_count, 'units', v_units);
end $$;

grant select on public.daily_progress_batch, public.daily_progress_line to anon, authenticated;
grant execute on function public.log_daily_progress(uuid, date, integer, jsonb) to authenticated;

-- ── private photos bucket + project-member (authenticated) storage RLS ───────
insert into storage.buckets (id, name, public) values ('daily-progress-photos', 'daily-progress-photos', false)
on conflict (id) do nothing;
drop policy if exists daily_progress_photos_read on storage.objects;
create policy daily_progress_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'daily-progress-photos');
drop policy if exists daily_progress_photos_write on storage.objects;
create policy daily_progress_photos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'daily-progress-photos');
