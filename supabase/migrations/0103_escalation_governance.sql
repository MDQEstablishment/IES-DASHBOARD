-- 9G(2) — escalation governance.
--
-- What was already right before this migration: the recipient is derived
-- server-side and overrides anything the client sends, a raiser with no manager
-- is rejected, and raised_by/raised_to/level/parent are immutable after insert.
--
-- What was wrong:
--   1. RE-ESCALATION WENT NOWHERE. The derive trigger set raised_to to the
--      RAISER's manager even for a child row, so escalating a resolved
--      escalation landed on the same person who just resolved it. The level
--      counter went up; the routing did not. And the page let ANY manager press
--      "Forward ↑", spawning a child routed to their own manager.
--   2. STATUS WAS UNPROTECTED. escalations_upd let either party set any status,
--      including closed -> open. Resolve was a one-click for any manager and
--      wrote a hardcoded "Resolved via console" as the resolution note.
--   3. RLS had the same global carve-out as tasks and no subtree clause at all,
--      so a manager could not see their own team's escalations unless they were
--      party to them, while procm/plane/progm could read every one in the
--      programme.
--
-- Auto-close after 7 days is NOT implemented here: pg_cron is available on this
-- project but not installed, and installing a scheduler is infrastructure the
-- owner should approve, not a side effect of a sprint. Same treatment as the
-- e-mail provider. Manual close by the originator is the only close path today.

-- ---------------------------------------------------------------------------
-- 1. chain derivation — re-escalation routes one level ABOVE the last recipient
-- ---------------------------------------------------------------------------
create or replace function public.escalations_derive_chain()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_mgr    uuid;
  v_parent record;
begin
  if new.parent_escalation_id is not null then
    select raised_by_id, raised_to_id, level, status
      into v_parent
      from public.escalations
     where id = new.parent_escalation_id;

    if not found then
      raise exception 'escalation: parent % does not exist', new.parent_escalation_id
        using errcode = 'check_violation';
    end if;

    -- Only the person who started the chain may push it higher. Previously any
    -- manager could, which is how "Forward ↑" produced mis-routed children.
    if auth.uid() is not null and new.raised_by_id is distinct from v_parent.raised_by_id then
      raise exception 'Only the person who raised the original escalation can escalate it further'
        using errcode = 'insufficient_privilege';
    end if;

    -- Escalating past someone who has not been given the chance to answer is
    -- what `acknowledged` exists to pressure — so the parent must be settled.
    if v_parent.status not in ('resolved', 'closed') then
      raise exception 'This escalation has not been answered yet — it can only be escalated once it is resolved or closed'
        using errcode = 'check_violation';
    end if;

    select manager_id into v_mgr from public.profiles where id = v_parent.raised_to_id;
    if v_mgr is null then
      raise exception 'This escalation is already at the top of the chain'
        using errcode = 'check_violation';
    end if;

    new.raised_to_id := v_mgr;                       -- one level ABOVE the last recipient
    new.level        := coalesce(v_parent.level, 0) + 1;
  else
    select manager_id into v_mgr from public.profiles where id = new.raised_by_id;
    if v_mgr is null then
      raise exception 'escalation: raiser % has no manager and cannot escalate', new.raised_by_id
        using errcode = 'check_violation';
    end if;
    new.raised_to_id := v_mgr;                       -- server-derived, overrides any client value
    new.level        := 1;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. status graph + per-actor authority + a resolution note that means something
-- ---------------------------------------------------------------------------
create or replace function public.escalations_transition_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  me uuid := auth.uid();
begin
  -- A resolution note is the record of what was done. Once written it stays.
  if OLD.resolution_note is not null and btrim(OLD.resolution_note) <> ''
     and NEW.resolution_note is distinct from OLD.resolution_note then
    raise exception 'A resolution note cannot be changed once it has been written'
      using errcode = 'check_violation';
  end if;

  if NEW.status is not distinct from OLD.status then
    return NEW;
  end if;

  if OLD.status = 'closed' then
    raise exception 'A closed escalation cannot be reopened'
      using errcode = 'check_violation';
  end if;

  -- Linear graph, deliberately: open -> acknowledged -> resolved -> closed.
  -- There is no open -> resolved shortcut; acknowledging is what tells the
  -- person who raised it that a human has picked it up.
  if not (
       (OLD.status = 'open'         and NEW.status = 'acknowledged')
    or (OLD.status = 'acknowledged' and NEW.status = 'resolved')
    or (OLD.status = 'resolved'     and NEW.status = 'closed')
  ) then
    raise exception 'Cannot move an escalation from % to %', OLD.status, NEW.status
      using errcode = 'check_violation';
  end if;

  if NEW.status = 'resolved' and (NEW.resolution_note is null or btrim(NEW.resolution_note) = '') then
    raise exception 'Resolving an escalation requires a written resolution note'
      using errcode = 'check_violation';
  end if;

  if me is not null then
    if NEW.status in ('acknowledged', 'resolved') and me is distinct from OLD.raised_to_id then
      raise exception 'Only the person this escalation was raised to can acknowledge or resolve it'
        using errcode = 'insufficient_privilege';
    end if;
    if NEW.status = 'closed' and me is distinct from OLD.raised_by_id then
      raise exception 'Only the person who raised an escalation can close it'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if NEW.status = 'resolved' then
    NEW.resolved_by_id := coalesce(me, NEW.resolved_by_id, OLD.raised_to_id);
    NEW.resolved_at    := coalesce(NEW.resolved_at, now());
  end if;

  return NEW;
end;
$$;

drop trigger if exists escalations_transition_guard_trg on public.escalations;
create trigger escalations_transition_guard_trg
  before update on public.escalations
  for each row execute function public.escalations_transition_guard();

-- ---------------------------------------------------------------------------
-- 3. chain immutability keeps ONE designed exception: the archive cascade
--    (9G Risk 6). Re-homing an archived person's open escalations has to move
--    raised_to_id. It is allowed only from a service context that has set the
--    transaction-local GUC, so no signed-in user can reach this path.
-- ---------------------------------------------------------------------------
create or replace function public.escalations_chain_immutable()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  rewire boolean := coalesce(current_setting('app.chain_rewire', true), '') = 'archive_cascade'
                    and auth.uid() is null;
begin
  if (new.id, new.raised_by_id, new.level, new.parent_escalation_id, new.created_at)
     is distinct from
     (old.id, old.raised_by_id, old.level, old.parent_escalation_id, old.created_at)
  then
    raise exception 'escalation chain is immutable: raised_by/level/parent cannot change (row %)', old.id
      using errcode = 'check_violation';
  end if;

  if new.raised_to_id is distinct from old.raised_to_id and not rewire then
    raise exception 'escalation chain is immutable: raised_to cannot change (row %)', old.id
      using errcode = 'check_violation';
  end if;

  return new;
end; $$;

-- ---------------------------------------------------------------------------
-- 4. RLS: parties, plus either party's manager chain; global trimmed to ceo+pmo
-- ---------------------------------------------------------------------------
drop policy if exists escalations_read on public.escalations;
create policy escalations_read on public.escalations for select
using (
  public.auth_role() = any (array['ceo'::user_role, 'pmo'::user_role])
  or raised_by_id = (select auth.uid())
  or raised_to_id = (select auth.uid())
  or public.is_in_subtree((select auth.uid()), raised_by_id)
  or public.is_in_subtree((select auth.uid()), raised_to_id)
);
