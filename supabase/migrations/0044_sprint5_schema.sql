-- supabase/migrations/0044_sprint5_schema.sql
-- IES Programme Control Platform v2 — Sprint 5 (Group 5A)
-- Rule-guided COC defaults (layout + ESM bundles + plan), paired replacements,
-- and document submission history with an auto-logging trigger.

-- 1) Project layout + 2) ESM bundle key -------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'coc_layout') then
    create type public.coc_layout as enum ('scattered','concatenated');
  end if;
end $$;
alter table public.projects add column if not exists coc_layout public.coc_layout not null default 'concatenated';
alter table public.project_esms add column if not exists coc_bundle_key text;

update public.project_esms pe set coc_bundle_key = 'lighting'
  from public.projects p, public.esms e
 where pe.project_id = p.id and pe.esm_id = e.id and p.code = 'MOI-ASIR' and e.code in ('ESM1','ESM2');
update public.projects set coc_layout = 'concatenated' where code in ('MOI-ASIR','MOH-RIYADH');

-- 3) Paired replacements -----------------------------------------------------
create table if not exists public.project_item_pairs (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  esm_code          text,
  installed_item_id uuid references public.project_installed_items(id) on delete cascade,
  removed_item_id   uuid references public.project_removed_items(id) on delete set null,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists project_item_pairs_proj_idx on public.project_item_pairs (project_id, esm_code);

-- link MOI-ASIR ESM3 installed models to the closest-capacity removed model
insert into public.project_item_pairs (project_id, esm_code, installed_item_id, removed_item_id)
select ii.project_id, 'ESM3', ii.id,
  (select ri.id from public.project_removed_items ri
    where ri.project_id = ii.project_id and ri.esm_code = 'ESM3'
    order by abs(coalesce(ri.capacity_value,0) - coalesce(ii.capacity_value,0)) limit 1)
from public.project_installed_items ii
where ii.project_id = (select id from public.projects where code = 'MOI-ASIR') and ii.esm_code = 'ESM3'
  and not exists (select 1 from public.project_item_pairs pp where pp.project_id = ii.project_id);

-- 4) Doc submission history + auto-log trigger -------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'doc_action') then
    create type public.doc_action as enum ('submitted','client_received','approved','approved_with_comments','rejected','resubmitted');
  end if;
end $$;
create table if not exists public.doc_submission_history (
  id             uuid primary key default gen_random_uuid(),
  doc_id         uuid not null references public.project_documents(id) on delete cascade,
  action         public.doc_action not null,
  action_date    timestamptz not null default now(),
  actor_id       uuid references public.profiles(id),
  file_path      text,
  notes          text,
  comments_count int not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists doc_submission_history_doc_idx on public.doc_submission_history (doc_id, action_date);

-- map project_documents.status -> doc_action (null = not a history-worthy state)
create or replace function public.doc_status_to_action(p text)
returns public.doc_action language sql immutable as $$
  select case p
    when 'submitted' then 'submitted'::public.doc_action
    when 'under_review' then 'client_received'::public.doc_action
    when 'approved' then 'approved'::public.doc_action
    when 'approved_with_comments' then 'approved_with_comments'::public.doc_action
    when 'rejected' then 'rejected'::public.doc_action
    when 'resubmitted' then 'resubmitted'::public.doc_action
    else null end;
$$;

create or replace function public.log_doc_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_action public.doc_action;
begin
  if NEW.status is distinct from OLD.status then
    v_action := public.doc_status_to_action(NEW.status);
    if v_action is not null then
      insert into public.doc_submission_history (doc_id, action, action_date, actor_id, file_path, notes)
      values (NEW.id, v_action, now(),
              coalesce(auth.uid(), NEW.reviewed_by, NEW.submitted_by),
              NEW.storage_path, NEW.response_notes);
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_log_doc_status on public.project_documents;
create trigger trg_log_doc_status after update on public.project_documents
  for each row execute function public.log_doc_status_change();

-- backfill one history row per existing doc reflecting its current state
insert into public.doc_submission_history (doc_id, action, action_date, actor_id, file_path, notes)
select d.id, public.doc_status_to_action(d.status),
       coalesce(d.reviewed_at, d.submitted_at, d.created_at),
       coalesce(d.reviewed_by, d.submitted_by), d.storage_path, d.response_notes
from public.project_documents d
where public.doc_status_to_action(d.status) is not null
  and not exists (select 1 from public.doc_submission_history h where h.doc_id = d.id);

-- 5) default_coc_plan(project_id) -------------------------------------------
create or replace function public.default_coc_plan(p_project_id uuid)
returns table (building_ids uuid[], esm_codes text[])
language sql stable security invoker set search_path = public as $$
  with esm as (
    select e.code, coalesce(pe.coc_bundle_key, 'esm:' || e.code) as grp
    from public.project_esms pe join public.esms e on e.id = pe.esm_id
    where pe.project_id = p_project_id and pe.archived = false
  ),
  groups as (select grp, array_agg(code order by code) as esm_codes from esm group by grp),
  active_b as (
    select id, code from public.buildings
    where project_id = p_project_id and status_override is distinct from 'archived'::public.building_status
  ),
  lay as (select coc_layout from public.projects where id = p_project_id)
  select array[b.id]::uuid[], g.esm_codes
  from groups g cross join active_b b
  where (select coc_layout from lay) = 'scattered'
  union all
  select (select array_agg(id order by code) from active_b), g.esm_codes
  from groups g
  where (select coc_layout from lay) = 'concatenated' and exists (select 1 from active_b);
$$;
grant execute on function public.default_coc_plan(uuid) to authenticated;

-- 6) RLS + realtime for the new tables --------------------------------------
do $$
declare t text;
begin
  foreach t in array array['project_item_pairs','doc_submission_history'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format($f$create policy %I on public.%I for all to authenticated
      using (public.auth_role() in ('admin','pmo','projm','proje'))
      with check (public.auth_role() in ('admin','pmo','projm','proje'))$f$, t||'_write', t);
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
