-- supabase/migrations/0007_audit_log.sql
-- IES Programme Control Platform v2 — Phase 1, migration 7 of 7
-- Audit log SKELETON only: enum + table + indexes.
-- Scope guard: NO trigger function, NO per-table attachment, NO RLS, NO seed.
--   (All of that is Phase 2.)  audit_log rows are append-only + immutable →
--   intentionally NO updated_at column and NO set_updated_at trigger here.

-- 1. Enum ---------------------------------------------------------------------
create type public.audit_action as enum
  ('insert','update','delete','login','logout','export');

-- 2. audit_log — immutable, append-only event ledger. -------------------------
create table public.audit_log (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  actor_user_id  uuid references auth.users (id) on delete set null,  -- keep the row even if user is deleted
  actor_name     text,                              -- denormalised at write time
  actor_role     public.user_role,                  -- nullable: login events fire before profile resolution
  action         public.audit_action not null,
  entity_type    text,                              -- table name or virtual entity ('asset','document','session')
  record_id      uuid,                              -- nullable (login/logout/export have no record)
  summary        text,                              -- natural-language sentence (README pattern)
  payload        jsonb,                             -- before/after snapshot
  ip             inet,
  session_id     text
);

comment on table  public.audit_log         is 'Immutable append-only audit ledger. Written ONLY by the Phase 2 SECURITY DEFINER trigger + auth-event hooks — never by the client. No updated_at: rows are never modified.';
comment on column public.audit_log.summary is 'Human-readable sentence, e.g. "Majed assigned Install Floor 2 lighting to Yousef, due 2026-06-24, priority high."';
comment on column public.audit_log.payload is 'Optional before/after JSON snapshot captured by the audit trigger.';

-- 3. Read-path indexes (audit log is filter-by-time + actor/entity/action). ----
create index audit_log_created_at_idx     on public.audit_log (created_at desc);
create index audit_log_actor_created_idx  on public.audit_log (actor_user_id, created_at desc);
create index audit_log_entity_created_idx on public.audit_log (entity_type, record_id, created_at desc);
create index audit_log_action_created_idx on public.audit_log (action, created_at desc);
