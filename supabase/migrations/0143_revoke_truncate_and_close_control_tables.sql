-- 0143 — Take TRUNCATE away from the client roles, and close the two control tables.
--
-- FOUND BY AUDITING A CLAIM, NOT BY LOOKING FOR A BUG. 0142's header asserted
-- that authority_roles is "append-only by migration — there is deliberately no
-- write policy". That was false. RLS does not police TRUNCATE, and TRUNCATE was
-- granted to both client roles, so any session holding one could empty the
-- table. Proven on a clone with identical grants: TRUNCATE succeeded as
-- role=authenticated with a proje JWT, rows 3 -> 0.
--
-- THE PATTERN WAS SYSTEMIC, NOT LOCAL. Enumerating grants across the whole
-- schema rather than the two tables in hand: **all 70 tables in public grant
-- TRUNCATE to anon AND authenticated**. This is the Supabase default-privilege
-- grant of ALL, never narrowed. Two consequences worth stating precisely:
--
--   * Emptying authority_roles would deny every project write platform-wide.
--   * Emptying audit_log would destroy the owner's stated safety control — the
--     control on which he agreed to widen write access at all.
--
-- HOW EXPLOITABLE, STATED HONESTLY. PostgREST exposes no TRUNCATE verb, and a
-- search for SECURITY INVOKER functions containing dynamic SQL returned zero,
-- so there is no client-reachable route to TRUNCATE today. This is a
-- misconfiguration to close, not a live breach — but a privilege that RLS
-- cannot police should never sit with a role the public key can assume, and
-- "no route exists right now" is a property of today's function list, not a
-- fence.
--
-- WHY DELETE TOO, ON THESE TWO ONLY. Both tables have no write policy, so RLS
-- already refuses client DELETE; revoking the grant is defence in depth against
-- a future policy added carelessly. DELETE is NOT revoked anywhere else —
-- survey_entries, murshid_conversations, murshid_messages and
-- building_engineers all have legitimate DELETE policies and must keep it.
--
-- WHY THIS CANNOT BREAK THE AUDIT TRAIL. audit_trigger_fn is SECURITY DEFINER
-- owned by postgres, so its INSERT into audit_log runs with the owner's
-- privileges, not the caller's. Revoking client INSERT additionally prevents a
-- signed-in user forging audit entries — a log that can be written by the party
-- it observes is not evidence. Proven after apply, per table.

-- ── 1. TRUNCATE leaves the client roles, everywhere ─────────────────────────
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relkind in ('r', 'p')
  loop
    execute format('revoke truncate on public.%I from anon, authenticated', r.relname);
  end loop;
end $$;

-- Future tables must not re-acquire it. This binds objects created by postgres,
-- which is how migrations create them; a table created by another role would
-- need its own narrowing, so 0143's parity test re-checks the whole schema
-- rather than trusting this line alone.
alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;

-- ── 2. the two control tables become unwritable by clients ──────────────────
-- authority_roles: changed by migration only. It decides who may do what;
-- a client that can edit it can grant itself anything.
revoke insert, update, delete on public.authority_roles from anon, authenticated;

-- audit_log: append-only, and only by the SECURITY DEFINER trigger.
revoke insert, update, delete on public.audit_log from anon, authenticated;

-- ── 3. may() stops being executable by the anonymous role ───────────────────
-- It returns false for anon (auth_role() is null), so impact is nil, but 0142
-- claimed a fence it had not built: `revoke ... from public` does not reach
-- role-level grants that Supabase issues to anon and authenticated directly.
revoke execute on function public.may(text) from public, anon;
grant execute on function public.may(text) to authenticated;
