-- The salon grooms cats as well as dogs now. Species gets its own column rather
-- than a marker buried in the pet's notes, so the admin lists can show it, and
-- so a cat can be saved with no breed without that reading as missing data.

-- CreateEnum
CREATE TYPE "PetSpecies" AS ENUM ('DOG', 'CAT');

-- Every pet booked before this column existed was a dog — the booking form
-- offered nothing else — so the default backfills the existing rows correctly.
-- AlterTable
ALTER TABLE "Pet" ADD COLUMN "species" "PetSpecies" NOT NULL DEFAULT 'DOG';
