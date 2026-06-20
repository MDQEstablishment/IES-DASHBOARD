-- supabase/migrations/0005_tasks_escalations.sql
-- IES Programme Control Platform v2 — Phase 1, migration 5 of 7
-- Tasks (personal-queue + subtree) and escalations (strict-chain + re-escalation).
-- Scope guard: NO RLS, NO audit trigger, NO seed.

-- 1. Enums --------------------------------------------------------------------
create type public.task_status         as enum ('open','in_progress','blocked','done','cancelled');
create type public.task_priority       as enum ('low','medium','high','critical');
create type public.escalation_status   as enum ('open','acknowledged','resolved','closed');
create type public.escalation_severity as enum ('low','medium','high','critical');

-- 2. tasks --------------------------------------------------------------------
create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  created_by_id   uuid references public.profiles  (id) on delete set null,
  assigned_to_id  uuid references public.profiles  (id) on delete set null,
  project_id      uuid references public.projects  (id) on delete set null,
  building_id     uuid references public.buildings (id) on delete set null,
  due_date        date,
  priority        public.task_priority not null default 'medium',
  status          public.task_status   not null default 'open',
  parent_task_id  uuid references public.tasks (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table  public.tasks        is 'Tasks. age/cycle days are derived at read (created_at / completion), never stored. cancelled is a status, never a delete.';
comment on column public.tasks.status is 'open->in_progress->done; blocked bridges to an escalation; cancelled is terminal (no row removal).';

create index tasks_assigned_status_due_idx on public.tasks (assigned_to_id, status, due_date);  -- personal queue
create index tasks_status_idx              on public.tasks (status);                              -- dashboard/global
create index tasks_created_by_id_idx       on public.tasks (created_by_id);                       -- Delegated tab
create index tasks_parent_task_id_idx      on public.tasks (parent_task_id);                      -- subtree

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- 3. escalations --------------------------------------------------------------
create table public.escalations (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  description           text not null,                       -- min length 20 enforced in app, per spec
  raised_by_id          uuid references public.profiles (id) on delete set null,
  raised_to_id          uuid references public.profiles (id) on delete set null,  -- server-derived = manager
  level                 integer not null default 1 check (level >= 1),
  parent_escalation_id  uuid references public.escalations (id) on delete set null,
  project_id            uuid references public.projects   (id) on delete set null,
  building_id           uuid references public.buildings  (id) on delete set null,
  related_task_id       uuid references public.tasks      (id) on delete set null,
  status                public.escalation_status   not null default 'open',
  severity              public.escalation_severity not null default 'medium',
  resolution_note       text,
  resolved_by_id        uuid references public.profiles (id) on delete set null,
  resolved_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table  public.escalations        is 'Strict-chain escalations. raised_to_id is the raiser manager (server-derived; Phase 2 trigger enforces). No reopen — re-escalation is a new row one level up via parent_escalation_id.';
comment on column public.escalations.status  is 'open->acknowledged->resolved->closed. Terminal at closed; never reopened.';

create index escalations_raised_to_status_idx on public.escalations (raised_to_id, status);
create index escalations_raised_by_status_idx on public.escalations (raised_by_id, status);
create index escalations_parent_idx           on public.escalations (parent_escalation_id);

create trigger escalations_set_updated_at
  before update on public.escalations
  for each row execute function public.set_updated_at();
