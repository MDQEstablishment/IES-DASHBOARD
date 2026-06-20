-- supabase/migrations/0028_project_documents.sql
-- IES Programme Control Platform v2 — Phase 4, migration 28
-- Unified document store for projects + buildings (COC / MS / RFI / submittal /
-- drawing / warranty / other-with-custom-label). Files live in Storage; this
-- table holds metadata + review state. Additive; deny-default RLS.

create table if not exists public.project_documents (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects(id) on delete cascade,
  building_id        uuid references public.buildings(id) on delete cascade,
  doc_type           text not null default 'other'
                       check (doc_type in ('COC','MS','RFI','submittal','drawing','warranty','other')),
  custom_type_label  text,
  name               text not null,
  version            text not null default 'A',
  storage_path       text,
  file_size_bytes    bigint check (file_size_bytes is null or file_size_bytes >= 0),
  mime_type          text,
  status             text not null default 'submitted'
                       check (status in ('submitted','under_review','approved','rejected','superseded')),
  submitted_at       timestamptz not null default now(),
  submitted_by       uuid references public.profiles(id),
  reviewed_at        timestamptz,
  reviewed_by        uuid references public.profiles(id),
  review_notes       text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists project_documents_lookup_idx
  on public.project_documents (project_id, building_id, doc_type, status);

alter table public.project_documents enable row level security;

-- read: any authenticated org member
drop policy if exists project_documents_select on public.project_documents;
create policy project_documents_select on public.project_documents
  for select to authenticated using (true);

-- write: admin / PMO, the project's assigned PM, or a project engineer
drop policy if exists project_documents_write on public.project_documents;
create policy project_documents_write on public.project_documents
  for all to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) in ('admin','pmo')
    or exists (select 1 from public.projects pr where pr.id = project_documents.project_id and pr.pm_id = auth.uid())
    or (select role from public.profiles where id = auth.uid()) = 'proje'
  )
  with check (
    (select role from public.profiles where id = auth.uid()) in ('admin','pmo')
    or exists (select 1 from public.projects pr where pr.id = project_documents.project_id and pr.pm_id = auth.uid())
    or (select role from public.profiles where id = auth.uid()) = 'proje'
  );
