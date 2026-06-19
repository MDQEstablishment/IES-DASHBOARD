-- supabase/migrations/0008b_seed_demo_auth_users.sql
-- IES Programme Control Platform v2 — Phase 2, migration 8b
-- Seeds the 9 demo auth.users + their email-provider auth.identities directly
-- via SQL (owner-authorized; avoids the Dashboard step). Idempotent via NOT EXISTS.
-- Demo credentials BY DESIGN: shared password 'IESdemo2026!' on @ies.demo.local
-- throwaway accounts (owner has publicized this password). bcrypt cost 10.
-- pgcrypto lives in the `extensions` schema → crypt/gen_salt are schema-qualified.

with seed(email, full_name) as (
  values
    ('ahmed.hussam@ies.demo.local',   'Ahmed Hussam'),
    ('omar.zaki@ies.demo.local',      'Omar Zaki'),
    ('adnan@ies.demo.local',          'Adnan'),
    ('shakkel@ies.demo.local',        'Shakkel'),
    ('jehad@ies.demo.local',          'Jehad'),
    ('majed.alqahtani@ies.demo.local','Majed Al-Qahtani'),
    ('yousef.almaliki@ies.demo.local','Yousef Al-Maliki'),
    ('ali@ies.demo.local',            'Ali'),
    ('admin@ies.demo.local',          'System Admin')
),
new_users as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  select
    '00000000-0000-0000-0000-000000000000'::uuid,
    gen_random_uuid(),
    'authenticated', 'authenticated',
    s.email,
    extensions.crypt('IESdemo2026!', extensions.gen_salt('bf', 10)),
    now(),
    jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
    jsonb_build_object('full_name', s.full_name),
    now(), now(),
    '', '', '', ''
  from seed s
  where not exists (select 1 from auth.users u where u.email = s.email)
  returning id, email
)
insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select
  u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
  'email', now(), now(), now()
from new_users u;
