-- Where an appointment came from: the customer's own online reservation, or one
-- the salon entered itself (walk-in / call-in).

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('ONLINE', 'WALK_IN');

-- AlterTable
ALTER TABLE "Appointment"
  ADD COLUMN "source" "AppointmentSource" NOT NULL DEFAULT 'ONLINE';

-- Backfill. Every appointment the admin portal created writes an
-- APPOINTMENT_CREATE audit row (app/admin/actions.ts); the public booking API
-- writes none. That audit trail is the only record of which side entered a
-- booking, so it is what decides the historical value -- anything without one
-- keeps the ONLINE default, which is where it came from.
UPDATE "Appointment" a
   SET "source" = 'WALK_IN'
 WHERE EXISTS (
   SELECT 1
     FROM "AuditLog" l
    WHERE l."entity" = 'Appointment'
      AND l."action" = 'APPOINTMENT_CREATE'
      AND l."entityId" = a."id"
 );

-- CreateIndex
CREATE INDEX "Appointment_date_source_idx" ON "Appointment"("date", "source");
