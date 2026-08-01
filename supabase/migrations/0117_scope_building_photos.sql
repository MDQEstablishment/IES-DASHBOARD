-- 9K(1f) — building_photos: the seventeenth policy.
--
-- Reported at the end of 9K(1) rather than fixed, because it was not among the
-- sixteen the sprint was authorised to touch. Now approved, and it closes with
-- the same shape as the rest.
--
-- WHAT WAS WRONG. building_photos_write read:
--
--     role in (admin, pmo, progm, projm, proje)
--     or exists (select 1 from building_engineers be
--                 where be.building_id = building_photos.building_id
--                   and be.engineer_id = auth.uid())
--
-- The second arm is sound and is kept verbatim: whoever is assigned to a
-- building may photograph it, whatever their role. The first is the C1 pattern
-- — a bare role check, so any projm or proje could add or delete site
-- photographs on any building in the programme.
--
-- This one is sharper than the sixteen because the table hangs off a BUILDING,
-- and buildings themselves are already scoped: buildings_read uses
-- can_read_building(id). So a projm could read, write and delete the photographs
-- of a building the same database would not let them see. The evidence outlived
-- the record it belonged to.
--
-- THE FIX. can_read_building() is the existing helper and is exactly the right
-- one — true for the seven broad roles (so admin, pmo and progm, the broad
-- readers in this array, are unaffected), pm_id-scoped for projm, and
-- assignment-scoped for proje. The role array is preserved byte-for-byte and
-- the engineer arm is untouched.
--
-- READS ARE SCOPED TOO, and this is the change to notice: qual was `true`. It
-- now matches the parent table exactly, so the photographs of a building are
-- visible to precisely the people who can see the building. For every broad
-- reader nothing moves at all; a projm or proje browsing a building outside
-- their remit could not open it in the first place.

drop policy if exists building_photos_select on public.building_photos;
create policy building_photos_select on public.building_photos
  for select to authenticated
  using (public.can_read_building(building_id));

drop policy if exists building_photos_write on public.building_photos;
create policy building_photos_write on public.building_photos
  for all to authenticated
  using (
    ((select profiles.role from public.profiles where profiles.id = auth.uid())
       = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'progm'::user_role, 'projm'::user_role, 'proje'::user_role])
     and public.can_read_building(building_id))
    or exists (select 1 from public.building_engineers be
                where be.building_id = building_photos.building_id
                  and be.engineer_id = auth.uid())
  )
  with check (
    ((select profiles.role from public.profiles where profiles.id = auth.uid())
       = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'progm'::user_role, 'projm'::user_role, 'proje'::user_role])
     and public.can_read_building(building_id))
    or exists (select 1 from public.building_engineers be
                where be.building_id = building_photos.building_id
                  and be.engineer_id = auth.uid())
  );
