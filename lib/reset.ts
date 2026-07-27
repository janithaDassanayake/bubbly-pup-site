// Password-reset token lifecycle, shared by the public "forgot password" flow
// and the authenticated "send this admin a reset link" button.
import { prisma } from "./db";
import { hashPassword, hashToken, newResetToken } from "./password";

export const RESET_TTL_MIN = 30;
/** Requests allowed per account inside the window — a brake on mail-bombing. */
export const RESET_MAX_PER_WINDOW = 3;
export const RESET_WINDOW_MIN = 15;

/** Housekeeping horizon: past this, a row is beyond both the TTL and the throttle. */
const KEEP_HISTORY_DAYS = 7;

/** Fresh single-use link. Any earlier unused link for this admin stops working. */
export async function issueResetToken(adminUserId: string) {
  const { raw, hash } = newResetToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESET_TTL_MIN * 60_000);
  const staleBefore = new Date(now.getTime() - KEEP_HISTORY_DAYS * 86_400_000);

  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({
      where: { adminUserId, createdAt: { lt: staleBefore } },
    }),
    // Supersede any live link by EXPIRING it, never by deleting the row: these
    // rows are what `tooManyResets` counts, so deleting them would silently
    // switch the rate limit off. (It did — that's why this isn't a deleteMany.)
    prisma.passwordResetToken.updateMany({
      where: { adminUserId, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    }),
    prisma.passwordResetToken.create({ data: { adminUserId, tokenHash: hash, expiresAt } }),
  ]);
  return { raw, expiresAt };
}

export async function tooManyResets(adminUserId: string): Promise<boolean> {
  const since = new Date(Date.now() - RESET_WINDOW_MIN * 60_000);
  const n = await prisma.passwordResetToken.count({
    where: { adminUserId, createdAt: { gte: since } },
  });
  return n >= RESET_MAX_PER_WINDOW;
}

export type TokenCheck =
  | { ok: true; admin: { id: string; email: string; name: string } }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/** Look a raw token up without spending it — lets the reset page render a form. */
export async function checkResetToken(raw: string): Promise<TokenCheck> {
  if (!raw) return { ok: false, reason: "invalid" };
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { admin: { select: { id: true, email: true, name: true } } },
  });
  if (!row) return { ok: false, reason: "invalid" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, admin: row.admin };
}

/**
 * Spend the token and set the new password in ONE transaction, so a token can
 * never be used twice — even if two requests arrive at the same moment. The
 * `usedAt: null` guard in the update is what makes that race safe.
 */
export async function consumeResetToken(
  raw: string,
  newPassword: string
): Promise<{ ok: true; adminUserId: string } | { ok: false; reason: "invalid" | "expired" | "used" }> {
  const check = await checkResetToken(raw);
  if (!check.ok) return check;

  const tokenHash = hashToken(raw);
  const passwordHash = await hashPassword(newPassword);

  try {
    await prisma.$transaction(async (tx) => {
      const spent = await tx.passwordResetToken.updateMany({
        where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      // Someone else got there first — abort without touching the password.
      if (spent.count !== 1) throw new Error("ALREADY_USED");
      await tx.adminUser.update({
        where: { id: check.admin.id },
        data: { passwordHash, mustChangePassword: false },
      });
      // A password change makes every other outstanding link pointless. Expired,
      // not deleted — same reason as in issueResetToken (the throttle counts rows).
      await tx.passwordResetToken.updateMany({
        where: { adminUserId: check.admin.id, usedAt: null },
        data: { expiresAt: new Date() },
      });
    });
  } catch {
    return { ok: false, reason: "used" };
  }
  return { ok: true, adminUserId: check.admin.id };
}
