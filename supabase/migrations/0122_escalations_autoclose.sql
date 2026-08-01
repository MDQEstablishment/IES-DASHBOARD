-- 9N(2) — an escalation whose source task is finished resolves itself.
--
-- ============================================================================
-- THIS MIGRATION WAS APPLIED TO THE LIVE DATABASE BEFORE THIS FILE EXISTED.
-- The container holding the original file was lost. This file is RECONSTRUCTED
-- from the deployed objects — pg_get_functiondef / prosrc for the function,
-- pg_proc.proacl for the grants, cron.job for the schedule — so the repository
-- states what the database actually contains rather than what someone
-- remembers writing. The function body here is byte-identical to the deployed
-- prosrc (md5 fd239d3088e42a0a2a879a7f46153d91); see docs/9N-decisions.md for
-- the verification.
--
-- It is therefore written to be RE-APPLIED SAFELY over the live objects: every
-- statement is `create or replace` / `if not exists` / unschedule-then-schedule.
-- Applying it changes nothing on this database.
-- ============================================================================
--
-- THE PROBLEM. An escalation is raised because a task is stuck. When someone
-- then finishes that task, nothing tells the escalation. It sits on the
-- Dashboard's Attention List and on the Escalations page forever, and the page
-- silts up with rows whose underlying problem was solved weeks ago. The signal
-- decays into noise, and the rows that DO need attention get lost among them.
--
-- THE RULE IS EXACTLY ONE CONDITION, and that is deliberate:
--
--     the escalation's source task reached its completed state.
--
-- `tasks.status` is the `task_status` enum: open | in_progress | blocked |
-- done | cancelled. `done` is its completed state — the enum carries no
-- 'resolved' and no 'closed'; those are `escalation_status` values and belong
-- to the escalation, not to the task. So "the source task is finished" is
-- `t.status = 'done'`, one predicate, and a cancelled task is deliberately NOT
-- a trigger: cancelling a task does not mean the problem it described went
-- away, and an escalation is exactly the place where that distinction matters.
--
-- WHAT IS DELIBERATELY NOT HERE: a time-based stale sweep. See
-- docs/9N-decisions.md — auto-closing an escalation because it is old deletes
-- precisely the signal the escalation exists to raise.
--
-- WHY THE FUNCTION WALKS open -> acknowledged -> resolved RATHER THAN JUMPING.
-- escalations_transition_guard (0103) permits only single-step moves:
-- open->acknowledged, acknowledged->resolved, resolved->closed. It is a fence
-- worth keeping, so this function obeys it rather than being exempted from it.
-- The cost is that an auto-resolve of an `open` escalation performs TWO updates
-- and therefore fires escalations_notify twice — see 0123, which suppresses the
-- intermediate notification for the system actor only.
--
-- WHY IT STOPS AT `resolved` AND DOES NOT CLOSE. The guard lets only the person
-- who RAISED an escalation close it. Closing is that person's acknowledgement
-- that the answer was adequate, and a scheduler is not in a position to judge
-- that. So the machine resolves; the human closes. (The name is a historical
-- artefact — this auto-RESOLVES.)
--
-- WHY pg_cron AND NOT A TRIGGER ON tasks. A trigger on `tasks` would be
-- cheaper and would fire the instant a task is marked done — but it would put
-- an escalation write inside every task update's transaction, so a fault in
-- escalation handling would roll back the task update that provoked it. A task
-- must never fail to save because of something an escalation did. The sweep is
-- out-of-band for the same reason notify_push swallows its own errors.

-- ---------------------------------------------------------------------------
-- pg_cron. Installed into `extensions` per Supabase convention; the scheduler
-- itself only runs against the `postgres` database.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron with schema extensions;

-- ---------------------------------------------------------------------------
-- The sweep.
--
-- SECURITY DEFINER with an empty search_path, like every other function in this
-- schema: it must be able to move escalations it does not own, and every object
-- reference below is schema-qualified so nothing can be shadowed by a caller's
-- search_path.
--
-- auth.uid() is NULL when pg_cron runs this, which is load-bearing in two
-- places inside escalations_transition_guard:
--   · the "only the person it was raised to may acknowledge/resolve" check is
--     skipped when there is no authenticated user, which is what lets the
--     scheduler act at all;
--   · resolved_by_id falls back to coalesce(me, ..., OLD.raised_to_id), so an
--     auto-resolved escalation is attributed to the person it was raised to
--     rather than to nobody.
--
-- The resolution_note is written by this function because the guard REQUIRES a
-- non-empty note on any move to `resolved`, and because a human reading the row
-- later must be able to tell an automatic resolution from a human one without
-- consulting the audit log. It names the task, so the note stays meaningful
-- after the task itself has scrolled out of view.
-- ---------------------------------------------------------------------------
create or replace function public.escalations_autoclose()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select e.id, e.status, t.title as task_title
    from public.escalations e
    join public.tasks t on t.id = e.related_task_id
    where e.status in ('open', 'acknowledged')
      and t.status = 'done'
    order by e.created_at
  loop
    if r.status = 'open' then
      update public.escalations set status = 'acknowledged' where id = r.id;
    end if;

    update public.escalations
       set status          = 'resolved',
           resolution_note = 'Auto-resolved: the source task "' || r.task_title || '" was completed.'
     where id = r.id;

    n := n + 1;
  end loop;

  return n;
end
$$;

comment on function public.escalations_autoclose() is
  'Resolves escalations whose related task reached done. Stops at resolved — closing stays the raiser''s act. Scheduled by pg_cron; not callable by clients.';

-- ---------------------------------------------------------------------------
-- Nobody signed in may call this.
--
-- It is SECURITY DEFINER and it moves escalations past the ownership checks in
-- escalations_transition_guard — the guard's checks are skipped precisely
-- because auth.uid() is NULL under the scheduler. Left executable by
-- `authenticated`, it would be a one-call bypass of "only the person this was
-- raised to may resolve it", reachable straight from the browser through
-- PostgREST's RPC endpoint. EXECUTE goes to nobody but the scheduler.
--
-- The default grant on a new function is EXECUTE to PUBLIC, so the revoke has
-- to come first and has to name PUBLIC; revoking from `authenticated` and
-- `anon` alone leaves the PUBLIC grant standing and changes nothing.
-- ---------------------------------------------------------------------------
revoke all on function public.escalations_autoclose() from public;
revoke all on function public.escalations_autoclose() from anon, authenticated;
grant execute on function public.escalations_autoclose() to postgres, service_role;

-- ---------------------------------------------------------------------------
-- The schedule. Every 15 minutes.
--
-- The interval is a judgement about how fresh the Attention List needs to be,
-- not a performance number: the query is an indexed join over two small tables
-- and costs nothing. 15 minutes is short enough that a person who finishes a
-- task and looks at the Dashboard sees a consistent picture, and long enough
-- that the job never overlaps itself.
--
-- unschedule-then-schedule so re-applying this migration does not stack a
-- second copy of the job.
-- ---------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('escalations-autoclose');
exception when others then
  null;  -- not scheduled yet; nothing to remove
end $$;

select cron.schedule(
  'escalations-autoclose',
  '*/15 * * * *',
  'select public.escalations_autoclose()'
);

-- ---------------------------------------------------------------------------
-- Backfill, run once at apply time.
--
-- Recorded outcome on this database: 0 rows moved. Both escalations that exist
-- carry related_task_id IS NULL, so the join matches nothing. That is the
-- correct result, not a failure — see docs/9N-decisions.md on the dormancy.
-- ---------------------------------------------------------------------------
do $$
declare moved integer;
begin
  moved := public.escalations_autoclose();
  raise notice '9N(2) backfill: % escalation(s) auto-resolved', moved;
end $$;
