-- Roles arrive: "owner" (may manage logins) and "staff" (everything else).
-- New accounts default to staff — an account can now only gain owner rights by
-- being seeded or promoted deliberately in SQL, never through the app.
ALTER TABLE "AdminUser" ALTER COLUMN "role" SET DEFAULT 'staff';

-- Every account that existed BEFORE roles carried role='admin' and had full
-- powers, including creating other admins. Promoting them to owner preserves
-- exactly what they could already do — nobody loses access in this migration.
-- Written as NOT IN (…) so re-running can't demote a real owner or promote staff.
UPDATE "AdminUser" SET "role" = 'owner' WHERE "role" NOT IN ('owner', 'staff');
