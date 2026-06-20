-- supabase/migrations/0029_building_photos.sql
-- IES Programme Control Platform v2 — Phase 4, migration 29
-- Building photo metadata. daily_report photos auto-categorize by date + ESM;
-- direct uploads are "general". Bytes live in the building-photos bucket.

create table if not exists public.building_photos (
  id               uuid primary key default gen_random_uuid(),
  building_id      uuid not null references public.buildings(id) on delete cascade,
  esm              text,
  taken_at         timestamptz,
  source           text not null default 'direct_upload'
                     check (source in ('daily_report','direct_upload')),
  caption          text,
  storage_path     text not null,
  file_size_bytes  bigint check (file_size_bytes is null or file_size_bytes >= 0),
  mime_type        text,
  uploaded_by      uuid references public.profiles(id),
  uploaded_at      timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists building_photos_lookup_idx
  on public.building_photos (building_id, esm, taken_at desc);

alter table public.building_photos enable row level security;

drop policy if exists building_photos_select on public.building_photos;
create policy building_photos_select on public.building_photos
  for select to authenticated using (true);

-- write: install-capable roles + admin/PMO, or an engineer assigned to the building
drop policy if exists building_photos_write on public.building_photos;
create policy building_photos_write on public.building_photos
  for all to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) in ('admin','pmo','progm','projm','proje')
    or exists (select 1 from public.building_engineers be where be.building_id = building_photos.building_id and be.engineer_id = auth.uid())
  )
  with check (
    (select role from public.profiles where id = auth.uid()) in ('admin','pmo','progm','projm','proje')
    or exists (select 1 from public.building_engineers be where be.building_id = building_photos.building_id and be.engineer_id = auth.uid())
  );
