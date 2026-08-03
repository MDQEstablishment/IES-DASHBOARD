-- 9R(3) — amendment D: responsibility sees, it never acts.
--
-- tasks_read has always granted reach along ONE axis: the reporting tree, plus
-- a deliberate two-role programme-wide carve-out for ceo and pmo (0102 shrank
-- that carve-out from five roles to two). The consequence the owner objected to
-- is that a project manager could be accountable for a project and unable to
-- see a task raised on it, because the people involved happened to sit on a
-- different branch of the org chart. Accountability without visibility.
--
-- This adds the second axis, and ONLY to reading: the person named as a
-- project's pm_id may SELECT tasks carrying that project_id.
--
-- Nothing else widens, and that restraint is the whole point of the amendment.
-- tasks_upd is not touched, so a pm who is not also the creator, the assignee,
-- or a manager above the assignee can read such a task and change nothing about
-- it — an UPDATE simply matches no row and reports back as a no-op. The guards
-- are not touched either: tasks_status_guard still says only the assignee may
-- close and only the creator may cancel, tasks_reassign_guard still refuses any
-- assignment outside the actor's own subtree, and tasks_edit_guard (0124) still
-- restricts content edits and trash to creator-or-manager-above-assignee. Being
-- responsible for a project buys you the right to know, not the right to act.
--
-- Additive: the existing expression is reproduced verbatim and one branch is
-- appended. No branch is removed, so no reader loses reach.
--
-- WHY A SECURITY DEFINER HELPER AND NOT AN INLINE SUBQUERY. The obvious way to
-- write this branch is `project_id in (select id from projects where pm_id =
-- auth.uid())`. That subquery would run as the caller and therefore under
-- projects' own RLS, which is projects_read → can_read_project(id) → a
-- role-conditional expression: is_broad_reader() covers every role except projm
-- and proje, projm is handled by an explicit pm_id branch, proje by
-- building_engineers. It happens to resolve correctly for every role today, so
-- the inline form would pass its tests and be quietly load-bearing on a policy
-- that has nothing to do with this amendment.
--
-- That is exactly the coupling this codebase has already been bitten by once:
-- 0102 narrowed the tasks read carve-out from five roles to two, and anything
-- that had been leaning on the wider set would have silently lost reach. If
-- is_broad_reader() is ever narrowed the same way, an inline subquery here would
-- stop returning rows and a pm would lose visibility with nothing in this file
-- changing. So the test is isolated into a SECURITY DEFINER helper, which is the
-- house pattern for precisely this reason (0010: the helpers "intentionally
-- bypass RLS so RLS policies that call them do NOT recurse").
--
-- It leaks nothing: pm_id is compared to auth.uid(), so the only rows that can
-- satisfy it are ones naming the caller.

create or replace function public.is_project_pm(p_project uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.projects pr
     where pr.id = p_project and pr.pm_id = (select auth.uid())
  );
$$;

comment on function public.is_project_pm(uuid) is
  'True if the current user is named as that project''s pm_id. SECURITY DEFINER so the tasks_read widening (amendment D) does not depend on the caller''s reach over public.projects.';

grant execute on function public.is_project_pm(uuid) to authenticated;

drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select
using (
  public.auth_role() = any (array['ceo'::user_role, 'pmo'::user_role])
  or assigned_to_id = (select auth.uid())
  or created_by_id  = (select auth.uid())
  or public.is_in_subtree((select auth.uid()), assigned_to_id)
  or public.is_in_subtree((select auth.uid()), created_by_id)
  -- amendment D — the project's own manager may read its tasks.
  or public.is_project_pm(project_id)
);
