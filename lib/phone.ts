// Phone number rules, shared by the booking form, the public API and the admin.
// No Node imports, so the browser form can enforce the very same rule (like
// `password-policy`) — but every entry point re-checks it server-side.
//
// Why this exists: WhatsApp is the ONLY channel this salon has, so a mistyped
// number is a silently unreachable booking. `wa.me` builds a perfectly valid
// link for a bad number and nothing fails until the owner taps send and gets
// "the number isn't on WhatsApp" — hours later, with no way to reach the client.
// One digit short is all it takes (0755269481 typed as 075526948).

export const DEFAULT_CC = "94"; // Sri Lanka

// Every LK mobile is 9 digits after the country code and starts with 7 (07x local).
const LK_MOBILE = /^7\d{8}$/;

// Shortest/longest a full international number can be (E.164 allows 15 digits).
const MIN_INTL = 10;
const MAX_INTL = 15;

/**
 * Digits only, with the country code applied — the form `wa.me` expects.
 * Returns whatever it can; use `isValidPhone` to decide if it's usable.
 */
export function toE164Digits(input: string, cc: string = DEFAULT_CC): string {
  let d = (input || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2); // 0094 71… → 9471…
  else if (d.startsWith("0")) d = cc + d.slice(1); // 071… → 9471…
  else if (LK_MOBILE.test(d)) d = cc + d; // 71… typed without the leading 0
  return d;
}

/**
 * THE storage format. Everything written to the database — Customer.phone,
 * Notification.toPhone — goes through this first.
 *
 * Digits only, country code applied, no `+`, no spaces: `94766684586`. That is
 * exactly what `wa.me` wants, and it matches `SITE.whatsapp`.
 *
 * Why it matters beyond tidiness: `Customer.phone` is UNIQUE, so the raw text
 * was the identity key. One person booking as "076 668 4586" and later as
 * "+94766684586" became two customers with split history, and the admin's
 * look-up-by-phone missed the record that already existed.
 *
 * Idempotent — re-running it on an already-stored number is a no-op, which is
 * what lets the backfill script be safely re-run.
 */
export function toStoredPhone(input: string, cc: string = DEFAULT_CC): string {
  return toE164Digits(input, cc);
}

/** True when the number can actually receive a WhatsApp message. */
export function isValidPhone(input: string, cc: string = DEFAULT_CC): boolean {
  const d = toE164Digits(input, cc);
  if (!d) return false;
  // Local number: must be a real LK mobile. Landlines are rejected on purpose —
  // the field is the customer's *WhatsApp* number.
  if (d.startsWith(cc)) return LK_MOBILE.test(d.slice(cc.length));
  // Someone typed a foreign number in full.
  return d.length >= MIN_INTL && d.length <= MAX_INTL;
}

/** One message, used everywhere, so the customer sees the same wording as the owner. */
export const PHONE_HINT =
  "Enter a WhatsApp number like 071 234 5678 (10 digits), or +94 71 234 5678.";

export function phoneProblem(input: string, cc: string = DEFAULT_CC): string | null {
  if (!(input || "").trim()) return "A WhatsApp number is required.";
  return isValidPhone(input, cc) ? null : `That number doesn't look right. ${PHONE_HINT}`;
}

/** Pretty form for display: +94 71 234 5678. */
export function formatPhone(input: string, cc: string = DEFAULT_CC): string {
  const d = toE164Digits(input, cc);
  if (!d) return input;
  if (d.startsWith(cc) && LK_MOBILE.test(d.slice(cc.length))) {
    const n = d.slice(cc.length);
    return `+${cc} ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
  }
  return `+${d}`;
}
