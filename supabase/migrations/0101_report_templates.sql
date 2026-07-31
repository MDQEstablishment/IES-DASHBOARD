-- Sprint 9F Part B: PROGRESS REPORT TEMPLATE STORE.
-- The Reports page generates a branded Excel progress report for the client
-- (TARSHID) by filling the owner's designed workbook — 395 formulas, charts,
-- logo and all — never by drawing a layout in code. Same contract as the
-- saving-sheet template store (0095): versioned, uploadable from Settings, the
-- ACTIVE version is the one generation fills, older versions are kept.

create table if not exists public.report_templates (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version > 0),
  storage_path text not null,
  file_name text,
  active boolean not null default true,
  uploaded_by uuid default auth.uid() references public.profiles(id),
  uploaded_at timestamptz not null default now()
);

-- RLS: everyone reads (the generator needs the active row), pmo/admin write
alter table public.report_templates enable row level security;
drop policy if exists rt_read on public.report_templates;
create policy rt_read on public.report_templates for select to authenticated using (true);
drop policy if exists rt_write on public.report_templates;
create policy rt_write on public.report_templates for all to authenticated
  using (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role))
  with check (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role));
grant select, insert, update on public.report_templates to authenticated;

drop trigger if exists audit_report_templates on public.report_templates;
create trigger audit_report_templates after insert or update or delete on public.report_templates
  for each row execute function public.audit_trigger_fn();
alter table public.report_templates replica identity full;

-- private bucket, 0082/0095 pattern: read authenticated, write pmo/admin only
insert into storage.buckets (id, name, public) values
  ('report-templates', 'report-templates', false)
on conflict (id) do nothing;

drop policy if exists report_templates_read on storage.objects;
create policy report_templates_read on storage.objects for select to authenticated
  using (bucket_id = 'report-templates');
drop policy if exists report_templates_write on storage.objects;
create policy report_templates_write on storage.objects for insert to authenticated
  with check (bucket_id = 'report-templates'
    and public.auth_role() = any (array['admin','pmo']::public.user_role[]));
