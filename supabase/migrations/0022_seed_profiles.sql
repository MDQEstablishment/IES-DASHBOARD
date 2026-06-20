-- supabase/migrations/0022_seed_profiles.sql
-- IES Programme Control Platform v2 — Phase 2, migration 22 (closes Phase 2)
-- Link the 9 demo auth.users to public.profiles by email, set role + identity
-- color (from the design seed), then wire the manager_id reporting chain.
-- Idempotent: ON CONFLICT (id) DO NOTHING for the insert; the chain UPDATE is
-- a deterministic self-join by email, safe to re-run.

insert into public.profiles (id, full_name, email, role, color)
select u.id, d.full_name, d.email, d.role::public.user_role, d.color
from (values
  ('ahmed.hussam@ies.demo.local',    'Ahmed Hussam',     'ceo',   '#0F766E'),
  ('omar.zaki@ies.demo.local',       'Omar Zaki',        'pmo',   '#2563EB'),
  ('adnan@ies.demo.local',           'Adnan',            'procm', '#7C3AED'),
  ('shakkel@ies.demo.local',         'Shakkel',          'proco', '#9333EA'),
  ('jehad@ies.demo.local',           'Jehad',            'progm', '#0891B2'),
  ('majed.alqahtani@ies.demo.local', 'Majed Al-Qahtani', 'projm', '#D97706'),
  ('yousef.almaliki@ies.demo.local', 'Yousef Al-Maliki', 'proje', '#CA8A04'),
  ('ali@ies.demo.local',             'Ali',              'plane', '#DB2777'),
  ('admin@ies.demo.local',           'System Admin',     'admin', '#475569')
) as d(email, full_name, role, color)
join auth.users u on u.email = d.email
on conflict (id) do nothing;

update public.profiles p
set manager_id = m.id
from (values
  ('omar.zaki@ies.demo.local',       'ahmed.hussam@ies.demo.local'),
  ('adnan@ies.demo.local',           'omar.zaki@ies.demo.local'),
  ('shakkel@ies.demo.local',         'adnan@ies.demo.local'),
  ('jehad@ies.demo.local',           'omar.zaki@ies.demo.local'),
  ('majed.alqahtani@ies.demo.local', 'jehad@ies.demo.local'),
  ('yousef.almaliki@ies.demo.local', 'majed.alqahtani@ies.demo.local'),
  ('ali@ies.demo.local',             'omar.zaki@ies.demo.local')
) as rel(child_email, mgr_email)
join public.profiles m on m.email = rel.mgr_email
where p.email = rel.child_email;
