// Free WhatsApp integration via wa.me click-to-chat links — $0 recurring cost,
// no Meta Business verification, no per-message billing. The system COMPOSES and
// LOGS every message (Notification table = audit log, SRS requirement); the owner
// sends it with one tap from the admin. Swappable for the Cloud API later without
// touching callers.
import { NotificationType } from "@prisma/client";
import { DEFAULT_CC, toE164Digits } from "./phone";
import { SITE } from "./data";

// Normalise a local/intl phone into E.164 digits for wa.me (default LK +94).
// The rules live in `lib/phone.ts` so the booking form rejects, up front, exactly
// what this would otherwise turn into a dead wa.me link.
export function toWaNumber(phone: string, defaultCc = DEFAULT_CC): string {
  return toE164Digits(phone, defaultCc);
}

export function waLink(phone: string, message: string): string {
  return `https://wa.me/${toWaNumber(phone)}?text=${encodeURIComponent(message)}`;
}

type MsgCtx = {
  businessName: string;
  ownerName: string;
  petName: string;
  packageName: string;
  dateLabel: string; // human date
  timeLabel: string; // e.g. "10:00 AM"
  code: string;
};

// Every message shares one shape: a branded first line, a boxed detail block,
// then what happens next. Consistency is the point — the customer should be able
// to spot their booking details at a glance in whichever message they scroll to.
// `*bold*` is WhatsApp markup; keep the divider short so it can't wrap on a
// narrow phone and split into two ragged lines.
export const RULE = "━━━━━━━━━━━━━━━";
const header = (businessName: string) => `🐾 *${businessName}* 🐾`;

// The booking details block, identical in every message that carries it.
const details = (c: MsgCtx): string[] => [
  RULE,
  `📋 *Booking:*  ${c.code}`,
  `🧴 *Package:*  ${c.packageName}`,
  `📅 *Date:*  ${c.dateLabel}`,
  `⏰ *Time:*  ${c.timeLabel}`,
  RULE,
];

// Booking received — queued at creation (SRS: confirmation after booking).
export function bookingConfirmationBody(c: MsgCtx): string {
  return [
    header(c.businessName),
    ``,
    `Hi ${c.ownerName}! 👋`,
    `We've received your grooming booking for *${c.petName}* 🐶`,
    ``,
    ...details(c),
    ``,
    `⏳ Your slot is *pending confirmation* — we'll message you shortly to confirm.`,
    ``,
    `Thank you for choosing us! 🐾💕`,
  ].join("\n");
}

// Sent the moment the salon confirms the slot — the customer's booking went in
// as "pending confirmation", so this is the message that actually secures it.
export function appointmentConfirmedBody(c: MsgCtx): string {
  return [
    header(c.businessName),
    ``,
    `Good news ${c.ownerName}! ✅`,
    `*${c.petName}*'s grooming appointment is *confirmed*.`,
    ``,
    ...details(c),
    ``,
    `📍 Please arrive a few minutes early.`,
    `🔄 Need to reschedule? Just reply to this message.`,
    ``,
    `See you and ${c.petName} soon! 🐶💕`,
  ].join("\n");
}

// Sent after the appointment is marked Completed (SRS thank-you + feedback).
// The review links are the whole point of this message — a happy customer is
// never closer to leaving a review than right after pickup.
export function thankYouBody(
  c: Pick<MsgCtx, "businessName" | "ownerName" | "petName">
): string {
  return [
    `Thank you for visiting *${c.businessName}* today! 🐾💕`,
    ``,
    `We hope *${c.petName}* enjoyed the grooming session! 🐶✨`,
    ``,
    `We'd love to hear about your experience. Your feedback means a lot to us and helps us keep giving the best care to our furry friends. 💗`,
    ``,
    `⭐ *Leave us a Google Review:*`,
    SITE.googleReview,
    ``,
    `💙 *Share your feedback on Facebook:*`,
    SITE.facebook,
    ``,
    `Or simply reply to this message with your feedback 😊`,
    ``,
    `Thank you for choosing *${c.businessName}*! 🐾`,
    `See you & ${c.petName} again soon! 🐶💕`,
  ].join("\n");
}

// Sent when the groom is finished and both photos are captured. The photos
// themselves ride along as real attachments via the share sheet, so this text
// is deliberately caption-length — it becomes the caption on the image message.
export function groomingCompleteBody(
  c: Pick<MsgCtx, "businessName" | "ownerName" | "petName" | "packageName">
): string {
  return [
    header(c.businessName),
    ``,
    `Hi ${c.ownerName}! ${c.petName}'s grooming is all done ✨`,
    ``,
    `🧴 *Service:*  ${c.packageName}`,
    `📸 Here's *${c.petName}* before and after!`,
    ``,
    `Thank you for choosing us — we'd love your feedback, just reply here. 🐾💕`,
  ].join("\n");
}

// Fallback only: when a browser can't attach files to a share, the photos are
// linked instead so the message is still useful.
export function withPhotoLinks(body: string, beforeUrl: string, afterUrl: string): string {
  return [body, ``, `Before: ${beforeUrl}`, `After: ${afterUrl}`].join("\n");
}

export const NOTIFICATION_LABEL: Record<NotificationType, string> = {
  BOOKING_CONFIRMATION: "Booking received",
  APPOINTMENT_CONFIRMED: "Appointment confirmed",
  REMINDER: "Reminder",
  THANK_YOU: "Thank-you & feedback",
};
