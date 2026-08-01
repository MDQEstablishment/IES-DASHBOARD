-- 9K(1d) — project-scope the documents family (CRITICAL C1, part 4 of 5).
--
-- project_documents_write was the oddest policy in the schema. In full:
--
--     role in (admin, pmo)                                  -- fine
--     or exists (select 1 from projects pr
--                 where pr.id = project_id
--                   and pr.pm_id = auth.uid())              -- fine, and the ONLY
--                                                           -- project-aware clause
--                                                           -- anywhere in the 16
--     or role = 'proje'                                     -- a global arm
--
-- The third arm is the bug the triage names: ANY project engineer could write
-- ANY project's documents — upload, overwrite, delete — including projects they
-- have never been assigned a building in. The second arm shows the author knew
-- the shape of the right answer and applied it to exactly one role.
--
-- The rewrite states the whole rule once:
--
--     auth_role() = ANY (admin, pmo, projm, proje)
--     and public.can_read_project(project_id)
--
-- Role by role, against what shipped:
--   admin, pmo  — broad readers, can_read_project() is true; unchanged.
--   projm       — was "is pm_id of this project", now "can_read_project", whose
--                 projm branch IS pm_id of this project. Identical.
--   proje       — was global; now their assigned buildings' projects. THIS is
--                 the hole closing.
--
-- ONE DELIBERATE NARROWING, recorded so it is a decision and not an accident:
-- the old pm_id arm was role-agnostic — anyone who happened to be a project's
-- pm_id could write its documents whatever their role. The rewrite makes that
-- arm projm-only. On live data every pm_id is a projm except one project whose
-- pm is the CEO and one whose pm is the PMO, both of which are broad readers
-- and keep their access through the role array. So no live user loses a
-- permission. A future non-projm pm_id would need adding to the array.
--
-- doc_submission_history has no project_id — it hangs off doc_id, so the fence
-- resolves through the parent document, the same shape 0113 used for the COC
-- children. Note that the history rows are normally written by
-- log_doc_status_change(), a SECURITY DEFINER trigger that bypasses RLS
-- entirely; this policy governs only direct API writes.

-- ---------------------------------------------------------------------------
-- project_documents
-- ---------------------------------------------------------------------------
drop policy if exists project_documents_select on public.project_documents;
create policy project_documents_select on public.project_documents
  for select to authenticated
  using (public.can_read_project(project_id));

drop policy if exists project_documents_write on public.project_documents;
create policy project_documents_write on public.project_documents
  for all to authenticated
  using (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'proje'::user_role])
    and public.can_read_project(project_id)
  )
  with check (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'proje'::user_role])
    and public.can_read_project(project_id)
  );

-- ---------------------------------------------------------------------------
-- doc_submission_history — project resolved through doc_id
-- ---------------------------------------------------------------------------
drop policy if exists doc_submission_history_read on public.doc_submission_history;
create policy doc_submission_history_read on public.doc_submission_history
  for select to authenticated
  using (exists (
    select 1 from public.project_documents d
     where d.id = doc_submission_history.doc_id
       and public.can_read_project(d.project_id)
  ));

drop policy if exists doc_submission_history_write on public.doc_submission_history;
create policy doc_submission_history_write on public.doc_submission_history
  for all to authenticated
  using (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'proje'::user_role])
    and exists (select 1 from public.project_documents d
                 where d.id = doc_submission_history.doc_id
                   and public.can_read_project(d.project_id))
  )
  with check (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'proje'::user_role])
    and exists (select 1 from public.project_documents d
                 where d.id = doc_submission_history.doc_id
                   and public.can_read_project(d.project_id))
  );
