-- 9G(4) — user administration: rank rules, loop-proof reporting lines, and an
-- archive that actually hands the work over.
--
-- The Settings > Users panel told the reader:
--   "Role edits, password resets and archiving are managed server-side and
--    gated by RLS — peers and seniors are protected."
-- None of that was true. There was no editor at all, and profiles_upd granted
-- pmo and admin blanket UPDATE on every column of every row — a PMO could make
-- themselves CEO, point anyone at anyone, or archive the last administrator.
-- Nothing stopped a reporting loop either, and is_in_subtree() recurses over
-- manager_id, so one loop would have hung every RLS check that walks the chain.
--
-- This migration is the server half. It does not widen anyone's access; it
-- narrows what pmo/admin can do with the access they already had.

-- Authority ranking. Lower number = more senior. admin sits OUTSIDE the
-- operational chain at rank 0: it is the break-glass account, not a super-CEO.
create or replace function public.role_rank(r public.user_role)
returns int language sql immutable
set search_path to ''
as $$
  select case r
    when 'admin' then 0
    when 'ceo'   then 1
    when 'pmo'   then 2
    when 'progm' then 3
    when 'procm' then 3
    when 'projm' then 4
    when 'proco' then 5
    when 'proje' then 5
    when 'plane' then 5
  end;
$$;

create or replace function public.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  me      uuid := auth.uid();
  my_role public.user_role;
  n       int;
begin
  -- No auth context = the archive cascade or a service task. Those are trusted
  -- and must not be blocked by rules written for signed-in editors.
  if me is null then return NEW; end if;
  my_role := public.auth_role();

  ---------------------------------------------------------------- role changes
  if NEW.role is distinct from OLD.role then
    if me = OLD.id then
      raise exception 'You cannot change your own role'
        using errcode = 'insufficient_privilege';
    end if;
    if my_role is distinct from 'admin'
       and (public.role_rank(NEW.role) <= public.role_rank(my_role)
         or public.role_rank(OLD.role) <= public.role_rank(my_role)) then
      raise exception 'You can only manage roles below your own'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  ------------------------------------------------------------- reporting lines
  if NEW.manager_id is distinct from OLD.manager_id then
    if NEW.manager_id = OLD.id then
      raise exception 'Someone cannot report to themselves'
        using errcode = 'check_violation';
    end if;
    if NEW.manager_id is not null then
      if (select archived from public.profiles where id = NEW.manager_id) then
        raise exception 'You cannot make an archived person somebody''s manager'
          using errcode = 'check_violation';
      end if;
      -- A loop here would make is_in_subtree() recurse forever, and that
      -- function sits under the task and escalation read policies.
      if public.is_in_subtree(OLD.id, NEW.manager_id) then
        raise exception 'That would create a loop in the reporting chain'
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  -------------------------------------------------------------------- archiving
  if NEW.archived and not OLD.archived then
    if me = OLD.id then
      raise exception 'You cannot archive yourself'
        using errcode = 'insufficient_privilege';
    end if;
    if my_role is distinct from 'admin'
       and public.role_rank(OLD.role) <= public.role_rank(my_role) then
      raise exception 'You can only archive people ranked below you'
        using errcode = 'insufficient_privilege';
    end if;
    if OLD.role = 'admin' then
      select count(*) into n from public.profiles
       where role = 'admin' and not archived and id <> OLD.id;
      if n = 0 then
        raise exception 'This is the last active administrator — promote someone else first'
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists profiles_guard_trg on public.profiles;
create trigger profiles_guard_trg
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------------
-- Archiving hands the work over instead of stranding it.
--
-- Without this, archiving someone left their open tasks assigned to an account
-- that can no longer sign in, their direct reports pointing at a dead manager
-- (so is_in_subtree stopped resolving for that whole branch), and any
-- escalation raised to them permanently unanswerable — no one else is allowed
-- to acknowledge or resolve it.
--
-- The escalation re-home is the ONE documented exception to chain immutability
-- (0103). It is reached by clearing the auth context for the duration of the
-- cascade and setting the app.chain_rewire GUC — both conditions the
-- escalations_chain_immutable() trigger requires. The claims are restored
-- immediately afterwards. Clearing them also lets the 0102 task guards through,
-- which is correct: this is the system moving work, not a person reassigning it.
-- ---------------------------------------------------------------------------
create or replace function public.profiles_archive_cascade()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_claims text;
  v_mgr    uuid := OLD.manager_id;
  n_tasks  int := 0;
  n_esc    int := 0;
begin
  if not (NEW.archived and not OLD.archived) then return NEW; end if;

  v_claims := current_setting('request.jwt.claims', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.chain_rewire', 'archive_cascade', true);

  -- Direct reports move up to the archived person's manager, keeping the chain
  -- connected. If there was no manager they become tops, which is visible in
  -- the org chart rather than silently broken.
  update public.profiles set manager_id = v_mgr where manager_id = OLD.id;

  if v_mgr is not null then
    update public.tasks set assigned_to_id = v_mgr
     where assigned_to_id = OLD.id and status in ('open', 'in_progress', 'blocked');
    get diagnostics n_tasks = row_count;

    update public.escalations set raised_to_id = v_mgr
     where raised_to_id = OLD.id and status in ('open', 'acknowledged');
    get diagnostics n_esc = row_count;

    raise notice 'archive cascade for %: % task(s) and % escalation(s) handed to %',
      OLD.id, n_tasks, n_esc, v_mgr;
  else
    raise warning 'archived profile % has no manager — its open tasks and escalations were left in place', OLD.id;
  end if;

  perform set_config('app.chain_rewire', '', true);
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  return NEW;
end;
$$;

drop trigger if exists profiles_archive_cascade_trg on public.profiles;
create trigger profiles_archive_cascade_trg
  after update on public.profiles
  for each row execute function public.profiles_archive_cascade();
