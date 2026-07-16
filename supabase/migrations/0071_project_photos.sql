-- supabase/migrations/0071_project_photos.sql
-- Sprint 8Q — Projects "Panorama" cards. Each project gets an optional cover
-- photo shown full-bleed on its card. Additive only: one nullable column plus a
-- private storage bucket. Existing rows keep photo_url = null and render with the
-- warm-neutral fallback block. No drops, no data changes.

-- ── column ───────────────────────────────────────────────────────────────────
-- Stores the storage object PATH inside the project-photos bucket
-- (project-photos/{project_id}/{uuid}.{ext}); the client resolves a signed URL.
alter table public.projects add column if not exists photo_url text;

-- ── private bucket + storage RLS (mirror of delivery-notes, 0061) ────────────
insert into storage.buckets (id, name, public) values ('project-photos', 'project-photos', false)
  on conflict (id) do nothing;

-- read: any authenticated user (same as delivery-notes / daily-progress-photos)
drop policy if exists project_photos_read on storage.objects;
create policy project_photos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'project-photos');

-- write: only roles that may edit a project (matches Projects.jsx canEdit).
-- insert + update (upsert on replace) + delete (Remove photo) are all gated.
drop policy if exists project_photos_insert on storage.objects;
create policy project_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'project-photos'
    and public.auth_role() = any (array['admin','pmo','projm','progm']::public.user_role[]));

drop policy if exists project_photos_update on storage.objects;
create policy project_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'project-photos'
    and public.auth_role() = any (array['admin','pmo','projm','progm']::public.user_role[]));

drop policy if exists project_photos_delete on storage.objects;
create policy project_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'project-photos'
    and public.auth_role() = any (array['admin','pmo','projm','progm']::public.user_role[]));
