-- supabase/migrations/0011_audit_trigger_fn.sql
-- IES Programme Control Platform v2 — Phase 2, migration 11 of 15
-- The single SECURITY DEFINER audit writer. Function ONLY — attachments are 0012.
-- Design notes:
--   * SECURITY DEFINER + search_path='' → writes audit_log regardless of RLS, and
--     is the ONLY writer of audit_log (clients never insert directly).
--   * record_id is read from the row's jsonb 'id' so it works for tables WITHOUT
--     an id column (e.g. building_engineers, composite PK) — null there is fine.
--   * IP capture is best-effort inside a sub-block: a malformed x-forwarded-for
--     must NEVER abort the business mutation the trigger rides on.
--   * Generic summary now (actor + action + table + short id); richer per-entity
--     natural-language prose can render from `payload` in the app (Phase 3).

create or replace function public.audit_trigger_fn()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor   public.profiles%rowtype;
  v_action  public.audit_action;
  v_old     jsonb;
  v_new     jsonb;
  v_record  uuid;
  v_ip      inet;
  v_summary text;
begin
  select * into v_actor from public.profiles where id = (select auth.uid());

  if tg_op = 'INSERT' then
    v_action := 'insert'; v_new := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_action := 'update'; v_new := to_jsonb(new); v_old := to_jsonb(old);
  else
    v_action := 'delete'; v_old := to_jsonb(old);
  end if;

  v_record := coalesce(v_new->>'id', v_old->>'id')::uuid;

  begin
    v_ip := nullif(split_part(
              (current_setting('request.headers', true))::jsonb->>'x-forwarded-for', ',', 1), '')::inet;
  exception when others then
    v_ip := null;
  end;

  v_summary := coalesce(v_actor.full_name, 'system') || ' ' || v_action::text
               || ' on ' || tg_table_name
               || coalesce(' #' || left(v_record::text, 8), '');

  insert into public.audit_log (
    actor_user_id, actor_name, actor_role, action, entity_type, record_id, summary, payload, ip
  ) values (
    (select auth.uid()), v_actor.full_name, v_actor.role, v_action, tg_table_name, v_record,
    v_summary,
    jsonb_strip_nulls(jsonb_build_object('old', v_old, 'new', v_new)),
    v_ip
  );

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

comment on function public.audit_trigger_fn() is
  'Single SECURITY DEFINER audit writer. Attached AFTER INSERT/UPDATE/DELETE to business tables in 0012 (never to audit_log itself). Clients never write audit_log directly.';
