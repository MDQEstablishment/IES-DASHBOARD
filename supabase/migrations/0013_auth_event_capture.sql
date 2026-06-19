-- supabase/migrations/0013_auth_event_capture.sql
-- IES Programme Control Platform v2 — Phase 2, migration 13 of 15
-- Flag B option (i): capture LOGIN/LOGOUT into public.audit_log via an AFTER
-- INSERT trigger on auth.audit_log_entries (GoTrue writes there on every auth
-- event). Fully server-side; IP from the GoTrue row.
-- FALLBACK (documented): if a future Supabase/GoTrue upgrade drops/blocks this
-- trigger on the managed auth schema, replace with a SECURITY DEFINER RPC the
-- client calls onAuthStateChange in Phase 3 (Flag B option iii).

create or replace function public.capture_auth_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_action text;
  v_actor  uuid;
  v_name   text;
  v_ip     inet;
begin
  v_action := new.payload->>'action';
  if v_action is null or v_action not in ('login','logout') then
    return new;                       -- ignore token_refreshed, signup, etc.
  end if;

  v_actor := nullif(new.payload->>'actor_id','')::uuid;
  v_name  := new.payload->>'actor_username';

  begin
    v_ip := nullif(new.ip_address,'')::inet;
  exception when others then
    v_ip := null;
  end;

  insert into public.audit_log (
    actor_user_id, actor_name, actor_role, action, entity_type, record_id, summary, payload, ip
  ) values (
    v_actor, v_name,
    (select p.role from public.profiles p where p.id = v_actor),
    v_action::public.audit_action, 'session', v_actor,
    coalesce(v_name,'unknown') || ' ' || v_action,
    (new.payload)::jsonb, v_ip
  );

  return new;
exception when others then
  return new;  -- auth-event capture must NEVER break GoTrue's own audit write
end;
$$;

comment on function public.capture_auth_event() is
  'Mirrors GoTrue login/logout events into public.audit_log (Flag B option i). Swallows all errors so it can never break the auth flow. Fallback: Phase-3 client RPC if Supabase blocks this trigger on a future upgrade.';

create trigger capture_auth_event_trg
  after insert on auth.audit_log_entries
  for each row execute function public.capture_auth_event();
