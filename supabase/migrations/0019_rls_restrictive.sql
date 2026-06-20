-- supabase/migrations/0019_rls_restrictive.sql
-- IES Programme Control Platform v2 — Phase 2, migration 19
-- RESTRICTIVE narrowings (defense-in-depth). A restrictive policy ANDs with the
-- permissive ones, so even if a future permissive policy widens access, this caps it.
--   * audit_log: readable ONLY by PMO/CEO, always.
-- Note: the other "narrowings" the plan mentioned are already enforced elsewhere —
--   escalations.raised_to_id immutability is the 0015 BEFORE UPDATE trigger, and
--   install_log column immutability is the 0014 guard (RLS can't do column-level).

create policy audit_log_read_restrict on public.audit_log
  as restrictive for select to authenticated
  using (public.auth_role() in ('pmo','ceo'));
