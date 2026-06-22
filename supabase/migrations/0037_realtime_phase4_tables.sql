-- supabase/migrations/0037_realtime_phase4_tables.sql
-- IES Programme Control Platform v2 — Phase 5 hotfix
-- The Phase-4 tables were never added to the supabase_realtime publication, so
-- useLiveQuery() never received change events for them — e.g. changing a
-- material-delivery status updated the DB but the table didn't refresh until a
-- hard reload (looked like the change "did nothing"). Add them to the publication.
-- Idempotent: skip any table already published.

do $$
declare t text;
begin
  foreach t in array array['material_deliveries','project_documents','building_photos','project_status_history']
  loop
    if to_regclass('public.'||t) is not null
       and not exists (
         select 1 from pg_publication_tables
         where pubname='supabase_realtime' and schemaname='public' and tablename=t)
    then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
