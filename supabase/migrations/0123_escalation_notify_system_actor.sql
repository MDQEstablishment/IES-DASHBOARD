-- 9N(3) — the raiser stops being told a human acknowledged their escalation
-- when no human did.
--
-- THE DEFECT. escalations_transition_guard (0103) permits only single-step
-- moves: open->acknowledged->resolved->closed. So escalations_autoclose (0122)
-- resolving an `open` escalation must perform TWO updates, and
-- escalations_notify (0104) fires AFTER UPDATE on each of them. The person who
-- raised the escalation receives, within the same millisecond:
--
--     escalation_acknowledged   "Window 1.5 TR shortfall of 36 units"
--     escalation_resolved       "Auto-resolved: the source task ... completed."
--
-- The first notification is a lie. Nobody acknowledged anything. It says a
-- person picked this up and is looking at it, which is exactly the reassurance
-- an escalation's raiser reads it as, and it arrives immediately before the
-- message that says the matter is already closed. Two notifications for one
-- event, and the more prominent one describes something that did not happen.
--
-- WHAT IS *NOT* THE FIX:
--
--  · Relaxing the guard to let the sweep jump open -> resolved. The guard is
--    the thing that makes the escalation lifecycle a lifecycle. Punching a hole
--    in a state machine to silence a notification is trading a real invariant
--    for a cosmetic one, and the hole would be open to every caller, not just
--    to this one.
--  · Dropping the intermediate UPDATE. It is what the guard requires; without
--    it the sweep cannot run at all.
--  · Suppressing `escalation_acknowledged` generally. A human acknowledgement
--    is the single most useful notification this system sends — it is the
--    answer to "has anyone even seen this?". Silencing it to fix an automated
--    edge case would cost far more than the defect.
--
-- THE INTERMEDIATE WRITE STAYS. Only its NOTIFICATION is suppressed, and only
-- when the actor is the system.
--
-- HOW THE TRIGGER KNOWS. escalations_autoclose sets a transaction-local GUC
-- immediately before the intermediate update:
--
--     set local ies.suppress_ack_notify = 'on'
--
-- and escalations_notify reads it back with current_setting(..., true) — the
-- second argument is `missing_ok`, and it is essential: without it, reading an
-- unset custom GUC raises undefined_object, which would make the trigger throw
-- on every ordinary escalation update in every session that had never set it.
--
-- `set local` is the right scope for three reasons. It is confined to the
-- current transaction, so it cannot leak into the next statement pg_cron runs
-- or into any concurrent session. It is rolled back automatically if the
-- transaction aborts. And it cannot be set from PostgREST by a signed-in user:
-- a client would need to issue `set local` inside the same transaction as the
-- update, which the REST interface gives no way to do.
--
-- The flag is cleared explicitly after the intermediate update rather than left
-- to end-of-transaction, so the SECOND update in the same loop iteration — the
-- move to `resolved` — notifies normally. The resolution notification is the
-- one the raiser actually needs, and it must survive.

-- ---------------------------------------------------------------------------
-- The trigger: unchanged except that the `acknowledged` branch now asks whether
-- a human is responsible for this transition.
-- ---------------------------------------------------------------------------
create or replace function public.escalations_notify()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.notify_push(new.raised_to_id, 'escalation_raised', new.title,
                               new.project_id, new.building_id, null, new.id);
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'acknowledged' then
      -- 9N(3): a system-actor transition through `acknowledged` is a mechanical
      -- consequence of the single-step guard, not an act by a person. Telling
      -- the raiser that someone acknowledged their escalation, when nobody did,
      -- is worse than telling them nothing. `missing_ok => true` so an unset
      -- GUC reads as NULL instead of raising undefined_object.
      if coalesce(current_setting('ies.suppress_ack_notify', true), 'off') <> 'on' then
        perform public.notify_push(new.raised_by_id, 'escalation_acknowledged', new.title,
                                   new.project_id, new.building_id, null, new.id);
      end if;
    elsif new.status = 'resolved' then
      perform public.notify_push(new.raised_by_id, 'escalation_resolved',
                                 coalesce(new.resolution_note, new.title),
                                 new.project_id, new.building_id, null, new.id);
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- The sweep: identical to 0122 except that it raises the flag around the
-- intermediate write and lowers it immediately afterwards.
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
      -- 9N(3): the guard forbids open -> resolved, so this write must happen.
      -- Its notification must not: no human acknowledged this.
      set local ies.suppress_ack_notify = 'on';
      update public.escalations set status = 'acknowledged' where id = r.id;
      -- Lowered immediately, NOT left to end-of-transaction: the `resolved`
      -- notification below is the one the raiser needs and it must go out.
      set local ies.suppress_ack_notify = 'off';
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
  'Resolves escalations whose related task reached done. Stops at resolved — closing stays the raiser''s act. Suppresses only the intermediate acknowledged notification (9N(3)). Scheduled by pg_cron; not callable by clients.';

-- The grants are re-asserted because `create or replace` on an existing
-- function PRESERVES its ACL — but a fresh deployment applying 0123 without
-- 0122 would otherwise leave the default EXECUTE-to-PUBLIC standing.
revoke all on function public.escalations_autoclose() from public;
revoke all on function public.escalations_autoclose() from anon, authenticated;
grant execute on function public.escalations_autoclose() to postgres, service_role;

-- ---------------------------------------------------------------------------
-- PROOF, covering BOTH actors. Runs at apply time and rolls itself back.
--
-- The distinction being proved is not "fewer notifications" — it is that the
-- suppression is keyed to the ACTOR and to nothing else. A human walking the
-- identical open -> acknowledged -> resolved path must still produce exactly
-- two notifications, and the system walking it must produce exactly one.
--
-- Both cases use the SAME escalation shape and the SAME two status moves, so
-- the only variable is who did it.
-- ---------------------------------------------------------------------------
do $$
declare
  v_raiser    uuid;
  v_assignee  uuid;
  v_project   uuid;
  v_task      uuid;
  v_esc       uuid;
  n_ack       integer;
  n_res       integer;
  failures    text[] := '{}';
begin
  select id into v_raiser   from public.profiles where role = 'pmo'   limit 1;
  select id into v_assignee from public.profiles where role = 'projm' limit 1;
  select id into v_project  from public.projects limit 1;

  if v_raiser is null or v_assignee is null or v_raiser = v_assignee then
    raise notice '9N(3) PROOF SKIPPED: needs two distinct profiles (pmo + projm)';
    return;
  end if;

  -- ---- CASE 1: the SYSTEM walks open -> acknowledged -> resolved ----------
  insert into public.tasks (title, status, project_id, created_by_id, assigned_to_id)
       values ('9N(3) proof task — system actor', 'done', v_project, v_raiser, v_assignee)
    returning id into v_task;

  insert into public.escalations (title, description, severity, status, project_id,
                                  raised_by_id, raised_to_id, related_task_id)
       values ('9N(3) proof escalation — system actor', 'proof scaffolding', 'high', 'open',
               v_project, v_raiser, v_assignee, v_task)
    returning id into v_esc;

  delete from public.notifications where escalation_id = v_esc;  -- ignore the raise notice

  perform public.escalations_autoclose();

  select count(*) into n_ack from public.notifications
   where escalation_id = v_esc and type = 'escalation_acknowledged';
  select count(*) into n_res from public.notifications
   where escalation_id = v_esc and type = 'escalation_resolved';

  if n_ack <> 0 then
    failures := failures || format('SYSTEM actor produced %s escalation_acknowledged, expected 0', n_ack);
  end if;
  if n_res <> 1 then
    failures := failures || format('SYSTEM actor produced %s escalation_resolved, expected 1', n_res);
  end if;

  -- ---- CASE 2: a HUMAN walks the identical path --------------------------
  -- No `set local` anywhere. The guard's ownership checks are skipped because
  -- auth.uid() is NULL here, which is what lets this block impersonate the
  -- move; the NOTIFICATION path being tested does not consult auth.uid() at
  -- all, so the comparison stays honest.
  insert into public.escalations (title, description, severity, status, project_id,
                                  raised_by_id, raised_to_id, related_task_id)
       values ('9N(3) proof escalation — human actor', 'proof scaffolding', 'high', 'open',
               v_project, v_raiser, v_assignee, null)
    returning id into v_esc;

  delete from public.notifications where escalation_id = v_esc;

  update public.escalations set status = 'acknowledged' where id = v_esc;
  update public.escalations
     set status = 'resolved', resolution_note = 'Handled by a person.'
   where id = v_esc;

  select count(*) into n_ack from public.notifications
   where escalation_id = v_esc and type = 'escalation_acknowledged';
  select count(*) into n_res from public.notifications
   where escalation_id = v_esc and type = 'escalation_resolved';

  if n_ack <> 1 then
    failures := failures || format('HUMAN actor produced %s escalation_acknowledged, expected 1 — HUMAN ACKS MUST STILL NOTIFY', n_ack);
  end if;
  if n_res <> 1 then
    failures := failures || format('HUMAN actor produced %s escalation_resolved, expected 1', n_res);
  end if;

  if array_length(failures, 1) > 0 then
    raise exception '9N(3) PROOF FAILED: %', array_to_string(failures, ' | ');
  end if;

  raise notice '9N(3) PROOF PASSED: system actor -> 0 ack + 1 resolved; human actor -> 1 ack + 1 resolved';

  -- Everything above was scaffolding. Undo it.
  raise exception 'ROLLBACK_9N3_PROOF';
exception
  when others then
    if sqlerrm = 'ROLLBACK_9N3_PROOF' then
      raise notice '9N(3) proof scaffolding rolled back cleanly';
    else
      raise;
    end if;
end $$;
