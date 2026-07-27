"use server";
// PUBLIC server actions — reachable with NO session. Everything here assumes a
// hostile caller, so it must never:
//   • reveal whether an email has an account (account enumeration),
//   • return a reset link to the caller (that would be a free account takeover),
//   • allow unlimited attempts.
// The authenticated equivalents live in ./actions.ts.
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { passwordProblem } from "@/lib/password";
import { consumeResetToken, issueResetToken, tooManyResets, RESET_TTL_MIN } from "@/lib/reset";
import { isMailConfigured, resetEmail, sendMail } from "@/lib/mailer";
import { requestOrigin } from "@/lib/site";

export type ForgotResult = {
  /** Always true for any syntactically valid email — see the note below. */
  ok: boolean;
  error?: string;
  /** True only when this deployment has no mail provider, so the UI can explain. */
  mailNotConfigured?: boolean;
};

export async function requestPasswordReset(emailRaw: string): Promise<ForgotResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  // No mail provider → say so plainly instead of pretending a mail was sent.
  // An anonymous caller still learns nothing about which accounts exist.
  if (!isMailConfigured()) return { ok: true, mailNotConfigured: true };

  const admin = await prisma.adminUser.findUnique({ where: { email } });

  // The SAME answer whether or not the account exists. An attacker must not be
  // able to use this form to discover the salon's admin address.
  if (!admin) return { ok: true };
  if (await tooManyResets(admin.id)) return { ok: true };

  const { raw } = await issueResetToken(admin.id);
  const link = `${await requestOrigin()}/admin/reset/${raw}`;
  const { businessName } = await getSettings();
  const mail = resetEmail(link, admin.name, businessName);

  const sent = await sendMail({ to: admin.email, ...mail });
  await prisma.auditLog.create({
    data: {
      adminUserId: admin.id,
      action: "PASSWORD_RESET_REQUESTED",
      entity: "AdminUser",
      entityId: admin.id,
      meta: { delivered: sent.ok, ...(sent.error ? { error: sent.error } : {}) },
    },
  });

  // Even a provider failure returns ok — the caller must not learn the address
  // exists. The audit log carries the real outcome for whoever can read it.
  return { ok: true };
}

export type ResetResult = { ok: boolean; error?: string };

export async function resetPassword(token: string, password: string): Promise<ResetResult> {
  const problem = passwordProblem(password);
  if (problem) return { ok: false, error: problem };

  const r = await consumeResetToken(token, password);
  if (!r.ok) {
    return {
      ok: false,
      error:
        r.reason === "expired"
          ? `That link has expired (they last ${RESET_TTL_MIN} minutes). Request a new one.`
          : r.reason === "used"
          ? "That link has already been used. Request a new one."
          : "That link isn't valid. Request a new one.",
    };
  }

  await prisma.auditLog.create({
    data: {
      adminUserId: r.adminUserId,
      action: "PASSWORD_RESET_COMPLETED",
      entity: "AdminUser",
      entityId: r.adminUserId,
    },
  });
  return { ok: true };
}
