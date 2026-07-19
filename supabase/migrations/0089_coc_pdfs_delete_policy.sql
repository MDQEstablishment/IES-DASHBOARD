-- 8Y item 5: managers can delete a generated COC from the UI. cocs already allows
-- DELETE (0079 FOR ALL write policy); the coc-pdfs / coc-responses buckets only
-- granted select+insert (0082). Add a matching DELETE policy so removing a
-- certificate also removes its PDF (and any feedback doc).
do $$ declare b text; begin
  foreach b in array array['coc-pdfs','coc-responses'] loop
    execute format('drop policy if exists %I on storage.objects', replace(b,'-','_')||'_delete');
    execute format($f$create policy %I on storage.objects for delete to authenticated
      using (bucket_id = %L
        and public.auth_role() = any (array['admin','pmo','projm','progm','proje']::public.user_role[]))$f$,
      replace(b,'-','_')||'_delete', b);
  end loop;
end $$;
