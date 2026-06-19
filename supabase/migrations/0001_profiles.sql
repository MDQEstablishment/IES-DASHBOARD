-- supabase/migrations/0001_profiles.sql
-- IES Programme Control Platform v2 — Phase 1, migration 1 of 7
-- Creates: user_role enum · set_updated_at() infra · profiles table.
-- Scope guard: NO RLS, NO audit trigger, NO seed (all later phases).

-- 1. Canonical role keys — the single source the RBAC matrix (rbac.jsx) keys off.
create type public.user_role as enum (
  'ceo',     -- Chief Executive (read-only, scope: all)
  'pmo',     -- PMO (scope: all, Settings-gated)
  'procm',   -- Procurement Manager
  'proco',   -- Procurement Officer
  'progm',   -- Program Manager
  'projm',   -- Project Manager (scope: own)
  'proje',   -- Project Engineer (scope: own)
  'plane',   -- Planning Engineer
  'admin'    -- System Admin (Settings only, outside the chain)
);

-- 2. Reusable timestamp maintainer. NOT the Phase 2 audit trigger — this only
--    keeps updated_at honest and writes no business/audit data.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 3. profiles — user directory, 1:1 with auth.users; carries the reporting chain.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text             not null,
  email       text             not null unique,
  role        public.user_role not null,
  manager_id  uuid             references public.profiles (id) on delete set null,
  color       text             not null default '#475569',
  archived    boolean          not null default false,
  created_at  timestamptz      not null default now(),
  updated_at  timestamptz      not null default now()
);

comment on table  public.profiles            is 'User directory; 1:1 with auth.users. Drives RBAC and the strict escalation chain via manager_id.';
comment on column public.profiles.role       is 'Canonical role key consumed by the single RBAC matrix (rbac.jsx).';
comment on column public.profiles.manager_id is 'Self-FK to this user''s manager in the escalation chain. NULL for CEO and Admin.';
comment on column public.profiles.color      is 'Identity/avatar color carried from the approved design seed.';
comment on column public.profiles.archived   is 'Archived, never deleted (no soft-delete wrapper). On archive, open items reassign to manager.';

-- 4. Indexes for the two columns we filter/join on constantly.
create index profiles_manager_id_idx on public.profiles (manager_id);
create index profiles_role_idx       on public.profiles (role);

-- 5. updated_at maintenance.
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
