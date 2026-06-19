-- supabase/migrations/0006_documents_photos.sql
-- IES Programme Control Platform v2 — Phase 1, migration 6 of 7
-- Building documents (files), the project×esm×kind status-only doc tracker,
-- and site photos. Storage paths only — never bytes.
-- Scope guard: NO RLS, NO audit trigger, NO seed.

-- 1. Enum (design-faithful: Material Submittal AND Method Statement are distinct).
create type public.document_kind as enum
  ('material_submittal','method_statement','mock_up','mir','wir','coc','other');

-- 2. documents — one row per UPLOADED file. "Missing" = absence of a row. -------
create table public.documents (
  id               uuid primary key default gen_random_uuid(),
  building_id      uuid not null references public.buildings (id) on delete restrict,
  kind             public.document_kind not null,
  revision         text not null default 'A',           -- 'A','B','C', …
  title            text,
  status           text not null default 'In Review',   -- design vocab: In Review | Approved | Rejected | Archived
  submitted_by_id  uuid references public.profiles (id) on delete set null,
  approved_by_id   uuid references public.profiles (id) on delete set null,
  storage_path     text not null,                        -- the only place the file lives
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (building_id, kind, revision)
);

comment on table  public.documents        is 'Uploaded building documents (files in Storage). A "Missing" doc type is the absence of a row, derived against the full document_kind list.';
comment on column public.documents.status is 'Design vocabulary: In Review | Approved | Rejected | Archived. Text for now; may enum-ify later.';

-- UNIQUE(building_id, kind, revision) already indexes the (building_id, kind) prefix,
-- so no separate (building_id, kind) index is created (would be redundant).

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- 3. esm_doc_status — Project Detail ESM Doc Tracker: status-only matrix, NO file.
create table public.esm_doc_status (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  esm_id         uuid not null references public.esms     (id) on delete restrict,
  kind           public.document_kind not null,
  status         text not null default 'Missing',      -- Missing | In Review | Approved | Rejected
  updated_by_id  uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (project_id, esm_id, kind)
);

comment on table  public.esm_doc_status        is 'Project×ESM×kind document-tracker matrix (Project Detail). Status-only, no files. Rows auto-seeded to Missing in Phase 2/3 when a project+esm pair exists.';
comment on column public.esm_doc_status.status is 'Missing | In Review | Approved | Rejected. Missing IS a stored value here (unlike documents, where Missing = no row).';

-- UNIQUE(project_id, esm_id, kind) covers the project_id and (project_id, esm_id)
-- prefixes, so no separate index is added per the indexing guidance.

create trigger esm_doc_status_set_updated_at
  before update on public.esm_doc_status
  for each row execute function public.set_updated_at();

-- 4. photos — site photos; DB stores only the Storage path. --------------------
create table public.photos (
  id              uuid primary key default gen_random_uuid(),
  building_id     uuid not null references public.buildings   (id) on delete cascade,
  install_log_id  uuid references public.install_log (id) on delete set null,  -- survives log cleanup
  room_id         uuid references public.rooms       (id) on delete set null,
  uploaded_by_id  uuid references public.profiles    (id) on delete set null,
  storage_path    text not null,
  gps             text,
  taken_at        timestamptz,
  caption         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.photos is 'Site photos. DB holds only storage_path; bytes live in the images bucket. Cascades with its building; survives install_log/room cleanup.';

create index photos_building_id_idx    on public.photos (building_id);
create index photos_install_log_id_idx on public.photos (install_log_id);
create index photos_taken_at_idx       on public.photos (taken_at desc);

create trigger photos_set_updated_at
  before update on public.photos
  for each row execute function public.set_updated_at();
