-- supabase/migrations/0015_escalations_chain_trigger.sql
-- IES Programme Control Platform v2 — Phase 2, migration 15
-- Strict escalation chain integrity:
--   * BEFORE INSERT: raised_to_id is ALWAYS the raiser's manager (server-derived;
--     any client-supplied value is overridden). level = parent.level+1 for a
--     re-escalation, else 1. A raiser with no manager (CEO/Admin) cannot escalate.
--   * BEFORE UPDATE: the chain-defining columns are immutable; only lifecycle
--     fields (status/severity/resolution/context) may change.

create or replace function public.escalations_derive_chain()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_mgr          uuid;
  v_parent_level integer;
begin
  select manager_id into v_mgr from public.profiles where id = new.raised_by_id;
  if v_mgr is null then
    raise exception 'escalation: raiser % has no manager and cannot escalate', new.raised_by_id
      using errcode = 'check_violation';
  end if;
  new.raised_to_id := v_mgr;

  if new.parent_escalation_id is not null then
    select level into v_parent_level from public.escalations where id = new.parent_escalation_id;
    new.level := coalesce(v_parent_level, 0) + 1;
  else
    new.level := 1;
  end if;

  return new;
end;
$$;

comment on function public.escalations_derive_chain() is
  'BEFORE INSERT: forces raised_to_id = raiser''s manager (strict chain) and derives level from parent. SECURITY DEFINER to read profiles/escalations under RLS.';

create or replace function public.escalations_chain_immutable()
returns trigger
language plpgsql
as $$
begin
  if (new.id, new.raised_by_id, new.raised_to_id, new.level, new.parent_escalation_id, new.created_at)
     is distinct from
     (old.id, old.raised_by_id, old.raised_to_id, old.level, old.parent_escalation_id, old.created_at)
  then
    raise exception
      'escalation chain is immutable: raised_by/raised_to/level/parent cannot change (row %)', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function public.escalations_chain_immutable() is
  'BEFORE UPDATE: chain-defining columns are immutable; only lifecycle/context fields may change. No reopen is enforced in app + RLS.';

create trigger escalations_derive_chain_trg
  before insert on public.escalations
  for each row execute function public.escalations_derive_chain();

create trigger escalations_chain_immutable_trg
  before update on public.escalations
  for each row execute function public.escalations_chain_immutable();
