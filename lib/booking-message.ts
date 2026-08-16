// The message the CUSTOMER sends to the salon when they book. It's the one
// message the salon reads rather than writes, so it carries everything needed to
// act on the booking without opening the portal.
//
// Pure and separate from the form so it can be rendered and checked without a
// browser — same reason `booking-engine` is pure.
import { formatLKR, priceToNumber, SITE } from "./data";
import { formatPhone } from "./phone";
import { formatDateLabel } from "./time";
import { RULE } from "./whatsapp";

export type ReservationInput = {
  code?: string; // BP-XXXXXX, when the form generated one
  isSingle: boolean; // à-la-carte services rather than a package
  packageLabel: string;
  addOns: { label: string; price: string }[];
  dateISO: string; // YYYY-MM-DD
  slotLabel: string; // "09:00 AM"
  ownerPhone: string;
  petType: string; // "Dog" | "Cat"
  petName: string;
  breed: string; // dogs only — empty for a cat
  aggressive: string; // "Yes" | "No"
  notes: string;
};

export function reservationRequestBody(m: ReservationInput): string {
  // The customer picks an ISO date; send it the way a person reads it.
  const dateLabel = m.dateISO
    ? formatDateLabel(new Date(`${m.dateISO}T00:00:00.000Z`))
    : m.dateISO;

  const lines = [
    "🐾 *New Grooming Reservation* 🐾",
    `_${SITE.name}_`,
    "",
    ...(m.code ? [`📋 *Booking Ref:* ${m.code}`, ""] : []),
    RULE,
    m.isSingle
      ? "🧴 *Booking:*  Single service (no package)"
      : `🧴 *Package:*  ${m.packageLabel}`,
    `📅 *Date:*  ${dateLabel}`,
    `⏰ *Time:*  ${m.slotLabel}`,
    RULE,
  ];

  if (m.addOns.length) {
    lines.push("", m.isSingle ? "✨ *Services*" : "➕ *Add-ons*");
    m.addOns.forEach((a) => lines.push(`   • ${a.label} — ${a.price}`));
    const total = m.addOns.reduce((s, a) => s + priceToNumber(a.price), 0);
    lines.push(
      m.isSingle
        ? `   *Total: ${formatLKR(total)}*`
        : `   _Add-ons subtotal: ${formatLKR(total)}_`
    );
  }

  const isCat = m.petType === "Cat";
  lines.push(
    "",
    "👤 *Owner*",
    `   • WhatsApp:  ${formatPhone(m.ownerPhone)}`,
    "",
    `${isCat ? "🐱" : "🐶"} *${m.petType || "Pet"}*`,
    `   • Name:  ${m.petName}`,
    // Cats are booked without a breed. An empty "Breed:" line would read as a
    // detail the customer forgot rather than one that doesn't apply to them.
    ...(m.breed ? [`   • Breed:  ${m.breed}`] : []),
    // Flagged, not buried in the list — the groomer plans the session around it.
    m.aggressive === "Yes"
      ? "   • Aggressive:  *YES* ⚠️ _(owner accepted the grooming conditions)_"
      : `   • Aggressive:  ${m.aggressive || "No"}`
  );

  if (m.notes.trim()) lines.push("", `📝 *Notes:*  ${m.notes.trim()}`);

  // No admin deep link here. This message is composed on the CUSTOMER's phone and
  // sent from their WhatsApp, so anything in it is theirs to read and forward —
  // an /admin URL has no business in it. The booking ref above is enough: the
  // salon pastes it into the portal search to open the same appointment.
  lines.push("", "Please confirm my appointment. Thank you! 💕");
  return lines.join("\n");
}
