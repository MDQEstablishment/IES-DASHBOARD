-- supabase/migrations/0079_coc_rebuild_tables.sql
-- Sprint 8S Phase 1 — new COC model. The platform is ESCO-side only: it
-- bulk-generates COC PDFs from per-project settings, tracks revisions, and logs
-- feedback received OUTSIDE the system (no TARSHID/Beneficiary logins).
-- Owner-approved 2026-07-17 (incl. 5 model adjustments).
--
-- The junction is coc_covered_buildings (NOT coc_buildings): the legacy junction
-- keeps serving the live COC tab until Phase 5 merges; legacy drops later.

create table if not exists public.cocs (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects(id) on delete cascade,
  seq                  int  not null,                       -- per-project sequence behind `code`
  code                 text not null,                       -- e.g. MOH-RIYADH-COC-001
  reference_no         text,                                -- file reference number
  esm_bundle           text not null,                       -- display label "ESM1+ESM2"
  esm_codes            text[] not null,                     -- source of truth ["ESM1","ESM2"]
  revision             int  not null default 1,             -- Rev 1, 2, 3 …
  root_coc_id          uuid references public.cocs(id),     -- revision family anchor (= own id for Rev 1)
  superseded_by_coc_id uuid references public.cocs(id),
  status               text not null default 'draft'
                         check (status in ('draft','generated','sent','approved',
                                           'accepted_with_comments','rejected','superseded')),
  pdf_path             text,                                -- storage path in coc-pdfs
  generated_at         timestamptz,
  sent_at              timestamptz,
  feedback_outcome     text check (feedback_outcome in ('approved','accepted_with_comments','rejected')),
  feedback_at          timestamptz,
  feedback_comments    text,
  feedback_doc_path    text,                                -- storage path in coc-responses
  created_by           uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (project_id, seq, revision),
  unique (project_id, code, revision)
);
create index if not exists cocs_project_idx on public.cocs (project_id, status);
create index if not exists cocs_root_idx    on public.cocs (root_coc_id, revision);

create table if not exists public.coc_covered_buildings (
  coc_id      uuid not null references public.cocs(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  primary key (coc_id, building_id)
);

create table if not exists public.coc_project_settings (
  project_id        uuid primary key references public.projects(id) on delete cascade,
  layout_mode       text not null default 'concatenated' check (layout_mode in ('scattered','concatenated')),
  esm_groupings     jsonb not null default '[]'::jsonb,    -- e.g. [["ESM1","ESM2"],["ESM3"]]
  esco_signatory    jsonb not null default '{"name":"","designation":"","org":"IES"}'::jsonb,
  tarshid_spm       jsonb not null default '{"name":"Sultan Al Ruwais","designation":"SPM"}'::jsonb,
  tarshid_technical jsonb not null default '{"name":"Dr Mohammad Muaafa","designation":"Technical Department"}'::jsonb,
  updated_at        timestamptz not null default now()
);

create table if not exists public.coc_beneficiary_assignments (
  project_id              uuid not null references public.projects(id) on delete cascade,
  building_id             uuid not null references public.buildings(id) on delete cascade,
  beneficiary_name        text,
  beneficiary_designation text,
  primary key (project_id, building_id)
);

-- RLS: read = authenticated; write = COC-manager roles (matches doc write roles)
do $$
declare t text;
begin
  foreach t in array array['cocs','coc_covered_buildings','coc_project_settings','coc_beneficiary_assignments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format($f$create policy %I on public.%I for all to authenticated
      using (public.auth_role() in ('admin','pmo','projm','progm','proje'))
      with check (public.auth_role() in ('admin','pmo','projm','progm','proje'))$f$, t||'_write', t);
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
                   and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- audit coverage (0012 pattern) — the old COC tables never had it
drop trigger if exists audit_cocs on public.cocs;
create trigger audit_cocs after insert or update or delete on public.cocs
  for each row execute function public.audit_trigger_fn();
drop trigger if exists audit_coc_project_settings on public.coc_project_settings;
create trigger audit_coc_project_settings after insert or update or delete on public.coc_project_settings
  for each row execute function public.audit_trigger_fn();
drop trigger if exists audit_coc_beneficiary_assignments on public.coc_beneficiary_assignments;
create trigger audit_coc_beneficiary_assignments after insert or update or delete on public.coc_beneficiary_assignments
  for each row execute function public.audit_trigger_fn();

-- seed settings rows for live projects (column defaults apply)
insert into public.coc_project_settings (project_id)
select id from public.projects where deleted_at is null
on conflict (project_id) do nothing;
