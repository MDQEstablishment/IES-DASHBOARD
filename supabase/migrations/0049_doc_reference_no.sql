-- supabase/migrations/0049_doc_reference_no.sql
-- Sprint 7 (Note #2.3) — every generated/uploaded document gets a stable, human
-- reference number: {KIND}-{PROJECT_CODE}-{YYYY}-{SEQ4}, sequence per
-- (project, kind, year). e.g. MIR-MOI-ASIR-2026-0001.

alter table public.project_documents add column if not exists reference_no text;

-- short kind code for the reference prefix
create or replace function public.doc_kind_code(p_doc_type text)
returns text language sql immutable as $$
  select case p_doc_type
    when 'mir' then 'MIR' when 'wir' then 'WIR' when 'coc' then 'COC'
    when 'material_submittal' then 'MS' when 'method_statement' then 'MOS'
    else 'DOC' end;
$$;

-- compute the next reference for (project, kind, year-of-ts): prefix + max+1
create or replace function public.compute_doc_reference(p_project_id uuid, p_doc_type text, p_ts timestamptz)
returns text language plpgsql stable as $$
declare v_prefix text; v_seq int;
begin
  select public.doc_kind_code(p_doc_type) || '-' || coalesce(pr.code, 'PRJ') || '-' || to_char(p_ts, 'YYYY') || '-'
    into v_prefix
  from public.projects pr where pr.id = p_project_id;
  if v_prefix is null then
    v_prefix := public.doc_kind_code(p_doc_type) || '-PRJ-' || to_char(p_ts, 'YYYY') || '-';
  end if;
  select coalesce(max(substring(reference_no from '([0-9]{4})$')::int), 0) + 1 into v_seq
  from public.project_documents
  where project_id = p_project_id and reference_no like v_prefix || '%';
  return v_prefix || lpad(v_seq::text, 4, '0');
end $$;

-- peek the next reference (used by the client to stamp the PDF before insert)
create or replace function public.next_doc_reference(p_project_id uuid, p_doc_type text)
returns text language sql stable as $$
  select public.compute_doc_reference(p_project_id, p_doc_type, now());
$$;
grant execute on function public.next_doc_reference(uuid, text) to authenticated;

-- auto-assign on insert when the client didn't supply one (e.g. direct uploads)
create or replace function public.assign_doc_reference() returns trigger language plpgsql as $$
begin
  if new.reference_no is null or new.reference_no = '' then
    new.reference_no := public.compute_doc_reference(new.project_id, new.doc_type, coalesce(new.created_at, now()));
  end if;
  return new;
end $$;
drop trigger if exists trg_assign_doc_reference on public.project_documents;
create trigger trg_assign_doc_reference before insert on public.project_documents
  for each row execute function public.assign_doc_reference();

-- backfill existing rows: sequence by created_at within (project, kind, year)
with seq as (
  select d.id, d.project_id, d.doc_type,
    public.doc_kind_code(d.doc_type) as kind, coalesce(pr.code, 'PRJ') as code,
    to_char(d.created_at, 'YYYY') as yr,
    row_number() over (partition by d.project_id, d.doc_type, to_char(d.created_at, 'YYYY')
                       order by d.created_at, d.id) as rn
  from public.project_documents d
  left join public.projects pr on pr.id = d.project_id
  where d.reference_no is null
)
update public.project_documents d
  set reference_no = s.kind || '-' || s.code || '-' || s.yr || '-' || lpad(s.rn::text, 4, '0')
from seq s where s.id = d.id;

create unique index if not exists project_documents_reference_no_key
  on public.project_documents (reference_no);
