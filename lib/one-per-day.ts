// One reservation per phone number per day.
//
// The phone number IS the customer's identity in this system (`Customer.phone`
// is UNIQUE — see lib/phone.ts), so "has this person already booked today?" is
// answerable without asking for a name, and it stays answerable when the same
// person books from a different device or a different browser.
//
// What this stops: the same customer holding two of the day's six slots, which
// on a salon that runs one bath is half the day gone to one household — usually
// not on purpose, but by rebooking instead of asking to move the first one.
// Rebooking also loses the salon the thread: two appointments arrive, nobody
// says which is real, and the owner rings to find out.
//
// This is a rule about the CUSTOMER's own reservation flow. The admin's forms
// deliberately do NOT enforce it: the salon is the party a blocked customer is
// told to contact, so the one account that must be able to make the second
// booking is the salon's own.
import { AppointmentStatus } from "@prisma/client";
import { to12h } from "./booking-engine";
import { dateOnly } from "./time";

/**
 * Appointments that make a customer "already booked" for the day.
 *
 * CANCELLED / NO_SHOW are excluded because their slot is released — a customer
 * whose booking fell through must be able to make another one, and being told
 * "you already have a reservation" about a booking that no longer exists would
 * be a dead end with no way out but a phone call.
 *
 * COMPLETED is excluded for the same reason in the other direction: the visit
 * happened and is over. Someone who was groomed this morning and wants a second
 * pet seen this afternoon does not "already have an appointment" — they had one.
 */
export const BLOCKING_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.PENDING_CONFIRMATION,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.NOT_SURE,
  AppointmentStatus.ARRIVED,
  AppointmentStatus.GROOMING_STARTED,
  AppointmentStatus.GROOM_FINISHED,
  AppointmentStatus.PAID,
];

/** What the customer is told, in one place so the API and the form can't drift. */
export function alreadyBookedMessage(timeLabel?: string | null): string {
  return (
    `You already have a reservation with us on this date${timeLabel ? ` at ${timeLabel}` : ""}. ` +
    `We take one appointment per phone number per day. ` +
    `If you'd like to change it, please contact us on WhatsApp.`
  );
}

/**
 * The Prisma `where` for "an appointment this phone still holds on this day".
 *
 * Shared by the pre-check the form runs and the check inside the booking
 * transaction, so the two can never disagree about what counts — a form that
 * says "you're fine" over an API that then refuses is worse than no check.
 */
export const sameDayWhere = (storedPhone: string, dateISO: string) => ({
  date: dateOnly(dateISO),
  status: { in: BLOCKING_STATUSES },
  customer: { phone: storedPhone },
});

/** Minutes-since-midnight to the label the customer sees ("12:00 PM"). */
export const bookedTimeLabel = (startMin: number) => to12h(startMin);
