-- supabase/migrations/0032_material_deliveries_remarks.sql
-- IES Programme Control Platform v2 — Phase 4, migration 32
-- Per-project material delivery tracker (scheduled vs actual) + building remarks
-- so a manager can explain why a building shows no progress. Additive.

alter table public.buildings add column if not exists remarks text;

create table if not exists public.material_deliveries (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  building_id     uuid references public.buildings(id) on delete cascade,
  material_name   text not null,
  scheduled_date  date,
  actual_date     date,
  status          text not null default 'pending'
                    check (status in ('pending','in_transit','delivered','rejected')),
  notes           text,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists material_deliveries_project_idx
  on public.material_deliveries (project_id, scheduled_date);

alter table public.material_deliveries enable row level security;

drop policy if exists material_deliveries_select on public.material_deliveries;
create policy material_deliveries_select on public.material_deliveries
  for select to authenticated using (true);

drop policy if exists material_deliveries_write on public.material_deliveries;
create policy material_deliveries_write on public.material_deliveries
  for all to authenticated
  using (public.auth_role() in ('admin','pmo','projm','progm','procm','proco'))
  with check (public.auth_role() in ('admin','pmo','projm','progm','procm','proco'));
