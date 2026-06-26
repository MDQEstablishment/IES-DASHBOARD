-- supabase/migrations/0057_buildings_assigned_engineer.sql
-- Sprint 8B (#18/#19/#22) — bind an engineer to each building at import time so the
-- Buildings table shows a name + avatar the moment a project lands, instead of "?".
-- assigned_engineer_id is the FK source of truth; engineer_name stays as the
-- denormalized label the table already renders (set from the resolved profile).

alter table public.buildings add column if not exists assigned_engineer_id uuid references public.profiles(id);
