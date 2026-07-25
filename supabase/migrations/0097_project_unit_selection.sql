-- Sprint 9D-4b: PROJECT UNIT SELECTION — the project's own material-submittal
-- shortlist (NOT a reference sheet). It is what the saving sheet's payback
-- formula VLOOKUPs against ('Aprvd Project Unit'!$B$2:$N$21), so:
--   · row_no 1..20 maps to sheet rows 2..21 — the VLOOKUP range is fixed at
--     $21, so 20 is a HARD ceiling (the UI flags overflow, never overflows).
--   · only B (description), C (unit cost), D (labor cost), M (SASO ref) and
--     N (datasheet ref) are manual inputs. E is =C+D and F:L are per-row array
--     formulas that resolve type/make/model/BTU/TR/SEER/C&H from B alone —
--     the generator must never write those.
-- Prices DEFAULT from the global catalog (9D-1) but are overridable per
-- project; a project-level price never rewrites the global catalog row.

create table if not exists public.project_unit_selection (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  row_no integer not null check (row_no between 1 and 20),   -- sheet rows 2..21
  catalog_item_id uuid references public.ac_catalog(id) on delete set null,
  description text,                                          -- column B (the VLOOKUP key)
  unit_cost numeric check (unit_cost >= 0),                   -- column C
  labor_cost numeric check (labor_cost >= 0),                 -- column D
  saso_ref text,                                              -- column M
  datasheet_ref text,                                         -- column N
  source public.ai_source not null default 'human',
  reason text,                                                -- why this model (agent job #4)
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (project_id, row_no)
);
create index if not exists idx_pus_project on public.project_unit_selection(project_id, row_no);

drop trigger if exists project_unit_selection_touch on public.project_unit_selection;
create trigger project_unit_selection_touch before update on public.project_unit_selection
  for each row execute function public.tarshid_ref_touch();

alter table public.project_unit_selection enable row level security;
drop policy if exists pus_read on public.project_unit_selection;
create policy pus_read on public.project_unit_selection for select to authenticated using (true);
drop policy if exists pus_write on public.project_unit_selection;
create policy pus_write on public.project_unit_selection for all to authenticated
  using (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role))
  with check (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role));
grant select, insert, update, delete on public.project_unit_selection to authenticated;

drop trigger if exists audit_project_unit_selection on public.project_unit_selection;
create trigger audit_project_unit_selection after insert or update or delete on public.project_unit_selection
  for each row execute function public.audit_trigger_fn();
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
                 and schemaname='public' and tablename='project_unit_selection') then
    alter publication supabase_realtime add table public.project_unit_selection;
  end if;
end $$;
alter table public.project_unit_selection replica identity full;
