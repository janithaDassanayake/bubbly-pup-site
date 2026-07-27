import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { CATALOG_PACKAGES, CATALOG_ADDONS } from "../lib/catalog";

const prisma = new PrismaClient();

const hash = (s: string) => bcrypt.hashSync(s, 10);

async function main() {
  // Packages + standalone services
  for (const p of CATALOG_PACKAGES) {
    await prisma.package.upsert({
      where: { key: p.key },
      update: { name: p.name, durationMin: p.durationMin, price: p.price, standalone: p.standalone },
      create: p,
    });
  }

  // Add-ons
  for (const a of CATALOG_ADDONS) {
    await prisma.addOn.upsert({
      where: { key: a.key },
      update: { name: a.name, price: a.price, category: a.category, group: a.group },
      create: a,
    });
  }

  // Settings singleton
  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  // The owner account — the only one that can create staff logins (lib/roles.ts).
  // `update` sets the role so an existing pre-roles admin is promoted on re-seed.
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@bubblypup.lk";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  await prisma.adminUser.upsert({
    where: { email },
    update: { role: "owner" },
    create: { email, passwordHash: hash(password), name: "Salon Admin", role: "owner" },
  });

  console.log(
    `Seeded ${CATALOG_PACKAGES.length} packages, ${CATALOG_ADDONS.length} add-ons, settings, admin (${email}).`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
