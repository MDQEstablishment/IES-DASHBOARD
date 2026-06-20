-- supabase/migrations/0023_material_movements.sql
-- IES Programme Control Platform v2 — Phase 3, migration 23
-- Deferred from Phase 1: the material_movements ledger (Request / Receipt rows).
-- A SECURITY DEFINER counter trigger keeps materials.requested/received in sync.
-- RLS aligned with the P2P scopes; added to realtime with REPLICA IDENTITY FULL.

create type public.material_movement_kind as enum ('request','receipt');

create table public.material_movements (
  id           uuid primary key default gen_random_uuid(),
  material_id  uuid not null references public.materials(id)  on delete cascade,
  project_id   uuid          references public.projects(id)   on delete set null,
  building_id  uuid          references public.buildings(id)  on delete set null,
  kind         public.material_movement_kind not null,
  qty          integer not null check (qty > 0),
  note         text,
  moved_by_id  uuid          references public.profiles(id)   on delete set null,
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index material_movements_material_id_idx on public.material_movements(material_id);
create index material_movements_project_id_idx  on public.material_movements(project_id);
create index material_movements_building_id_idx on public.material_movements(building_id);
create index material_movements_occurred_at_idx on public.material_movements(occurred_at desc);

create trigger material_movements_set_updated_at
  before update on public.material_movements
  for each row execute function public.set_updated_at();

-- audit (generic trigger fn from 0011/0012)
create trigger audit_material_movements
  after insert or update or delete on public.material_movements
  for each row execute function public.audit_trigger_fn();

-- counter sync: bypasses materials RLS (procurement can't update materials directly)
create function public.mm_apply_counters()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'request' then
    update public.materials set requested = requested + new.qty where id = new.material_id;
  elsif new.kind = 'receipt' then
    update public.materials set received  = received  + new.qty where id = new.material_id;
  end if;
  return new;
end; $$;
revoke all on function public.mm_apply_counters() from public, anon, authenticated;

create trigger material_movements_counters
  after insert on public.material_movements
  for each row execute function public.mm_apply_counters();

-- RLS
alter table public.material_movements enable row level security;

create policy mm_read on public.material_movements
  for select to authenticated using (true);

create policy mm_insert on public.material_movements
  for insert to authenticated
  with check (public.auth_role() in ('procm','proco','projm','progm','pmo','ceo'));

create policy mm_update on public.material_movements
  for update to authenticated
  using      (public.auth_role() in ('procm','proco','projm','progm','pmo','ceo'))
  with check (public.auth_role() in ('procm','proco','projm','progm','pmo','ceo'));

-- realtime
alter publication supabase_realtime add table public.material_movements;
alter table public.material_movements replica identity full;
