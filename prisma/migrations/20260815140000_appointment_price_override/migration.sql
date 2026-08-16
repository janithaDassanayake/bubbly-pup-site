-- Manual price adjustment on Edit appointment. The salon needs to discount a
-- visit (Rs. 4,000 basic bath sold at Rs. 2,000) or charge for extra work and
-- time (Rs. 4,000 → Rs. 5,000) without pretending the package or add-ons were
-- different from what the pet actually got.
--
-- Nullable, no default: NULL means "no adjustment", so every existing row keeps
-- being priced by "priceEstimate" exactly as before.
-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "priceOverride" INTEGER;
