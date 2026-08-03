-- 9R(3) — the owner's task amendments: a trash that is not a delete, edits that
-- are governed and named, and links that cannot point at the wrong project.
--
-- Three things this migration makes true:
--
--   1. A task can be TRASHED and RESTORED. Trash is not delete. There is still
--      no DELETE policy on public.tasks and this migration does not add one —
--      that absence is the reason a soft delete is safe to build, because a row
--      and its audit history cannot be destroyed afterwards to cover the trail.
--      (Amendment A.)
--
--   2. Editing a task after creation is governed, and by a DIFFERENT rule from
--      working on it. Whoever raised a task, or a manager above whoever holds
--      it, may change what the task SAYS. The assignee may change what state it
--      is IN, and nothing else. Until now tasks_upd let all three of those
--      actors write every column, so an assignee could quietly rewrite the
--      brief they were judged against. (Amendment B / D3.)
--
--   3. A task's project, building and ESM cannot disagree with each other.
--      (Amendment E, and D1: "linked stage" = ESM.)
--
-- Plus task-specific audit prose. The generic audit_trigger_fn() wrote
-- "<actor> update on tasks #40c36e66", which records that something happened
-- and nothing about what. Amendment B requires a summary that NAMES the change,
-- because the audit trail is the anti-gaming mechanism for trash: a row that
-- can be hidden must leave a sentence saying who hid it and what state it was
-- in. audit_trigger_fn() itself is untouched and still serves the other tables.
--
-- Guard convention (same as 0098 / 0102): every AUTHORITY check is skipped when
-- auth.uid() is null, so service-role and maintenance contexts are not broken.
-- The app.chain_rewire GUC set by profiles_archive_cascade() (0105) is honoured
-- the same way — that cascade hands an archived person's open work to their
-- manager, and it is the system moving work, not a person reassigning it.
-- CONSISTENCY checks are deliberately NOT skipped: they are data integrity, not
-- authority, and a service context has no more business writing a building from
-- the wrong project than a signed-in user does.

-- ---------------------------------------------------------------------------
-- 1. columns
-- ---------------------------------------------------------------------------
alter table public.tasks
  add column if not exists deleted_at    timestamptz,
  add column if not exists deleted_by_id uuid references public.profiles(id),
  add column if not exists esm_id        uuid references public.esms(id) on delete set null;

comment on column public.tasks.deleted_at is
  'Soft delete (amendment A). Non-null = in the trash: excluded from the working lists, still readable, still restorable, never destroyed. There is no DELETE policy on this table, so this is the only removal that exists.';
comment on column public.tasks.deleted_by_id is
  'Who moved the row to the trash. Stamped server-side by tasks_edit_guard() from auth.uid() — never accepted from the client — and cleared on restore.';
comment on column public.tasks.esm_id is
  'The energy conservation measure this task belongs to ("linked stage", D1). Must be active on the task''s project via project_esms (archived = false); enforced by tasks_edit_guard().';

-- The working lists all filter `deleted_at is null`; the trash view is the rare
-- case. A partial index keeps the common query from paying for the feature.
create index if not exists tasks_live_idx
  on public.tasks (assigned_to_id, created_by_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 2. tasks_edit_guard — who may change WHAT, and the trash lock
--
-- FIRING ORDER. Postgres fires BEFORE ROW triggers in alphabetical order by
-- trigger name. On public.tasks that now gives:
--
--     tasks_edit_guard_trg   <  tasks_reassign_guard_trg
--                            <  tasks_set_updated_at
--                            <  tasks_status_guard_trg
--
-- tasks_edit_guard_trg sorting FIRST is deliberate and is the order we want.
-- It owns the outermost question — "may this row be touched at all right now?"
-- — and a trashed row must be refused before the other guards get a chance to
-- answer a narrower question about it. Without that ordering, trying to close a
-- task that is sitting in the trash would be rejected by tasks_status_guard
-- with a message about status transitions, which is true but describes the
-- wrong problem.
--
-- It also composes cleanly in the other direction: a trash or restore UPDATE
-- changes only deleted_at / deleted_by_id, so tasks_reassign_guard returns
-- early on `NEW.assigned_to_id is not distinct from OLD.assigned_to_id` and
-- tasks_status_guard returns early on the matching status test. Neither fires a
-- rule at it. This is asserted live rather than assumed.
-- ---------------------------------------------------------------------------
create or replace function public.tasks_edit_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  me         uuid    := auth.uid();
  rewire     text    := coalesce(current_setting('app.chain_rewire', true), '');
  system_ctx boolean := (me is null or rewire <> '');
  may_manage boolean;
  links_touched boolean;
  content_changed boolean;
  v_bproj    uuid;
begin
  -- =========================================================== consistency ==
  -- Data integrity, so this runs for every writer including service contexts.
  -- It validates the row's FINAL state rather than the delta, which is what
  -- makes the orphan case fall out for free: change project_id and leave a
  -- building from the old project behind and this rejects, because the pair is
  -- inconsistent. Clearing or re-pointing the link in the same statement passes.
  --
  -- It runs only when a link is actually touched. Any row that predates this
  -- migration and happens to be inconsistent therefore stays editable in every
  -- other dimension; it just cannot have its links touched without being made
  -- correct. (Verified at write time: zero such rows exist today.)
  -- Written as a branch rather than one boolean: OLD is unassigned during an
  -- INSERT, and PL/pgSQL evaluates the whole expression as a single SQL query
  -- with no short-circuit guarantee, so referencing OLD alongside a TG_OP test
  -- would raise "record old is not assigned yet".
  if TG_OP = 'INSERT' then
    links_touched := true;
  else
    links_touched :=
         NEW.project_id  is distinct from OLD.project_id
      or NEW.building_id is distinct from OLD.building_id
      or NEW.esm_id      is distinct from OLD.esm_id;
  end if;

  if links_touched then
    if NEW.building_id is not null then
      select b.project_id into v_bproj from public.buildings b where b.id = NEW.building_id;
      if v_bproj is distinct from NEW.project_id then
        raise exception 'That building belongs to a different project than the task'
          using errcode = 'check_violation';
      end if;
    end if;

    if NEW.esm_id is not null then
      if NEW.project_id is null then
        raise exception 'A task cannot carry an ESM without a project'
          using errcode = 'check_violation';
      end if;
      if not exists (
        select 1 from public.project_esms pe
         where pe.project_id = NEW.project_id
           and pe.esm_id     = NEW.esm_id
           and pe.archived is not true
      ) then
        raise exception 'That ESM is not active on the task''s project'
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  -- A task is never born in the trash. Nothing else about INSERT is this
  -- guard's business — tasks_ins already decides who may raise one.
  if TG_OP = 'INSERT' then
    NEW.deleted_at    := null;
    NEW.deleted_by_id := null;
    return NEW;
  end if;

  -- ============================================================= authority ==
  if system_ctx then
    return NEW;
  end if;

  -- Who raised a task is not a field, it is the anchor every other rule hangs
  -- off: tasks_status_guard lets the creator cancel, and the two rules below let
  -- the creator edit and trash. Nothing policed created_by_id before this, and
  -- tasks_upd's WITH CHECK actively rewards changing it — `created_by_id =
  -- auth.uid()` is satisfied by the NEW row, so setting it to yourself passes.
  -- Verified live before this migration: an assignee could set created_by_id to
  -- themselves and the update was ACCEPTED, which promoted them to creator and
  -- handed them cancel rights over someone else's task. Immutable from here.
  if NEW.created_by_id is distinct from OLD.created_by_id then
    raise exception 'Who raised a task cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;

  -- Amendment D3: the trash/edit right is one set — whoever raised it, or a
  -- manager above whoever holds it. Deliberately the SAME set as Edit, so a
  -- person who can rewrite a task can also withdraw it, and nobody else can.
  may_manage := (me = OLD.created_by_id) or public.is_in_subtree(me, OLD.assigned_to_id);

  content_changed :=
       NEW.title       is distinct from OLD.title
    or NEW.description is distinct from OLD.description
    or NEW.priority    is distinct from OLD.priority
    or NEW.due_date    is distinct from OLD.due_date
    or NEW.project_id  is distinct from OLD.project_id
    or NEW.building_id is distinct from OLD.building_id
    or NEW.esm_id      is distinct from OLD.esm_id;

  -- ------------------------------------------------------- trash / restore --
  if NEW.deleted_at is distinct from OLD.deleted_at then
    if not may_manage then
      raise exception 'Only the person who raised this task, or a manager above the person it is assigned to, can move it to the trash'
        using errcode = 'insufficient_privilege';
    end if;
    -- Stamped from auth.uid(), never from whatever the client sent.
    if NEW.deleted_at is not null then
      NEW.deleted_by_id := me;
    else
      NEW.deleted_by_id := null;
    end if;
  elsif NEW.deleted_by_id is distinct from OLD.deleted_by_id then
    -- The stamp is not independently editable; who trashed a row is a fact
    -- about the trashing, not a field.
    NEW.deleted_by_id := OLD.deleted_by_id;
  end if;

  -- --------------------------------------- a trashed row accepts nothing ----
  -- ...but restore. A row in the trash is withdrawn: it must not keep accruing
  -- status moves, reassignments or edits, because that is exactly how a trashed
  -- row would be quietly rewritten and restored looking like something else.
  if OLD.deleted_at is not null then
    if NEW.deleted_at is not null then
      raise exception 'This task is in the trash — restore it before changing anything else'
        using errcode = 'insufficient_privilege';
    end if;
    if content_changed
       or NEW.status         is distinct from OLD.status
       or NEW.assigned_to_id is distinct from OLD.assigned_to_id then
      raise exception 'Restore this task first, then change it — a restore cannot carry other edits with it'
        using errcode = 'insufficient_privilege';
    end if;
    return NEW;
  end if;

  -- --------------------------------------------------------- content edit ---
  -- The assignee is intentionally NOT here. Holding a task lets you report on
  -- it (status, via tasks_status_guard) — it does not let you rewrite the brief
  -- you are being measured against.
  if content_changed and not may_manage then
    raise exception 'Only the person who raised this task, or a manager above the person it is assigned to, can edit its details'
      using errcode = 'insufficient_privilege';
  end if;

  return NEW;
end;
$$;

comment on function public.tasks_edit_guard() is
  '9R(3). Content edits and trash/restore are creator-or-manager-above-assignee only; the assignee is status-only. created_by_id is immutable. A trashed row accepts nothing but restore. Project/building/ESM consistency is enforced for every writer, including service contexts. Authority checks skip when auth.uid() is null or app.chain_rewire is set (0098/0105 convention).';

drop trigger if exists tasks_edit_guard_trg on public.tasks;
create trigger tasks_edit_guard_trg
  before insert or update on public.tasks
  for each row execute function public.tasks_edit_guard();

-- ---------------------------------------------------------------------------
-- 3. audit_tasks_fn — the same audit row, with a sentence that says something
--
-- Identical column and payload shape to audit_trigger_fn(), because
-- Dashboard.jsx, Settings.jsx, BuildingDetail.jsx and Shell.jsx all read
-- `summary` and `payload` from audit_log and must not be touched by this. Only
-- the prose in `summary` changes.
--
-- Dates are rendered with to_char and an explicit ASCII pattern: Latin digits,
-- no locale formatter, per the standing constraint.
-- ---------------------------------------------------------------------------
create or replace function public.audit_tasks_fn()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_actor    public.profiles%rowtype;
  v_action   public.audit_action;
  v_old      jsonb;
  v_new      jsonb;
  v_record   uuid;
  v_ip       inet;
  v_summary  text;
  v_who      text;
  v_title    text;
  v_parts    text[] := '{}';
  v_n        int;
  v_to       text;
begin
  select * into v_actor from public.profiles where id = (select auth.uid());
  v_who := coalesce(v_actor.full_name, 'The system');

  if tg_op = 'INSERT' then
    v_action := 'insert'; v_new := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_action := 'update'; v_new := to_jsonb(new); v_old := to_jsonb(old);
  else
    v_action := 'delete'; v_old := to_jsonb(old);
  end if;

  v_record := coalesce(v_new->>'id', v_old->>'id')::uuid;
  -- NEW is unassigned on DELETE and OLD on INSERT, so neither can be referenced
  -- unconditionally; read the title out of the jsonb snapshots instead.
  v_title  := coalesce(v_new->>'title', v_old->>'title', 'a task');

  begin
    v_ip := nullif(split_part(
              (current_setting('request.headers', true))::jsonb->>'x-forwarded-for', ',', 1), '')::inet;
  exception when others then
    v_ip := null;
  end;

  -- ----------------------------------------------------------------- insert --
  if tg_op = 'INSERT' then
    v_to := case
      when new.assigned_to_id = (select auth.uid()) then 'themselves'
      else coalesce((select p.full_name from public.profiles p where p.id = new.assigned_to_id), 'nobody')
    end;
    v_summary := v_who || ' assigned ''' || v_title || ''' to ' || v_to;
    if new.due_date is not null then
      v_summary := v_summary || ', due ' || to_char(new.due_date, 'DD Mon YYYY');
    end if;
    if new.priority is not null then
      v_summary := v_summary || ', priority ' || new.priority::text;
    end if;
    v_summary := v_summary || '.';

  -- ----------------------------------------------------------------- delete --
  -- Unreachable from any session: there is no DELETE policy on tasks. Kept so
  -- that if a service context ever does it, the trail says so in words.
  elsif tg_op = 'DELETE' then
    v_summary := v_who || ' permanently deleted ''' || v_title || '''.';

  -- ----------------------------------------------------------------- update --
  elsif old.deleted_at is null and new.deleted_at is not null then
    -- Amendment C's anti-gaming record: actor, task, and the state it was in.
    v_summary := v_who || ' moved ''' || v_title || ''' to trash (was '
                 || replace(old.status::text, '_', ' ') || ').';

  elsif old.deleted_at is not null and new.deleted_at is null then
    v_summary := v_who || ' restored ''' || v_title || ''' from trash.';

  else
    -- Each clause carries a %T placeholder wherever the task should be named.
    -- Alone, %T becomes the quoted title so the row reads as a sentence; in a
    -- list it becomes "it", because naming the task once at the front and then
    -- again in every clause reads like a machine.
    if new.status is distinct from old.status then
      v_parts := v_parts || (case
        when new.status = 'done'      then 'marked %T done'
        when new.status = 'cancelled' then 'cancelled %T'
        else 'moved %T to ' || replace(new.status::text, '_', ' ')
      end);
    end if;

    if new.assigned_to_id is distinct from old.assigned_to_id then
      v_parts := v_parts || ('reassigned %T from '
        || coalesce((select p.full_name from public.profiles p where p.id = old.assigned_to_id), 'nobody')
        || ' to '
        || coalesce((select p.full_name from public.profiles p where p.id = new.assigned_to_id), 'nobody'));
    end if;

    if new.title is distinct from old.title then
      v_parts := v_parts || ('retitled ''' || coalesce(old.title, '—') || ''' to ''' || coalesce(new.title, '—') || '''');
    end if;

    if new.description is distinct from old.description then
      v_parts := v_parts || 'rewrote the description of %T';
    end if;

    if new.priority is distinct from old.priority then
      v_parts := v_parts || ('priority from ' || coalesce(old.priority::text, 'none') || ' to ' || coalesce(new.priority::text, 'none'));
    end if;

    if new.due_date is distinct from old.due_date then
      v_parts := v_parts || ('due date from '
        || coalesce(to_char(old.due_date, 'DD Mon YYYY'), 'none') || ' to '
        || coalesce(to_char(new.due_date, 'DD Mon YYYY'), 'none'));
    end if;

    if new.project_id is distinct from old.project_id then
      v_parts := v_parts || ('project from '
        || coalesce((select p.code from public.projects p where p.id = old.project_id), 'none') || ' to '
        || coalesce((select p.code from public.projects p where p.id = new.project_id), 'none'));
    end if;

    if new.building_id is distinct from old.building_id then
      v_parts := v_parts || ('building from '
        || coalesce((select b.code from public.buildings b where b.id = old.building_id), 'none') || ' to '
        || coalesce((select b.code from public.buildings b where b.id = new.building_id), 'none'));
    end if;

    if new.esm_id is distinct from old.esm_id then
      v_parts := v_parts || ('ESM from '
        || coalesce((select e.code from public.esms e where e.id = old.esm_id), 'none') || ' to '
        || coalesce((select e.code from public.esms e where e.id = new.esm_id), 'none'));
    end if;

    v_n := coalesce(array_length(v_parts, 1), 0);
    if v_n = 0 then
      -- Something changed that nobody reads as news (updated_at alone).
      v_summary := v_who || ' touched ''' || v_title || '''.';
    elsif v_n = 1 then
      -- The common case, and the one that should read like English rather than
      -- like a changelog: "Yousef Al-Maliki marked 'Submit MS' done."
      if position('%T' in v_parts[1]) > 0 then
        v_summary := v_who || ' ' || replace(v_parts[1], '%T', '''' || v_title || '''') || '.';
      else
        -- A clause with nothing to name (a bare field change) still needs the
        -- task identified, so it takes the list form even on its own.
        v_summary := v_who || ' updated ''' || v_title || ''': ' || v_parts[1] || '.';
      end if;
    else
      v_summary := v_who || ' updated ''' || v_title || ''': '
                   || replace(array_to_string(v_parts, ', '), '%T', 'it') || '.';
    end if;
  end if;

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

comment on function public.audit_tasks_fn() is
  '9R(3). Task-specific audit writer: same columns and payload shape as audit_trigger_fn(), with a one-sentence summary naming what actually changed (amendment B) and, for a trash, the state the row was in (amendment C anti-gaming). Attached to public.tasks only; audit_trigger_fn() still serves every other audited table.';

-- Swap the tasks trigger onto the new writer. Additive in effect: no other
-- table's audit changes, and audit_trigger_fn() is not modified.
drop trigger if exists audit_tasks on public.tasks;
create trigger audit_tasks
  after insert or update or delete on public.tasks
  for each row execute function public.audit_tasks_fn();
