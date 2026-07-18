-- 8T-5: scope installed/removed COC line items to a building so per-building
-- (scattered) certificates list that building's own fixtures. NULL = applies
-- project-wide (backwards-compatible with existing rows).
alter table public.project_installed_items add column if not exists building_id uuid references public.buildings(id) on delete cascade;
alter table public.project_removed_items  add column if not exists building_id uuid references public.buildings(id) on delete cascade;
create index if not exists idx_pii_building on public.project_installed_items(building_id);
create index if not exists idx_pri_building on public.project_removed_items(building_id);
comment on column public.project_installed_items.building_id is 'When set, this line item belongs to one building (scattered COCs); NULL applies to every building in the project.';
