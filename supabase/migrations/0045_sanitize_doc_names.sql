-- supabase/migrations/0045_sanitize_doc_names.sql
-- IES Programme Control Platform v2 — Sprint 5 (5F audit fix)
-- Zero-Arabic gate: replace any project_documents.name containing Arabic letters
-- or Arabic-Indic digits (test entries) with an English label derived from the
-- document type. No legitimate Arabic content should exist in rendered fields.

update public.project_documents set name = case doc_type
    when 'material_submittal' then 'Material Submittal'
    when 'method_statement'   then 'Method Statement'
    when 'mir'                then 'MIR'
    when 'wir'                then 'WIR'
    when 'coc'                then 'COC'
    else 'Document' end || ' — ' || left(id::text, 8)
where name ~ '[؀-ۿ٠-٩۰-۹]';
