-- Two pets at a time.
--
-- The salon has one bath and one table, so two grooms overlap comfortably — one
-- dog washing while the other is dried and trimmed. What it CANNOT do is start
-- two dogs at once, because bathing comes first and there is one tub.
--
-- So capacity is a count (how many grooms may run together) and every package
-- carries a start gap (how long before the NEXT dog may start). The gap tracks
-- time in the tub, not the length of the appointment.
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "capacity" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "Package" ADD COLUMN IF NOT EXISTS "startGapMin" INTEGER NOT NULL DEFAULT 30;

-- Short packages are out of the tub sooner, so they hold the next booking up for
-- less time. (With a 30-minute slot grid this only bites once the salon moves to
-- 15-minute steps, but the number should be honest either way.)
UPDATE "Package" SET "startGapMin" = 15 WHERE "durationMin" <= 30;

-- Services with no bath at all still get a gap: the second dog needs the table
-- shortly after, and there is only one table.
UPDATE "Package" SET "startGapMin" = 30 WHERE "standalone" = true;
