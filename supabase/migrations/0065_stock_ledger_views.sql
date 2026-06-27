-- supabase/migrations/0065_stock_ledger_views.sql
-- Sprint 8E (3/3) — the warehouse ledger + rollup views + low-stock helper.
-- Every confirmed delivery and every approved install writes one signed ledger
-- row (via triggers); the views roll those up to project / main-warehouse / per-
-- building-plan levels. Additive; existing data is backfilled.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'stock_reason') then
    create type public.stock_reason as enum ('delivery_in','consumption_out','transfer_in','transfer_out','adjustment');
  end if;
end $$;

create table if not exists public.stock_ledger (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id),
  variant_id uuid references public.materials(id),
  building_id uuid references public.buildings(id),
  delta numeric not null,
  reason public.stock_reason not null,
  ref_table text,
  ref_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);
create index if not exists stock_ledger_project_variant_idx on public.stock_ledger (project_id, variant_id);
alter table public.stock_ledger enable row level security;
drop policy if exists stock_ledger_read on public.stock_ledger;
create policy stock_ledger_read on public.stock_ledger for select to public using (true);
drop policy if exists stock_ledger_write on public.stock_ledger;
create policy stock_ledger_write on public.stock_ledger for all to public
  using (public.auth_role() = any (array['admin','pmo','projm','progm','procm','proco','proje']::public.user_role[]))
  with check (public.auth_role() = any (array['admin','pmo','projm','progm','procm','proco','proje']::public.user_role[]));

-- ── delivery_in / reversal trigger on material_deliveries ───────────────────
create or replace function public.ledger_on_delivery() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.material_id is not null and coalesce(NEW.quantity,0) <> 0 and NEW.status in ('pending_approval','delivered') then
      insert into public.stock_ledger (project_id, variant_id, building_id, delta, reason, ref_table, ref_id, created_by, created_at)
      values (NEW.project_id, NEW.material_id, NEW.building_id, coalesce(NEW.quantity,0), 'delivery_in', 'material_deliveries', NEW.id, NEW.created_by, NEW.created_at);
    end if;
  elsif TG_OP = 'UPDATE' then
    -- a delivery that was counted then rejected reverses out of the warehouse
    if NEW.status = 'rejected' and OLD.status in ('pending_approval','delivered')
       and NEW.material_id is not null and coalesce(NEW.quantity,0) <> 0 then
      insert into public.stock_ledger (project_id, variant_id, building_id, delta, reason, ref_table, ref_id, created_by)
      values (NEW.project_id, NEW.material_id, NEW.building_id, -coalesce(NEW.quantity,0), 'adjustment', 'material_deliveries', NEW.id, NEW.approved_by);
    end if;
  end if;
  return NEW;
end $$;
drop trigger if exists trg_ledger_on_delivery on public.material_deliveries;
create trigger trg_ledger_on_delivery after insert or update on public.material_deliveries
  for each row execute function public.ledger_on_delivery();

-- ── consumption_out trigger on install_log (on approval) ────────────────────
create or replace function public.ledger_on_install() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_var uuid; v_proj uuid; v_bld uuid;
begin
  if NEW.qa_status = 'approved' and (TG_OP = 'INSERT' or OLD.qa_status is distinct from 'approved') then
    select m.id, b.project_id, bis.building_id into v_var, v_proj, v_bld
    from public.building_item_scope bis
    join public.buildings b on b.id = bis.building_id
    join public.materials m on m.code = bis.material_code
    where bis.id = NEW.scope_id;
    if v_var is not null and coalesce(NEW.qty,0) <> 0 then
      insert into public.stock_ledger (project_id, variant_id, building_id, delta, reason, ref_table, ref_id, created_by, created_at)
      values (v_proj, v_var, v_bld, -coalesce(NEW.qty,0), 'consumption_out', 'install_log', NEW.id, NEW.approved_by_id, coalesce(NEW.approved_at, now()));
    end if;
  end if;
  return NEW;
end $$;
drop trigger if exists trg_ledger_on_install on public.install_log;
create trigger trg_ledger_on_install after insert or update on public.install_log
  for each row execute function public.ledger_on_install();

-- ── rollup views ────────────────────────────────────────────────────────────
create or replace view public.project_warehouse_stock as
select sl.project_id, sl.variant_id,
       m.code as variant_code, m.name as variant_name, m.brand, m.category_id,
       c.code as category_code, c.name_en as category_name, c.esm_id, e.code as esm_code,
       sum(sl.delta) as qty_on_hand,
       sum(case when sl.reason = 'delivery_in' then sl.delta else 0 end) as received,
       sum(case when sl.reason = 'consumption_out' then -sl.delta else 0 end) as consumed
from public.stock_ledger sl
join public.materials m on m.id = sl.variant_id
left join public.material_categories c on c.id = m.category_id
left join public.esms e on e.id = c.esm_id
group by sl.project_id, sl.variant_id, m.code, m.name, m.brand, m.category_id, c.code, c.name_en, c.esm_id, e.code;

create or replace view public.main_warehouse_stock as
select sl.variant_id,
       m.code as variant_code, m.name as variant_name, m.brand, m.category_id,
       c.code as category_code, c.name_en as category_name, e.code as esm_code,
       sum(sl.delta) as qty_on_hand
from public.stock_ledger sl
join public.materials m on m.id = sl.variant_id
left join public.material_categories c on c.id = m.category_id
left join public.esms e on e.id = c.esm_id
group by sl.variant_id, m.code, m.name, m.brand, m.category_id, c.code, c.name_en, e.code;

create or replace view public.building_material_plan as
with planned as (
  select b.id as building_id, b.project_id, m.category_id, sum(bis.planned_qty) as planned_qty
  from public.building_item_scope bis
  join public.buildings b on b.id = bis.building_id
  join public.materials m on m.code = bis.material_code
  group by b.id, b.project_id, m.category_id
),
used as (
  select sl.building_id, sl.project_id, m.category_id, sum(-sl.delta) as used_qty
  from public.stock_ledger sl
  join public.materials m on m.id = sl.variant_id
  where sl.reason = 'consumption_out' and sl.building_id is not null
  group by sl.building_id, sl.project_id, m.category_id
)
select coalesce(p.building_id, u.building_id) as building_id,
       coalesce(p.project_id, u.project_id) as project_id,
       coalesce(p.category_id, u.category_id) as category_id,
       coalesce(p.planned_qty, 0) as planned_qty,
       coalesce(u.used_qty, 0) as used_qty,
       coalesce(p.planned_qty, 0) - coalesce(u.used_qty, 0) as remaining_qty
from planned p
full join used u on p.building_id = u.building_id and p.category_id = u.category_id;

create or replace view public.project_category_stock as
with onhand as (
  select sl.project_id, m.category_id, sum(sl.delta) as qty_on_hand
  from public.stock_ledger sl join public.materials m on m.id = sl.variant_id
  group by sl.project_id, m.category_id
),
req as (
  select project_id, category_id, sum(remaining_qty) as remaining_required
  from public.building_material_plan group by project_id, category_id
)
select coalesce(o.project_id, r.project_id) as project_id,
       coalesce(o.category_id, r.category_id) as category_id,
       coalesce(o.qty_on_hand, 0) as qty_on_hand,
       coalesce(r.remaining_required, 0) as remaining_required,
       (coalesce(o.qty_on_hand, 0) < coalesce(r.remaining_required, 0)) as is_short
from onhand o full join req r on o.project_id = r.project_id and o.category_id = r.category_id;

create or replace function public.project_has_shortage(p_project uuid) returns boolean
language sql stable security invoker set search_path = public as $$
  select exists (select 1 from public.project_category_stock where project_id = p_project and is_short);
$$;

-- ── backfill from existing data ─────────────────────────────────────────────
insert into public.stock_ledger (project_id, variant_id, building_id, delta, reason, ref_table, ref_id, created_by, created_at)
select project_id, material_id, building_id, coalesce(quantity,0), 'delivery_in', 'material_deliveries', id, created_by, created_at
from public.material_deliveries
where material_id is not null and coalesce(quantity,0) <> 0 and status in ('pending_approval','delivered');

insert into public.stock_ledger (project_id, variant_id, building_id, delta, reason, ref_table, ref_id, created_by, created_at)
select b.project_id, m.id, bis.building_id, -coalesce(il.qty,0), 'consumption_out', 'install_log', il.id, il.approved_by_id, coalesce(il.approved_at, il.created_at)
from public.install_log il
join public.building_item_scope bis on bis.id = il.scope_id
join public.buildings b on b.id = bis.building_id
join public.materials m on m.code = bis.material_code
where il.qa_status = 'approved' and coalesce(il.qty,0) <> 0;
