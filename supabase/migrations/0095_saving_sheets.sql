-- Sprint 9D-3: SAVING SHEET GENERATOR (records + template store).
-- The generator fills the LATEST uploaded TARSHID template (never a hardcoded
-- layout) and stores each generated workbook as a revisioned saving_sheets
-- record with a full input snapshot. Status chain mirrors COCs:
-- draft -> approved (pmo) -> shared; regeneration supersedes, old kept.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'saving_sheet_status') then
    create type public.saving_sheet_status as enum ('draft', 'approved', 'shared', 'superseded');
  end if;
end $$;

-- versioned template store (owner uploads the real TARSHID workbook; prior
-- versions are kept — active flag marks the one generation uses)
create table if not exists public.saving_sheet_templates (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version > 0),
  storage_path text not null,
  file_name text,
  active boolean not null default true,
  uploaded_by uuid default auth.uid() references public.profiles(id),
  uploaded_at timestamptz not null default now()
);

create table if not exists public.saving_sheets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  revision integer not null check (revision > 0),
  status public.saving_sheet_status not null default 'draft',
  template_version integer not null,
  storage_path text not null,
  snapshot jsonb,                                  -- inputs + computed rows used for this revision
  generated_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  shared_at timestamptz,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (project_id, revision)
);
create index if not exists idx_saving_sheets_proj on public.saving_sheets(project_id, revision desc);

drop trigger if exists saving_sheets_touch on public.saving_sheets;
create trigger saving_sheets_touch before update on public.saving_sheets
  for each row execute function public.tarshid_ref_touch();

-- RLS: read authenticated, write pmo/admin (formal deliverable like COCs)
alter table public.saving_sheet_templates enable row level security;
drop policy if exists sst_read on public.saving_sheet_templates;
create policy sst_read on public.saving_sheet_templates for select to authenticated using (true);
drop policy if exists sst_write on public.saving_sheet_templates;
create policy sst_write on public.saving_sheet_templates for all to authenticated
  using (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role))
  with check (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role));
grant select, insert, update on public.saving_sheet_templates to authenticated;

alter table public.saving_sheets enable row level security;
drop policy if exists ss_read on public.saving_sheets;
create policy ss_read on public.saving_sheets for select to authenticated using (true);
drop policy if exists ss_write on public.saving_sheets;
create policy ss_write on public.saving_sheets for all to authenticated
  using (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role))
  with check (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role));
grant select, insert, update on public.saving_sheets to authenticated;

-- audit + realtime
drop trigger if exists audit_saving_sheet_templates on public.saving_sheet_templates;
create trigger audit_saving_sheet_templates after insert or update or delete on public.saving_sheet_templates
  for each row execute function public.audit_trigger_fn();
drop trigger if exists audit_saving_sheets on public.saving_sheets;
create trigger audit_saving_sheets after insert or update or delete on public.saving_sheets
  for each row execute function public.audit_trigger_fn();
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                 and schemaname = 'public' and tablename = 'saving_sheets') then
    alter publication supabase_realtime add table public.saving_sheets;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                 and schemaname = 'public' and tablename = 'saving_sheet_templates') then
    alter publication supabase_realtime add table public.saving_sheet_templates;
  end if;
end $$;
alter table public.saving_sheets replica identity full;
alter table public.saving_sheet_templates replica identity full;

-- private buckets (0082 pattern); writes pmo/admin only
insert into storage.buckets (id, name, public) values
  ('saving-sheet-templates', 'saving-sheet-templates', false),
  ('saving-sheets', 'saving-sheets', false)
on conflict (id) do nothing;
do $$
declare b text;
begin
  foreach b in array array['saving-sheet-templates', 'saving-sheets'] loop
    execute format('drop policy if exists %I on storage.objects', replace(b, '-', '_') || '_read');
    execute format($f$create policy %I on storage.objects for select to authenticated
      using (bucket_id = %L)$f$, replace(b, '-', '_') || '_read', b);
    execute format('drop policy if exists %I on storage.objects', replace(b, '-', '_') || '_write');
    execute format($f$create policy %I on storage.objects for insert to authenticated
      with check (bucket_id = %L
        and public.auth_role() = any (array['admin','pmo']::public.user_role[]))$f$,
      replace(b, '-', '_') || '_write', b);
  end loop;
end $$;

-- SEAM (9D-4, not built): AI fuzzy matching / auto best-replacement.
