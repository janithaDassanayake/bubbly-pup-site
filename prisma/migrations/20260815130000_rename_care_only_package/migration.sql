-- "Care Services Only" read as a package the customer buys. It is not one: the
-- row exists only to carry the 30-minute duration for a visit booked WITHOUT a
-- package, which is why it is priced at 0 — the services chosen are the whole
-- bill. The new name says that on the admin dropdown, where it was being picked
-- by mistake.
--
-- The seed keeps names in sync from lib/catalog.ts, but the seed does not run on
-- deploy — only migrations do — so the rename has to happen here to reach the
-- live database.

-- Guarded on the old name so a row the salon has already renamed by hand is
-- left exactly as it is.
UPDATE "Package"
SET "name" = 'No package (care services)'
WHERE "key" = 'care-only' AND "name" = 'Care Services Only';
