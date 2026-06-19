-- supabase/migrations/0012_audit_trigger_attachments.sql
-- IES Programme Control Platform v2 — Phase 2, migration 12 of 15
-- Attach audit_trigger_fn AFTER INSERT/UPDATE/DELETE to every business table.
-- audit_log itself is intentionally EXCLUDED (no self-auditing / recursion).

create trigger audit_profiles            after insert or update or delete on public.profiles            for each row execute function public.audit_trigger_fn();
create trigger audit_projects            after insert or update or delete on public.projects            for each row execute function public.audit_trigger_fn();
create trigger audit_buildings           after insert or update or delete on public.buildings           for each row execute function public.audit_trigger_fn();
create trigger audit_rooms               after insert or update or delete on public.rooms               for each row execute function public.audit_trigger_fn();
create trigger audit_esms                after insert or update or delete on public.esms                for each row execute function public.audit_trigger_fn();
create trigger audit_project_esms        after insert or update or delete on public.project_esms        for each row execute function public.audit_trigger_fn();
create trigger audit_materials           after insert or update or delete on public.materials           for each row execute function public.audit_trigger_fn();
create trigger audit_building_item_scope after insert or update or delete on public.building_item_scope for each row execute function public.audit_trigger_fn();
create trigger audit_room_items          after insert or update or delete on public.room_items          for each row execute function public.audit_trigger_fn();
create trigger audit_install_log         after insert or update or delete on public.install_log         for each row execute function public.audit_trigger_fn();
create trigger audit_tasks               after insert or update or delete on public.tasks               for each row execute function public.audit_trigger_fn();
create trigger audit_escalations         after insert or update or delete on public.escalations         for each row execute function public.audit_trigger_fn();
create trigger audit_documents           after insert or update or delete on public.documents           for each row execute function public.audit_trigger_fn();
create trigger audit_esm_doc_status      after insert or update or delete on public.esm_doc_status      for each row execute function public.audit_trigger_fn();
create trigger audit_photos              after insert or update or delete on public.photos              for each row execute function public.audit_trigger_fn();
create trigger audit_building_engineers  after insert or update or delete on public.building_engineers  for each row execute function public.audit_trigger_fn();
