-- supabase/migrations/0019b_harden_functions.sql
-- IES Programme Control Platform v2 — Phase 2, migration 19b
-- Security-advisor remediation:
--  1) pin search_path on the 3 remaining mutable-search_path trigger functions
--  2) remove SECURITY DEFINER functions from the PostgREST RPC surface:
--       - trigger-only functions: revoke EXECUTE from all client roles (triggers
--         fire regardless of EXECUTE), so they vanish from /rest/v1/rpc.
--       - RLS helpers: revoke from anon/public, keep authenticated (RLS needs it;
--         they only expose the CALLER's own role/access or already-readable org
--         structure — no cross-tenant leak). Remaining authenticated WARNs are
--         accepted for MVP; Phase 9 option: move helpers to a private schema.

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

create or replace function public.install_log_immutable_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.id, new.entry_date, new.building_id, new.room_id, new.scope_id,
      new.qty, new.source, new.photos, new.installed_by_id, new.note, new.created_at)
     is distinct from
     (old.id, old.entry_date, old.building_id, old.room_id, old.scope_id,
      old.qty, old.source, old.photos, old.installed_by_id, old.note, old.created_at)
  then
    raise exception 'install_log is append-only: only qa_status/approved_by_id/approved_at may change (immutable column edit attempted on row %)', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end; $$;

create or replace function public.escalations_chain_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.id, new.raised_by_id, new.raised_to_id, new.level, new.parent_escalation_id, new.created_at)
     is distinct from
     (old.id, old.raised_by_id, old.raised_to_id, old.level, old.parent_escalation_id, old.created_at)
  then
    raise exception 'escalation chain is immutable: raised_by/raised_to/level/parent cannot change (row %)', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end; $$;

revoke all on function public.set_updated_at()              from public, anon, authenticated;
revoke all on function public.install_log_immutable_guard() from public, anon, authenticated;
revoke all on function public.escalations_chain_immutable() from public, anon, authenticated;
revoke all on function public.audit_trigger_fn()            from public, anon, authenticated;
revoke all on function public.capture_auth_event()          from public, anon, authenticated;
revoke all on function public.escalations_derive_chain()    from public, anon, authenticated;

revoke all on function public.auth_role()              from public, anon;
revoke all on function public.auth_profile()           from public, anon;
revoke all on function public.is_in_subtree(uuid,uuid) from public, anon;
revoke all on function public.is_broad_reader()        from public, anon;
revoke all on function public.can_read_project(uuid)   from public, anon;
revoke all on function public.can_read_building(uuid)  from public, anon;
revoke all on function public.w_proj(uuid)             from public, anon;
revoke all on function public.w_bld(uuid)              from public, anon;

grant execute on function public.auth_role()              to authenticated;
grant execute on function public.auth_profile()           to authenticated;
grant execute on function public.is_in_subtree(uuid,uuid) to authenticated;
grant execute on function public.is_broad_reader()        to authenticated;
grant execute on function public.can_read_project(uuid)   to authenticated;
grant execute on function public.can_read_building(uuid)  to authenticated;
grant execute on function public.w_proj(uuid)             to authenticated;
grant execute on function public.w_bld(uuid)              to authenticated;
