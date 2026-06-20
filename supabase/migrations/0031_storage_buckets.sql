-- supabase/migrations/0031_storage_buckets.sql
-- IES Programme Control Platform v2 — Phase 4, migration 31
-- Three new buckets: project-docs (private, 25 MB), building-photos (private,
-- 500 KB, image/*), project-templates (public, xlsx). RLS on storage.objects:
-- authenticated read; writes restricted by role via public.auth_role().

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('project-docs',      'project-docs',      false, 26214400, null),
  ('building-photos',   'building-photos',   false, 512000,   array['image/*']),
  ('project-templates', 'project-templates', true,  5242880,  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- project-docs: authenticated read; write = admin/PMO/PM/program/engineer
drop policy if exists project_docs_read on storage.objects;
create policy project_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'project-docs');
drop policy if exists project_docs_insert on storage.objects;
create policy project_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'project-docs' and public.auth_role() in ('admin','pmo','projm','progm','proje'));
drop policy if exists project_docs_modify on storage.objects;
create policy project_docs_modify on storage.objects for update to authenticated
  using (bucket_id = 'project-docs' and (owner = (select auth.uid()) or public.auth_role() in ('admin','pmo','projm','progm')))
  with check (bucket_id = 'project-docs' and (owner = (select auth.uid()) or public.auth_role() in ('admin','pmo','projm','progm')));
drop policy if exists project_docs_delete on storage.objects;
create policy project_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'project-docs' and (owner = (select auth.uid()) or public.auth_role() in ('admin','pmo')));

-- building-photos: authenticated read; write = field + manager roles
drop policy if exists building_photos_read on storage.objects;
create policy building_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'building-photos');
drop policy if exists building_photos_insert on storage.objects;
create policy building_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'building-photos' and public.auth_role() in ('proje','projm','progm','pmo','admin'));
drop policy if exists building_photos_modify on storage.objects;
create policy building_photos_modify on storage.objects for update to authenticated
  using (bucket_id = 'building-photos' and (owner = (select auth.uid()) or public.auth_role() in ('projm','progm','pmo','admin')))
  with check (bucket_id = 'building-photos' and (owner = (select auth.uid()) or public.auth_role() in ('projm','progm','pmo','admin')));
drop policy if exists building_photos_delete on storage.objects;
create policy building_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'building-photos' and (owner = (select auth.uid()) or public.auth_role() in ('pmo','admin')));

-- project-templates: public read; write = admin/PMO only
drop policy if exists project_templates_read on storage.objects;
create policy project_templates_read on storage.objects for select to public
  using (bucket_id = 'project-templates');
drop policy if exists project_templates_write on storage.objects;
create policy project_templates_write on storage.objects for all to authenticated
  using (bucket_id = 'project-templates' and public.auth_role() in ('admin','pmo'))
  with check (bucket_id = 'project-templates' and public.auth_role() in ('admin','pmo'));
