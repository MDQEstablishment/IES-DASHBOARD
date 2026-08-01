-- 9K(1c) — fence the COC state machine (CRITICAL C1, part 3 of 5).
--
-- 0113 settled WHICH certificates a person may touch. This settles HOW. Today
-- the state machine lives entirely in five SECURITY DEFINER functions, each
-- with a real precondition — mark_coc_sent refuses anything but 'generated',
-- log_coc_feedback refuses anything but 'generated'/'sent', create_coc_revision
-- refuses anything but 'rejected'/'accepted_with_comments'. Every one of those
-- checks is bypassed by a single PostgREST call:
--
--     PATCH /rest/v1/cocs?id=eq.<uuid>  {"status":"approved"}
--
-- because cocs_write is a row filter and knows nothing about columns. A
-- certificate could go from draft straight to approved, keep a sent_at with no
-- PDF, or have its reference_no rewritten after issue. For a document the
-- programme submits to TARSHID, the state IS the artefact.
--
-- THE FENCE. A BEFORE trigger rejects any change to the state columns
--
--     status, pdf_path, generated_at, sent_at, revision,
--     superseded_by_coc_id, root_coc_id, seq, code, reference_no
--
-- unless the transaction-local GUC `app.coc_rpc` is set to 'on'. The five RPCs
-- (plus the new one below) set it with set_config(..., true) — transaction
-- scope, so it cannot leak into a later statement on a pooled connection.
--
-- WHY A GUC IS SUFFICIENT AS A CAPABILITY. PostgREST exposes only functions in
-- the exposed schema; set_config is not among them, and `SET` is not a verb the
-- REST interface has. A client therefore has no way to raise the flag: the only
-- code that can is code already running inside one of these functions. This is
-- the same mechanism migration 0103 used for `app.chain_rewire`.
--
-- WHAT STAYS CLIENT-WRITABLE, deliberately: feedback_outcome, feedback_at,
-- feedback_comments, feedback_doc_path and attachments_checked. CocFeedbackModal
-- and CocGenerateWizard write those directly today and must keep working; none
-- of them is a state transition.
--
-- INSERT is fenced too, but only against forged history: a direct insert may
-- create a draft (status 'draft', no generated_at/sent_at/pdf_path, revision 1,
-- no supersede pointer). Anything richer has to come from generate_cocs or
-- create_coc_revision.
--
-- ---------------------------------------------------------------------------
-- THE SECOND HOLE THIS CLOSES, found while writing the fence.
--
-- All five RPCs gate on the ROLE ARRAY ALONE — exactly the C1 pattern, but
-- inside SECURITY DEFINER functions where RLS cannot help. So before this
-- migration a projm could call mark_coc_sent() on any project's certificate,
-- and 0113's policy scoping does nothing about it, because the function runs as
-- its definer. Each of the five now resolves the target project and applies the
-- same can_read_project() fence the policies use. Broad readers are unaffected;
-- projm and proje are held to their own projects.
--
-- ---------------------------------------------------------------------------
-- THE NEW RPC, and why it exists.
--
-- One client write in the app moved fenced columns: CocHome's "delete this
-- revision" restores the revision it superseded —
--     update cocs set superseded_by_coc_id = null,
--                     status = <prior.feedback_outcome or 'rejected'>
-- The triage's instruction was to rewire that call to the appropriate existing
-- RPC. There is none: the five cover generate / mark generated / mark sent /
-- create revision / log feedback, and none reverses a supersede. So this
-- migration adds restore_prior_coc_revision(), which computes the SAME status
-- the client used to compute — coalesce(feedback_outcome, 'rejected') — but
-- server-side, so the status can no longer be chosen by the caller. CocHome is
-- rewired to it in the same commit. The user-visible behaviour is identical.

-- ---------------------------------------------------------------------------
-- 1. the fence
-- ---------------------------------------------------------------------------
create or replace function public.cocs_state_fence()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_rpc boolean := coalesce(current_setting('app.coc_rpc', true), '') = 'on';
begin
  if v_rpc then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A hand-made row may only ever be a fresh draft.
    if new.status <> 'draft'
       or new.generated_at is not null
       or new.sent_at is not null
       or new.pdf_path is not null
       or coalesce(new.revision, 1) <> 1
       or new.superseded_by_coc_id is not null then
      raise exception 'A certificate can only be created as a draft — use generate_cocs() or create_coc_revision()'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if new.status               is distinct from old.status
     or new.pdf_path             is distinct from old.pdf_path
     or new.generated_at         is distinct from old.generated_at
     or new.sent_at              is distinct from old.sent_at
     or new.revision             is distinct from old.revision
     or new.superseded_by_coc_id is distinct from old.superseded_by_coc_id
     or new.root_coc_id          is distinct from old.root_coc_id
     or new.seq                  is distinct from old.seq
     or new.code                 is distinct from old.code
     or new.reference_no         is distinct from old.reference_no then
    raise exception 'A certificate''s state is set by the certificate workflow, not by direct edit'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end $$;

drop trigger if exists trg_cocs_state_fence on public.cocs;
create trigger trg_cocs_state_fence
  before insert or update on public.cocs
  for each row execute function public.cocs_state_fence();

-- ---------------------------------------------------------------------------
-- 2. the five RPCs — raise the flag, and check the project
-- ---------------------------------------------------------------------------
create or replace function public.generate_cocs(p_project_id uuid, p_rows jsonb default null::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rows jsonb;
  v_row jsonb;
  v_proj record;
  v_seq int;
  v_id uuid;
  v_code text;
  v_esm text[];
  v_bids uuid[];
  v_created uuid[] := '{}';
begin
  if public.auth_role() <> all (array['admin','pmo','projm','progm','proje']::public.user_role[]) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if not public.can_read_project(p_project_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select id, code into v_proj from projects where id = p_project_id and deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid_project'); end if;

  perform set_config('app.coc_rpc', 'on', true);

  v_rows := coalesce(p_rows, coc_plan_preview(p_project_id));
  select coalesce(max(seq), 0) into v_seq from cocs where project_id = p_project_id;

  for v_row in select * from jsonb_array_elements(v_rows) loop
    if v_row->>'exists_coc_id' is not null then continue; end if;
    v_esm := array(select jsonb_array_elements_text(v_row->'esm_codes'));
    v_bids := array(select (jsonb_array_elements_text(v_row->'building_ids'))::uuid);
    if coalesce(array_length(v_esm, 1), 0) = 0 or coalesce(array_length(v_bids, 1), 0) = 0 then continue; end if;
    v_seq := v_seq + 1;
    v_id := gen_random_uuid();
    v_code := v_proj.code || '-COC-' || lpad(v_seq::text, 3, '0');
    insert into cocs (id, project_id, seq, code, reference_no, esm_bundle, esm_codes, revision, root_coc_id, status, created_by)
    values (v_id, p_project_id, v_seq, v_code, v_code, array_to_string(v_esm, '+'), v_esm, 1, v_id, 'draft', auth.uid());
    insert into coc_covered_buildings (coc_id, building_id) select v_id, unnest(v_bids);
    v_created := v_created || v_id;
  end loop;

  return jsonb_build_object('ok', true, 'created', coalesce(array_length(v_created, 1), 0), 'coc_ids', to_jsonb(v_created));
end $function$;

create or replace function public.mark_coc_generated(p_coc_id uuid, p_pdf_path text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_status text; v_project uuid;
begin
  if public.auth_role() <> all (array['admin','pmo','projm','progm','proje']::public.user_role[]) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select status, project_id into v_status, v_project from cocs where id = p_coc_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.can_read_project(v_project) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_status not in ('draft', 'generated') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', v_status);
  end if;
  perform set_config('app.coc_rpc', 'on', true);
  update cocs set status = 'generated', pdf_path = p_pdf_path, generated_at = now() where id = p_coc_id;
  return jsonb_build_object('ok', true);
end $function$;

create or replace function public.mark_coc_sent(p_coc_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_status text; v_project uuid;
begin
  if public.auth_role() <> all (array['admin','pmo','projm','progm','proje']::public.user_role[]) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select status, project_id into v_status, v_project from cocs where id = p_coc_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.can_read_project(v_project) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_status <> 'generated' then
    return jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', v_status);
  end if;
  perform set_config('app.coc_rpc', 'on', true);
  update cocs set status = 'sent', sent_at = now() where id = p_coc_id;
  return jsonb_build_object('ok', true);
end $function$;

create or replace function public.log_coc_feedback(p_coc_id uuid, p_outcome text, p_comments text default null::text, p_doc_path text default null::text, p_feedback_at timestamp with time zone default now())
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_status text; v_project uuid;
begin
  if public.auth_role() <> all (array['admin','pmo','projm','progm','proje']::public.user_role[]) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_outcome not in ('approved', 'accepted_with_comments', 'rejected') then
    return jsonb_build_object('ok', false, 'error', 'invalid_outcome');
  end if;
  if p_outcome = 'rejected' and coalesce(trim(p_comments), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'comments_required');
  end if;
  select status, project_id into v_status, v_project from cocs where id = p_coc_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.can_read_project(v_project) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_status not in ('generated', 'sent') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', v_status);
  end if;
  perform set_config('app.coc_rpc', 'on', true);
  update cocs set
    status = p_outcome, feedback_outcome = p_outcome, feedback_at = coalesce(p_feedback_at, now()),
    feedback_comments = nullif(trim(coalesce(p_comments, '')), ''), feedback_doc_path = p_doc_path
  where id = p_coc_id;
  return jsonb_build_object('ok', true);
end $function$;

create or replace function public.create_coc_revision(p_source_coc_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_src record; v_id uuid;
begin
  if public.auth_role() <> all (array['admin','pmo','projm','progm','proje']::public.user_role[]) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select * into v_src from cocs where id = p_source_coc_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.can_read_project(v_src.project_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_src.status not in ('rejected', 'accepted_with_comments') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', v_src.status);
  end if;
  perform set_config('app.coc_rpc', 'on', true);
  v_id := gen_random_uuid();
  insert into cocs (id, project_id, seq, code, reference_no, esm_bundle, esm_codes, revision, root_coc_id, status, created_by)
  values (v_id, v_src.project_id, v_src.seq, v_src.code, v_src.reference_no, v_src.esm_bundle,
          v_src.esm_codes, v_src.revision + 1, coalesce(v_src.root_coc_id, v_src.id), 'draft', auth.uid());
  insert into coc_covered_buildings (coc_id, building_id)
  select v_id, building_id from coc_covered_buildings where coc_id = p_source_coc_id;
  update cocs set status = 'superseded', superseded_by_coc_id = v_id where id = p_source_coc_id;
  return jsonb_build_object('ok', true, 'coc_id', v_id, 'revision', v_src.revision + 1);
end $function$;

-- ---------------------------------------------------------------------------
-- 3. the sixth: reverse a supersede, for the delete-a-revision path
-- ---------------------------------------------------------------------------
create or replace function public.restore_prior_coc_revision(p_superseding_coc_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_prior record;
begin
  if public.auth_role() <> all (array['admin','pmo','projm','progm','proje']::public.user_role[]) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select * into v_prior from cocs where superseded_by_coc_id = p_superseding_coc_id;
  if not found then
    -- Not an error: the caller is deleting a revision that supersedes nothing.
    return jsonb_build_object('ok', true, 'restored', 0);
  end if;
  if not public.can_read_project(v_prior.project_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  perform set_config('app.coc_rpc', 'on', true);
  -- The status the client used to compute, computed here instead so a caller
  -- cannot choose it: the outcome that caused the revision, or 'rejected'.
  update cocs
     set superseded_by_coc_id = null,
         status = coalesce(v_prior.feedback_outcome, 'rejected')
   where id = v_prior.id;

  return jsonb_build_object('ok', true, 'restored', 1, 'coc_id', v_prior.id,
                            'status', coalesce(v_prior.feedback_outcome, 'rejected'));
end $function$;

grant execute on function public.restore_prior_coc_revision(uuid) to authenticated;
