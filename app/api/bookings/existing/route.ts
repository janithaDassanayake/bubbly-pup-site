// "Does this number already hold a reservation on this day?"
//
// Why this endpoint exists at all, when POST /api/bookings already enforces the
// rule: the customer's booking form opens WhatsApp *synchronously inside the
// click gesture* and saves in the background (see components/Booking.tsx — the
// mobile app only opens if nothing is awaited first). So a rejection from the
// POST arrives AFTER the customer has already sent us a message saying they
// booked. Telling them "you already have a reservation" at that point is too
// late to be useful and reads as a system that changed its mind.
//
// This is checked as soon as the date and the number are both known, so the
// button is already disabled and the reason already on screen before there is
// anything to tap. The POST stays the authority; this is what makes the rule
// land at a moment the customer can act on.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidPhone, toStoredPhone } from "@/lib/phone";
import { alreadyBookedMessage, bookedTimeLabel, sameDayWhere } from "@/lib/one-per-day";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dateISO = searchParams.get("date") ?? "";
  const phone = searchParams.get("phone") ?? "";

  // A malformed question gets "no" rather than an error: this is a courtesy
  // check in front of a form the customer is still filling in, and half-typed
  // input is the normal case, not a fault.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO) || !isValidPhone(phone)) {
    return NextResponse.json({ booked: false });
  }

  const held = await prisma.appointment.findFirst({
    where: sameDayWhere(toStoredPhone(phone), dateISO),
    select: { startMin: true },
    orderBy: { startMin: "asc" },
  });

  if (!held) return NextResponse.json({ booked: false });

  // Deliberately thin: the time, and nothing else. The caller had to know the
  // exact number and the exact date to get this far, and it is their own
  // booking they are being reminded of — but a pet's name or a booking code
  // would still be somebody's details handed to whoever asked, so they stay out.
  const timeLabel = bookedTimeLabel(held.startMin);
  return NextResponse.json({ booked: true, timeLabel, message: alreadyBookedMessage(timeLabel) });
}
