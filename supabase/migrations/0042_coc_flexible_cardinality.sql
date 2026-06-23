-- supabase/migrations/0042_coc_flexible_cardinality.sql
-- IES Programme Control Platform v2 — Sprint 4 (Group 4A)
-- A COC can cover a RANGE of buildings AND a SET of ESMs (MONG-D: one COC for
-- 22 buildings × AC). Model COC↔buildings and COC↔ESMs as many-to-many over the
-- existing project_documents COC rows, add project-level installed/removed item
-- capture, and make the progress view count (building × esm) coverage.

-- 1) COC ↔ buildings (M:N) ---------------------------------------------------
create table if not exists public.coc_buildings (
  coc_id      uuid not null references public.project_documents(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  primary key (coc_id, building_id)
);

-- 2) COC ↔ ESMs (M:N, by code) -----------------------------------------------
create table if not exists public.coc_esms (
  coc_id   uuid not null references public.project_documents(id) on delete cascade,
  esm_code text not null,
  primary key (coc_id, esm_code)
);

-- 3) projects.coc_strategy ---------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'coc_strategy') then
    create type public.coc_strategy as enum ('per_building','clustered','custom');
  end if;
end $$;
alter table public.projects
  add column if not exists coc_strategy public.coc_strategy not null default 'clustered';

-- 4) buildings responsible person (suggests COC grouping) --------------------
alter table public.buildings
  add column if not exists responsible_person_name text,
  add column if not exists responsible_person_phone text;

-- 5) Project-level item capture (per ESM) ------------------------------------
create table if not exists public.project_installed_items (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  esm_code         text,
  item_description text,
  model_code       text,
  capacity_value   numeric,
  capacity_unit    text,
  efficiency_value numeric,
  efficiency_unit  text,
  total_quantity   int,
  notes            text,
  created_at       timestamptz not null default now()
);
create table if not exists public.project_removed_items (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects(id) on delete cascade,
  esm_code             text,
  item_description     text,
  capacity_value       numeric,
  capacity_unit        text,
  efficiency_value     numeric,
  efficiency_unit      text,
  total_quantity       int,
  returned_to_facility boolean not null default false,
  notes                text,
  created_at           timestamptz not null default now()
);
create index if not exists project_installed_items_proj_idx on public.project_installed_items (project_id, esm_code);
create index if not exists project_removed_items_proj_idx on public.project_removed_items (project_id, esm_code);

-- RLS: read = any authenticated project member; write = admin/pmo/projm/proje ---
do $$
declare t text;
begin
  foreach t in array array['coc_buildings','coc_esms','project_installed_items','project_removed_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format($f$create policy %I on public.%I for all to authenticated
      using (public.auth_role() in ('admin','pmo','projm','proje'))
      with check (public.auth_role() in ('admin','pmo','projm','proje'))$f$, t||'_write', t);
  end loop;
end $$;

-- Realtime publication for the four new tables -------------------------------
do $$
declare t text;
begin
  foreach t in array array['coc_buildings','coc_esms','project_installed_items','project_removed_items'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 6) Backwards-compat: seed junctions from existing single COCs --------------
insert into public.coc_buildings (coc_id, building_id)
select d.id, d.building_id from public.project_documents d
where d.doc_type = 'coc' and d.building_id is not null
on conflict do nothing;

insert into public.coc_esms (coc_id, esm_code)
select d.id, e.code from public.project_documents d
join public.esms e on e.id = d.esm_id
where d.doc_type = 'coc' and d.esm_id is not null
on conflict do nothing;

-- 7) Progress view: COC counts = distinct (building × esm) coverage ----------
create or replace view public.v_project_doc_progress
  with (security_invoker = true) as
with esm_kinds as (
  select pe.project_id, e.id as esm_id, e.code as esm_code, k.doc_type
  from public.project_esms pe
  join public.esms e on e.id = pe.esm_id
  cross join (values ('material_submittal'),('method_statement'),('mir'),('wir'),('coc')) as k(doc_type)
  where pe.archived = false
)
select
  ek.project_id, ek.esm_code, ek.doc_type,
  case ek.doc_type
    when 'material_submittal' then 1
    when 'method_statement'   then 1
    when 'mir'  then greatest(1, (select count(distinct md.id) from public.material_deliveries md
      where md.project_id = ek.project_id and md.esm_id = ek.esm_id))
    when 'wir'  then (select count(*) from public.buildings b
      where b.project_id = ek.project_id and b.status_override is distinct from 'archived'::public.building_status)
    when 'coc'  then (select count(*) from public.buildings b
      where b.project_id = ek.project_id and b.status_override is distinct from 'archived'::public.building_status)
  end as expected_count,
  case when ek.doc_type = 'coc' then (
    select count(distinct cb.building_id)
    from public.project_documents d
    join public.coc_buildings cb on cb.coc_id = d.id
    join public.coc_esms ce on ce.coc_id = d.id and ce.esm_code = ek.esm_code
    join public.buildings b on b.id = cb.building_id and b.project_id = ek.project_id and b.status_override is distinct from 'archived'::public.building_status
    where d.project_id = ek.project_id and d.doc_type = 'coc')
  else (select count(*) from public.project_documents d
    where d.project_id = ek.project_id and d.esm_id = ek.esm_id and d.doc_type = ek.doc_type) end as submitted_count,
  case when ek.doc_type = 'coc' then (
    select count(distinct cb.building_id)
    from public.project_documents d
    join public.coc_buildings cb on cb.coc_id = d.id
    join public.coc_esms ce on ce.coc_id = d.id and ce.esm_code = ek.esm_code
    join public.buildings b on b.id = cb.building_id and b.project_id = ek.project_id and b.status_override is distinct from 'archived'::public.building_status
    where d.project_id = ek.project_id and d.doc_type = 'coc' and d.status in ('approved','approved_with_comments'))
  else (select count(*) from public.project_documents d
    where d.project_id = ek.project_id and d.esm_id = ek.esm_id and d.doc_type = ek.doc_type
      and d.status in ('approved','approved_with_comments')) end as approved_count,
  case when ek.doc_type = 'coc' then (
    select count(distinct cb.building_id)
    from public.project_documents d
    join public.coc_buildings cb on cb.coc_id = d.id
    join public.coc_esms ce on ce.coc_id = d.id and ce.esm_code = ek.esm_code
    join public.buildings b on b.id = cb.building_id and b.project_id = ek.project_id and b.status_override is distinct from 'archived'::public.building_status
    where d.project_id = ek.project_id and d.doc_type = 'coc' and d.status = 'rejected')
  else (select count(*) from public.project_documents d
    where d.project_id = ek.project_id and d.esm_id = ek.esm_id and d.doc_type = ek.doc_type
      and d.status = 'rejected') end as rejected_count
from esm_kinds ek;

grant select on public.v_project_doc_progress to authenticated;
