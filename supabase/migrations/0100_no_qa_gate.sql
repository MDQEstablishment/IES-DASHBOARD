-- Sprint 9F Part A: THERE IS NO APPROVAL STEP.
-- Owner decision: when the project manager logs an installation, that IS the
-- truth. The QA approve/reject affordance is removed from the app.
--
-- Nothing is dropped. install_qa_status, qa_status, approved_by_id and
-- approved_at all stay: the historical record of who approved what remains
-- readable, and reviving a gate later needs only a default change.
--
-- The reason this is a MIGRATION and not a UI-only change: warehouse stock is
-- deducted by ledger_on_install() (0065), which writes the 'consumption_out'
-- stock_ledger row ONLY when qa_status becomes 'approved'. Verified before this
-- migration: 18 approved install rows <-> exactly 18 consumption_out rows, and
-- the 7 pending_qa rows (18 units) had NEVER been deducted. Had we only removed
-- the buttons, every future install would default to pending_qa, never be
-- approved, and silently stop consuming stock.

-- ---------------------------------------------------------------------------
-- 1. new rows are the truth on arrival
--    trg_ledger_on_install is AFTER INSERT OR UPDATE and its guard reads
--    "NEW.qa_status = 'approved' and (TG_OP = 'INSERT' or ...)", so the
--    consumption row is now written at log time. No trigger logic changes.
-- ---------------------------------------------------------------------------
alter table public.install_log alter column qa_status set default 'approved';

-- ---------------------------------------------------------------------------
-- 2. ledger provenance: approved_by_id is null for every row from here on, so
--    fall back to whoever logged the install rather than losing the actor.
--    Existing approved rows keep their approver — coalesce prefers it.
-- ---------------------------------------------------------------------------
create or replace function public.ledger_on_install() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_var uuid; v_proj uuid; v_bld uuid;
begin
  if NEW.qa_status = 'approved' and (TG_OP = 'INSERT' or OLD.qa_status is distinct from 'approved') then
    select m.id, b.project_id, bis.building_id into v_var, v_proj, v_bld
    from public.building_item_scope bis
    join public.buildings b on b.id = bis.building_id
    join public.materials m on m.code = bis.material_code
    where bis.id = NEW.scope_id;
    if v_var is not null and coalesce(NEW.qty,0) <> 0 then
      insert into public.stock_ledger (project_id, variant_id, building_id, delta, reason, ref_table, ref_id, created_by, created_at)
      values (v_proj, v_var, v_bld, -coalesce(NEW.qty,0), 'consumption_out', 'install_log', NEW.id,
              coalesce(NEW.approved_by_id, NEW.installed_by_id), coalesce(NEW.approved_at, now()));
    end if;
  end if;
  return NEW;
end $$;

-- ---------------------------------------------------------------------------
-- 3. the backlog of never-counted installs becomes true, and the warehouse
--    catches up: this UPDATE fires the same trigger, writing the consumption
--    rows those installs should always have had.
--    approved_at := created_at — the PM's log moment IS the truth moment.
--    approved_by_id stays NULL: there was no reviewer, and inventing one would
--    falsify the audit trail.
-- ---------------------------------------------------------------------------
update public.install_log
   set qa_status = 'approved', approved_at = coalesce(approved_at, created_at)
 where qa_status = 'pending_qa';

-- ---------------------------------------------------------------------------
-- 4. say what the columns mean now
-- ---------------------------------------------------------------------------
comment on column public.install_log.qa_status is
  'DORMANT (9F): there is no approval step — a logged installation is the truth and new rows default to approved. Kept so historical approve/reject decisions stay readable and so stock consumption keeps its single trigger condition. Readers must count everything NOT rejected, never only approved.';
comment on column public.install_log.approved_by_id is
  'HISTORICAL (9F): the QA reviewer, for rows logged while the approval gate existed. NULL for everything logged since.';
comment on column public.install_log.approved_at is
  'HISTORICAL (9F): when the gate was passed. For rows back-approved by 0100 this is the original created_at — the moment the install was logged.';
