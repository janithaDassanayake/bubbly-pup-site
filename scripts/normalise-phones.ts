// One-off backfill: rewrite every stored phone number into the canonical form
// (lib/phone → toStoredPhone) and merge the duplicate customers that the old
// raw-text storage created.
//
//   npm run phones:normalise          # DRY RUN — reports, changes nothing
//   npm run phones:normalise -- --apply
//
// Against production, point DATABASE_URL at Neon's DIRECT (unpooled) string first.
//
// Why a merge is needed and not just an UPDATE: Customer.phone is UNIQUE, and the
// raw text was effectively the customer's identity. "076 668 4586" and
// "+94766684586" are the same person but became two rows. Normalising both to
// "94766684586" would violate the unique index, so same-person rows have to be
// folded together first — pets and appointments repointed, then the spare row
// deleted. Pet has onDelete: Cascade, so deleting before repointing would take
// the customer's pets with it.
//
// Safe to re-run: toStoredPhone is idempotent, so a second pass finds nothing.
import { PrismaClient } from "@prisma/client";
import { toStoredPhone, isValidPhone, formatPhone } from "../lib/phone";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const customers = await prisma.customer.findMany({
    select: { id: true, name: true, phone: true, email: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // Group by what each row SHOULD be stored as.
  const groups = new Map<string, typeof customers>();
  const unfixable: typeof customers = [];

  for (const c of customers) {
    const stored = toStoredPhone(c.phone);
    // Never guess at a number that isn't a usable WhatsApp number — leave it
    // exactly as typed and report it for a human to look at.
    if (!stored || !isValidPhone(c.phone)) {
      unfixable.push(c);
      continue;
    }
    const list = groups.get(stored) ?? [];
    list.push(c);
    groups.set(stored, list);
  }

  let renamed = 0;
  let merged = 0;
  let movedPets = 0;
  let movedAppointments = 0;

  for (const [stored, rows] of groups) {
    // The oldest row survives — it holds the customer's earliest history.
    const [survivor, ...duplicates] = rows;

    for (const dup of duplicates) {
      const pets = await prisma.pet.count({ where: { customerId: dup.id } });
      const appts = await prisma.appointment.count({ where: { customerId: dup.id } });
      console.log(
        `MERGE  ${formatPhone(stored)}  "${dup.name}" (${dup.phone}) -> "${survivor.name}" (${survivor.phone})  [${pets} pet(s), ${appts} appointment(s)]`
      );
      movedPets += pets;
      movedAppointments += appts;
      merged++;

      if (APPLY) {
        await prisma.$transaction(async (tx) => {
          await tx.pet.updateMany({ where: { customerId: dup.id }, data: { customerId: survivor.id } });
          await tx.appointment.updateMany({
            where: { customerId: dup.id },
            data: { customerId: survivor.id },
          });
          // Keep a contact detail the survivor is missing rather than dropping it.
          if (!survivor.email && dup.email) {
            await tx.customer.update({ where: { id: survivor.id }, data: { email: dup.email } });
          }
          await tx.customer.delete({ where: { id: dup.id } });
        });
      }
    }

    if (survivor.phone !== stored) {
      console.log(`RENAME ${survivor.phone.padEnd(20)} -> ${stored}   ("${survivor.name}")`);
      renamed++;
      if (APPLY) {
        await prisma.customer.update({ where: { id: survivor.id }, data: { phone: stored } });
      }
    }
  }

  // Queued messages carry their own copy of the number. Sent rows are the audit
  // trail of what actually went out and are deliberately left untouched.
  const pending = await prisma.notification.findMany({
    where: { status: "PENDING" },
    select: { id: true, toPhone: true },
  });
  let notifications = 0;
  for (const n of pending) {
    const stored = toStoredPhone(n.toPhone);
    if (!stored || !isValidPhone(n.toPhone) || stored === n.toPhone) continue;
    notifications++;
    if (APPLY) {
      await prisma.notification.update({ where: { id: n.id }, data: { toPhone: stored } });
    }
  }

  console.log("\n────────────────────────────────");
  console.log(`customers scanned      ${customers.length}`);
  console.log(`phones rewritten       ${renamed}`);
  console.log(`duplicates merged      ${merged}`);
  console.log(`  pets moved           ${movedPets}`);
  console.log(`  appointments moved   ${movedAppointments}`);
  console.log(`pending msgs rewritten ${notifications}`);
  if (unfixable.length) {
    console.log(`\n⚠ ${unfixable.length} number(s) left alone — not valid WhatsApp numbers:`);
    unfixable.forEach((c) => console.log(`   "${c.name}"  ${JSON.stringify(c.phone)}  (id ${c.id})`));
    console.log("  Fix these by hand in the admin portal (Customers → edit contact).");
  }
  console.log(
    APPLY
      ? "\n✓ Applied."
      : "\nDRY RUN — nothing was written. Re-run with --apply to commit."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
