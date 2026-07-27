-- The salon takes bookings on Sunday too (0=Sun … 6=Sat).
-- Flip the column default…
ALTER TABLE "Settings" ALTER COLUMN "workingDays" SET DEFAULT ARRAY[1, 2, 3, 4, 5, 6, 0]::INTEGER[];

-- …and add Sunday to the existing settings row. Guarded so the migration is a
-- no-op on a database where Sunday was already ticked in Settings.
UPDATE "Settings"
SET "workingDays" = array_append("workingDays", 0)
WHERE NOT (0 = ANY("workingDays"));
