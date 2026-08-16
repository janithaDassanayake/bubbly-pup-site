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

// No owner name: the salon doesn't collect one any more, so every message is
// addressed to the pet's person by way of the pet. "Hi Coco's owner!" would be
// worse than no name at all.
//
// The pet emoji here is the house paw print, never 🐶 — the owner knows what
// they booked in, so it carries no information, and a cat owner reading "booking
// for *Mochi* 🐶" is the one thing it CAN get wrong.
type MsgCtx = {
  businessName: string;
  // The person's own name, when we have one. The forms stopped asking, so most
  // rows have none — but greeting the ones that DO by name costs nothing and
  // reads far warmer than the bare "Good news!" everyone else gets.
  ownerName?: string | null;
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

// " Nimali" when the row carries a name, "" when it doesn't — so the sentence
// reads naturally either way rather than leaving a gap or a stray comma.
const greet = (name?: string | null) => (name?.trim() ? ` ${name.trim()}` : "");

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
    `Hi! 👋`,
    `We've received your grooming booking for *${c.petName}* 🐾`,
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
    `Good news${greet(c.ownerName)}! ✅`,
    `*${c.petName}*'s grooming appointment is *confirmed*.`,
    ``,
    ...details(c),
    ``,
    `📍 Please arrive a few minutes early.`,
    // The one thing the customer has to DO before arriving, so it's bolded like
    // the booking details rather than buried in the closing lines.
    `🧺 *Kindly bring a towel for your pet.*`,
    `🔄 Need to reschedule? Just reply to this message.`,
    ``,
    `See you and ${c.petName} soon! 🐾💕`,
  ].join("\n");
}

// Sent after the appointment is marked Completed (SRS thank-you + feedback).
// The review links are the whole point of this message — a happy customer is
// never closer to leaving a review than right after pickup.
export function thankYouBody(
  c: Pick<MsgCtx, "businessName" | "petName">
): string {
  return [
    `Thank you for visiting *${c.businessName}* today! 🐾💕`,
    ``,
    `We hope *${c.petName}* enjoyed the grooming session! 🐾✨`,
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
    `See you & ${c.petName} again soon! 🐾💕`,
  ].join("\n");
}

// Sent when the groom is finished and both photos are captured. The photos
// themselves ride along as real attachments via the share sheet, so this text
// is deliberately caption-length — it becomes the caption on the image message.
export function groomingCompleteBody(
  c: Pick<MsgCtx, "businessName" | "petName" | "packageName">
): string {
  return [
    header(c.businessName),
    ``,
    `Hi! *${c.petName}*'s grooming is all done ✨`,
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
