// Last-resort password reset, run by whoever has database access.
//
// Why this exists: only the OWNER can hand out reset links in the portal, so if
// the owner is locked out AND no mail provider is configured, there is no in-app
// way back in. This is that way back in.
//
//   npm run admin:password -- admin@bubblypup.lk "a-new-password"
//
// Against production, point DATABASE_URL at Neon's DIRECT (unpooled) string first.
import { PrismaClient } from "@prisma/client";
import { hashPassword, passwordProblem } from "../lib/password";

const prisma = new PrismaClient();

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: npm run admin:password -- <email> "<new password>"');
    process.exit(1);
  }

  const problem = passwordProblem(password);
  if (problem) {
    console.error(`Refused: ${problem}`);
    process.exit(1);
  }

  const user = await prisma.adminUser.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) {
    const all = await prisma.adminUser.findMany({ select: { email: true, role: true } });
    console.error(`No account for ${email}. Existing accounts:`);
    all.forEach((a) => console.error(`  ${a.email} (${a.role})`));
    process.exit(1);
  }

  await prisma.adminUser.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password), mustChangePassword: false },
  });
  // Outstanding reset links would otherwise still be usable by whoever holds them.
  await prisma.passwordResetToken.updateMany({
    where: { adminUserId: user.id, usedAt: null },
    data: { expiresAt: new Date() },
  });
  await prisma.auditLog.create({
    data: {
      adminUserId: user.id,
      action: "PASSWORD_SET_VIA_CLI",
      entity: "AdminUser",
      entityId: user.id,
    },
  });

  console.log(`✓ Password updated for ${user.email} (${user.role}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
