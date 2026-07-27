// Email sending for admin account mail (reset links, invites) — the ONE thing
// WhatsApp can't do, because free wa.me needs a human to tap send and can't
// deliver TO the salon.
//
// Deliberately dependency-free: Resend's REST API over fetch, so nothing is
// added to the bundle and nothing needs a native build. Set both env vars to
// switch it on; until then `isMailConfigured()` is false and callers fall back
// to showing the link to an already-authenticated admin (never to an anonymous
// visitor — that would hand out account access).
//
//   RESEND_API_KEY=re_xxx
//   MAIL_FROM="Bubbly Pup <admin@yourdomain.com>"   ← must be a verified sender
export const isMailConfigured = () =>
  Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

export type MailResult = { ok: boolean; error?: string };

export async function sendMail(msg: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<MailResult> {
  if (!isMailConfigured()) return { ok: false, error: "Email is not configured." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
      }),
    });
    if (!res.ok) {
      // Body carries the provider's reason (unverified domain, bad key, …).
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `Mail provider said ${res.status}. ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't reach the mail provider." };
  }
}

// ---- message bodies ----
export function resetEmail(link: string, name: string, businessName: string) {
  const text = [
    `Hi ${name},`,
    ``,
    `Use this link to set a new ${businessName} admin password:`,
    link,
    ``,
    `The link works once and expires in 30 minutes.`,
    `If you didn't ask for it, you can ignore this email — nothing has changed.`,
  ].join("\n");

  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#2a2230;line-height:1.6">
  <p>Hi ${escapeHtml(name)},</p>
  <p>Use this link to set a new <strong>${escapeHtml(businessName)}</strong> admin password:</p>
  <p><a href="${escapeHtml(link)}" style="display:inline-block;background:#ff69b4;color:#fff;
     text-decoration:none;padding:11px 18px;border-radius:9px;font-weight:600">Set a new password</a></p>
  <p style="color:#7a7280;font-size:13px">The link works once and expires in 30 minutes.<br>
  If you didn't ask for it, you can ignore this email — nothing has changed.</p>
</div>`;

  return { subject: `Reset your ${businessName} admin password`, text, html };
}

export function inviteEmail(link: string, name: string, businessName: string) {
  const text = [
    `Hi ${name},`,
    ``,
    `You've been given admin access to ${businessName}.`,
    `Set your password here:`,
    link,
    ``,
    `The link works once and expires in 30 minutes. Ask for a new one if it lapses.`,
  ].join("\n");
  return { subject: `Your ${businessName} admin account`, text, html: undefined };
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
