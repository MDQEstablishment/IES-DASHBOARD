-- supabase/migrations/0082_coc_storage_buckets.sql
-- Sprint 8S Phase 1 — private buckets: generated COC PDFs + received external
-- response docs. RLS mirrors the delivery-notes pattern (0061).

insert into storage.buckets (id, name, public) values
  ('coc-pdfs', 'coc-pdfs', false), ('coc-responses', 'coc-responses', false)
on conflict (id) do nothing;

do $$
declare b text;
begin
  foreach b in array array['coc-pdfs','coc-responses'] loop
    execute format('drop policy if exists %I on storage.objects', replace(b,'-','_')||'_read');
    execute format($f$create policy %I on storage.objects for select to authenticated
      using (bucket_id = %L)$f$, replace(b,'-','_')||'_read', b);
    execute format('drop policy if exists %I on storage.objects', replace(b,'-','_')||'_write');
    execute format($f$create policy %I on storage.objects for insert to authenticated
      with check (bucket_id = %L
        and public.auth_role() = any (array['admin','pmo','projm','progm','proje']::public.user_role[]))$f$,
      replace(b,'-','_')||'_write', b);
  end loop;
end $$;
