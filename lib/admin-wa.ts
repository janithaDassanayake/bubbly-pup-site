// Pre-composed WhatsApp links for the admin status buttons.
//
// Why compose the message BEFORE the button is clicked: on mobile a
// `whatsapp://` link only opens if the navigation happens inside the click
// gesture. Waiting for the server action to return first loses that gesture and
// the app silently refuses to open — the same constraint the customer booking
// form works around by opening WhatsApp first and saving in the background.
//
// So the row renders knowing what it would say, the tap opens WhatsApp instantly,
// and the status change runs behind it. The server still composes and logs the
// authoritative Notification row; this is only what the phone needs up front.
import { AppointmentStatus } from "@prisma/client";
import { appointmentConfirmedBody, thankYouBody, waLink } from "./whatsapp";
import { formatDateLabel } from "./time";
import { to12h } from "./booking-engine";

export type ApptForWa = {
  code: string;
  date: Date;
  startMin: number;
  customer: { name: string; phone: string };
  pet: { name: string };
  package: { name: string };
};

export type WaPreview = Partial<Record<AppointmentStatus, string>>;

export function waPreviews(a: ApptForWa, businessName: string): WaPreview {
  return {
    CONFIRMED: waLink(
      a.customer.phone,
      appointmentConfirmedBody({
        businessName,
        ownerName: a.customer.name,
        petName: a.pet.name,
        packageName: a.package.name,
        dateLabel: formatDateLabel(a.date),
        timeLabel: to12h(a.startMin),
        code: a.code,
      })
    ),
    COMPLETED: waLink(
      a.customer.phone,
      thankYouBody({ businessName, ownerName: a.customer.name, petName: a.pet.name })
    ),
  };
}
