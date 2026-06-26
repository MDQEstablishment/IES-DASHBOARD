-- supabase/migrations/0048_template_fields.sql
-- Sprint 6F — capture the official Tarshid-template fields that the generated
-- MIR/WIR/COC need but we didn't store yet. Additive only (nullable columns);
-- existing RLS policies already cover new columns. PROPOSED — apply after owner
-- approval. Generators fall back gracefully when these are null.

-- Project-level template fields (MIR/WIR header + COC project-information block)
alter table public.projects
  add column if not exists doc_rev                text default '00',
  add column if not exists project_reference_no   text,
  add column if not exists beneficiary_entity     text,
  add column if not exists contract_sign_date     date,
  add column if not exists works_end_date         date,
  add column if not exists energy_services_company text default 'Tarshid',
  add column if not exists subcontractor          text;

-- Building-level fields (COC building-information + electricity-company block)
alter table public.buildings
  add column if not exists building_type        text,
  add column if not exists city                 text,
  add column if not exists elec_meter_no        text,
  add column if not exists elec_subscription_no text,
  add column if not exists elec_account_no      text;
