-- supabase/migrations/0021_realtime_publication.sql
-- IES Programme Control Platform v2 — Phase 2, migration 21
-- Add the 14 client-subscribed tables to supabase_realtime, and set
-- REPLICA IDENTITY FULL so UPDATE/DELETE events carry the old row (needed for the
-- live-recompute interconnection). Explicitly NOT audit_log / profiles / building_engineers.

alter publication supabase_realtime add table
  public.projects, public.buildings, public.rooms, public.esms, public.project_esms,
  public.materials, public.building_item_scope, public.room_items, public.install_log,
  public.tasks, public.escalations, public.documents, public.esm_doc_status, public.photos;

alter table public.projects            replica identity full;
alter table public.buildings           replica identity full;
alter table public.rooms               replica identity full;
alter table public.esms                replica identity full;
alter table public.project_esms        replica identity full;
alter table public.materials           replica identity full;
alter table public.building_item_scope replica identity full;
alter table public.room_items          replica identity full;
alter table public.install_log         replica identity full;
alter table public.tasks               replica identity full;
alter table public.escalations         replica identity full;
alter table public.documents           replica identity full;
alter table public.esm_doc_status      replica identity full;
alter table public.photos              replica identity full;
