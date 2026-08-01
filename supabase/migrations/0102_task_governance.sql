-- 9G(1) — task governance.
--
-- Three things this migration makes true, none of which were true before:
--   1. A task's status can only move along the legal graph, and the graph is
--      enforced per-actor: only the ASSIGNEE may mark a task done, only the
--      CREATOR may cancel it. Until now any manager could close anyone's work
--      in one click, which makes the audit trail worthless.
--   2. Reassignment is down-only, enforced server-side. The UPDATE policy had
--      an escape hatch — `created_by_id = auth.uid()` passes regardless of the
--      NEW assignee — so a creator could reassign their task to a peer or
--      upward. A BEFORE UPDATE trigger closes it; the policy stays as-is
--      because it is also the read-gate for the row.
--   3. `tasks_read`'s global carve-out shrinks from
--      (ceo, pmo, procm, progm, plane) to (ceo, pmo). procm falls back to
--      own + its subtree (proco), plane to own-only, progm to its subtree.
--      Owner-approved (9G Risk 1): verified first against the live org chart —
--      0 profiles without a manager except the two designed chain-tops
--      (ceo, admin), 0 cycles, and the single projm chains under progm, so
--      progm's Team view loses nothing.
--
-- Plus `done_at`, because "average cycle time over the trailing 30 days" needs
-- a real completion timestamp; `updated_at` was a proxy that drifts the moment
-- a done row is edited again.
--
-- Guard convention (same as 0098): every actor check is skipped when
-- auth.uid() is null, so service-role and maintenance contexts are not broken.

-- ---------------------------------------------------------------------------
-- 1. done_at
-- ---------------------------------------------------------------------------
alter table public.tasks add column if not exists done_at timestamptz;

comment on column public.tasks.done_at is
  'Set by tasks_status_guard() when status becomes done. Backfilled from updated_at for rows already done at 9G(1).';

update public.tasks
   set done_at = coalesce(done_at, updated_at, created_at)
 where status = 'done' and done_at is null;

-- ---------------------------------------------------------------------------
-- 2. status graph + per-actor authority
-- ---------------------------------------------------------------------------
create or replace function public.tasks_status_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  me uuid := auth.uid();
begin
  -- INSERT: nothing to police except keeping done_at honest.
  if TG_OP = 'INSERT' then
    if NEW.status = 'done' then NEW.done_at := coalesce(NEW.done_at, now()); end if;
    return NEW;
  end if;

  if NEW.status is not distinct from OLD.status then
    return NEW;
  end if;

  -- Legal edges. `in_progress -> blocked` and `open -> cancelled` are the two
  -- edges added beyond the sprint plan's list: without the first, work that is
  -- already underway could never be marked blocked (and the blocked queue is
  -- what feeds the escalation bridge); without the second, cancelling a task
  -- raised by mistake would require blocking it first, polluting that queue.
  if not (
       (OLD.status = 'open'        and NEW.status in ('in_progress', 'blocked', 'cancelled'))
    or (OLD.status = 'in_progress' and NEW.status in ('blocked', 'done'))
    or (OLD.status = 'blocked'     and NEW.status in ('in_progress', 'cancelled'))
  ) then
    raise exception 'Cannot move a task from % to % — not a legal transition', OLD.status, NEW.status
      using errcode = 'check_violation';
  end if;

  if me is not null then
    if NEW.status = 'done' and me is distinct from NEW.assigned_to_id then
      raise exception 'Only the assignee can mark a task done'
        using errcode = 'insufficient_privilege';
    end if;
    if NEW.status = 'cancelled' and me is distinct from NEW.created_by_id then
      raise exception 'Only the person who raised a task can cancel it'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if NEW.status = 'done' then NEW.done_at := coalesce(NEW.done_at, now()); end if;

  return NEW;
end;
$$;

drop trigger if exists tasks_status_guard_trg on public.tasks;
create trigger tasks_status_guard_trg
  before insert or update on public.tasks
  for each row execute function public.tasks_status_guard();

-- ---------------------------------------------------------------------------
-- 3. down-only reassignment (closes the created_by_id escape in tasks_upd)
-- ---------------------------------------------------------------------------
create or replace function public.tasks_reassign_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  me uuid := auth.uid();
begin
  if NEW.assigned_to_id is not distinct from OLD.assigned_to_id then
    return NEW;
  end if;
  if me is null then
    return NEW;
  end if;

  if NEW.assigned_to_id is null then
    raise exception 'A task cannot be left unassigned — reassign it to someone in your team'
      using errcode = 'insufficient_privilege';
  end if;

  -- Mirrors tasks_ins: to yourself, or to someone below you in the chain.
  if not (NEW.assigned_to_id = me or public.is_in_subtree(me, NEW.assigned_to_id)) then
    raise exception 'You can only assign work to yourself or to someone who reports to you'
      using errcode = 'insufficient_privilege';
  end if;

  return NEW;
end;
$$;

drop trigger if exists tasks_reassign_guard_trg on public.tasks;
create trigger tasks_reassign_guard_trg
  before update on public.tasks
  for each row execute function public.tasks_reassign_guard();

-- ---------------------------------------------------------------------------
-- 4. RLS: drop the procm / progm / plane global carve-out (9G Risk 1)
-- ---------------------------------------------------------------------------
drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select
using (
  public.auth_role() = any (array['ceo'::user_role, 'pmo'::user_role])
  or assigned_to_id = (select auth.uid())
  or created_by_id  = (select auth.uid())
  or public.is_in_subtree((select auth.uid()), assigned_to_id)
  or public.is_in_subtree((select auth.uid()), created_by_id)
);
