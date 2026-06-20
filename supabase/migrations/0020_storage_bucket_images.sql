-- supabase/migrations/0020_storage_bucket_images.sql
-- IES Programme Control Platform v2 — Phase 2, migration 20
-- Single private 'images' bucket: image/* only, 500 KB cap (enforced by Storage
-- at the bucket level). RLS on storage.objects: read = any authenticated user;
-- write = field/manager roles; owner or managers may modify/delete their objects.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', false, 512000, array['image/*'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy images_read on storage.objects for select to authenticated
  using (bucket_id = 'images');

create policy images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and public.auth_role() in ('proje','projm','progm','pmo','ceo'));

create policy images_update on storage.objects for update to authenticated
  using (bucket_id = 'images' and (owner = (select auth.uid()) or public.auth_role() in ('projm','progm','pmo','ceo')))
  with check (bucket_id = 'images' and (owner = (select auth.uid()) or public.auth_role() in ('projm','progm','pmo','ceo')));

create policy images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'images' and (owner = (select auth.uid()) or public.auth_role() in ('pmo','ceo')));
