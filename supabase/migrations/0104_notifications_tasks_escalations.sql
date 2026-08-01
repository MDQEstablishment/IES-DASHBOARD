-- 9G(3) — in-app notifications for the task and escalation lifecycle.
--
-- Until now `notifications` carried exactly one kind of row: a chat @mention
-- (0088). Every other thing that happens to you — a task landing in your queue,
-- your escalation being answered — was silent, and the bell in the top bar
-- hardcoded the words "mentioned you" onto whatever it found.
--
-- Six new types, all raised by SECURITY DEFINER triggers so nothing depends on
-- the client remembering to write them (and the table still has no INSERT
-- policy, so a signed-in user cannot forge one):
--
--   task_assigned            -> the new assignee
--   task_blocked             -> whoever raised the task
--   task_done                -> whoever raised the task
--   escalation_raised        -> the recipient the trigger derived
--   escalation_acknowledged  -> whoever raised it
--   escalation_resolved      -> whoever raised it
--
-- E-MAIL IS DEFERRED. There is no mail provider configured on this project and
-- standing one up is the owner's decision, not a side effect of this sprint.
-- Every row written here is what an e-mail would be built from when that
-- decision is made, so nothing has to be re-modelled later.
--
-- You are never notified about your own action: notify_push() drops the row
-- when the recipient is the actor. Marking your own task done should not put a
-- badge on your own bell.

alter table public.notifications
  add column if not exists task_id       uuid references public.tasks(id)       on delete cascade,
  add column if not exists escalation_id uuid references public.escalations(id) on delete cascade;

create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_id, created_at desc) where read_at is null;

-- One writer for all six types. A notification must never be able to roll back
-- the thing it is reporting on, so a failure here degrades to a warning.
create or replace function public.notify_push(
  p_recipient uuid, p_type text, p_body text,
  p_project uuid default null, p_building uuid default null,
  p_task uuid default null, p_escalation uuid default null
) returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if p_recipient is null then return; end if;
  if v_actor is not null and p_recipient = v_actor then return; end if;   -- never notify yourself

  insert into public.notifications
    (recipient_id, actor_id, type, project_id, building_id, task_id, escalation_id, body_preview)
  values
    (p_recipient, v_actor, p_type, p_project, p_building, p_task, p_escalation, left(coalesce(p_body,''), 120));
exception when others then
  raise warning 'notify_push failed for % / %: %', p_recipient, p_type, sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create or replace function public.tasks_notify()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.notify_push(new.assigned_to_id, 'task_assigned', new.title,
                               new.project_id, new.building_id, new.id, null);
    return new;
  end if;

  if new.assigned_to_id is distinct from old.assigned_to_id then
    perform public.notify_push(new.assigned_to_id, 'task_assigned', new.title,
                               new.project_id, new.building_id, new.id, null);
  end if;

  if new.status is distinct from old.status then
    if new.status = 'blocked' then
      perform public.notify_push(new.created_by_id, 'task_blocked', new.title,
                                 new.project_id, new.building_id, new.id, null);
    elsif new.status = 'done' then
      perform public.notify_push(new.created_by_id, 'task_done', new.title,
                                 new.project_id, new.building_id, new.id, null);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_notify_trg on public.tasks;
create trigger tasks_notify_trg
  after insert or update on public.tasks
  for each row execute function public.tasks_notify();

-- ---------------------------------------------------------------------------
-- escalations
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
      perform public.notify_push(new.raised_by_id, 'escalation_acknowledged', new.title,
                                 new.project_id, new.building_id, null, new.id);
    elsif new.status = 'resolved' then
      perform public.notify_push(new.raised_by_id, 'escalation_resolved',
                                 coalesce(new.resolution_note, new.title),
                                 new.project_id, new.building_id, null, new.id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists escalations_notify_trg on public.escalations;
create trigger escalations_notify_trg
  after insert or update on public.escalations
  for each row execute function public.escalations_notify();
