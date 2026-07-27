import { NextResponse } from "next/server";
import { z } from "zod";
import { AppointmentStatus, PetGender, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSettings, toBusinessRules, RELEASED_STATUSES } from "@/lib/settings";
import { computeEndMin, toMinutes, to12h, validateBooking } from "@/lib/booking-engine";
import { salonNow, dateOnly, formatDateLabel } from "@/lib/time";
import { bookingConfirmationBody } from "@/lib/whatsapp";
import { isValidPhone, PHONE_HINT, toStoredPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

const BookingSchema = z.object({
  // Optional client-generated reference so the customer's WhatsApp deep link and
  // the saved appointment share the same code. Validated to a safe format.
  code: z.string().regex(/^BP-[A-Z0-9]{4,10}$/).optional(),
  packageKey: z.string().min(1),
  addOnKeys: z.array(z.string()).optional().default([]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  owner: z.object({
    name: z.string().min(1),
    // A bookable appointment we can't message is worse than no appointment —
    // the browser checks this too, but the browser is not a trust boundary.
    //
    // The transform normalises BEFORE anything downstream sees it, so the
    // customer upsert below keys on the canonical number rather than on however
    // this particular customer happened to type it today.
    phone: z
      .string()
      .refine((p) => isValidPhone(p), PHONE_HINT)
      .transform((p) => toStoredPhone(p)),
    email: z.string().email().optional().or(z.literal("")),
  }),
  pet: z.object({
    name: z.string().min(1),
    breed: z.string().optional(),
    age: z.string().optional(),
    gender: z.enum(["MALE", "FEMALE", "UNKNOWN"]).optional().default("UNKNOWN"),
    notes: z.string().optional(),
  }),
  notes: z.string().optional(),
});

const bookingCode = () => `BP-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = BookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the form.", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const data = parsed.data;

  const pkg = await prisma.package.findUnique({ where: { key: data.packageKey } });
  if (!pkg || !pkg.active) {
    return NextResponse.json({ error: "Unknown package." }, { status: 404 });
  }

  const startMin = toMinutes(data.start);
  const durationMin = pkg.durationMin; // add-ons never change duration (SRS §5)
  const endMin = computeEndMin(startMin, durationMin);

  const settings = await getSettings();
  const rules = toBusinessRules(settings);
  const now = salonNow();
  const nowMin = data.date === now.dateISO ? now.nowMin : undefined;

  // Price estimate = package price + selected services.
  //
  // A standalone row ("Colouring Only", "Trim Only", "Spa Treatment") is NOT a
  // package the customer buys — it only carries the duration for a visit with no
  // package. Its price used to be added on top of the service itself, so a
  // Rs. 5,000 colouring was quoted at Rs. 10,000. Now the chosen services are
  // the whole price, which is also why at least one is required: without one
  // there is nothing to bill, and no price to fall back to that anybody edits.
  const addOns = data.addOnKeys.length
    ? await prisma.addOn.findMany({ where: { key: { in: data.addOnKeys }, active: true } })
    : [];
  if (pkg.standalone && addOns.length === 0) {
    return NextResponse.json(
      { error: "Pick at least one service for a booking without a package." },
      { status: 400 }
    );
  }
  const addOnTotal = addOns.reduce((s, a) => s + a.price, 0);
  const priceEstimate = pkg.standalone ? addOnTotal : pkg.price + addOnTotal;

  try {
    const appointment = await prisma.$transaction(async (tx) => {
      // Re-check availability INSIDE the transaction to prevent a race (SRS §7).
      // Serialise bookings for THIS DATE only. Without it two customers can
      // both read "one place free" in the same instant and both save, putting
      // three dogs in a two-dog salon. Different dates never wait on each other,
      // and the lock is released when the transaction ends.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${data.date}))`;

      const existing = await tx.appointment.findMany({
        where: { date: dateOnly(data.date), status: { notIn: RELEASED_STATUSES } },
        select: { startMin: true, endMin: true, package: { select: { startGapMin: true } } },
      });
      const check = validateBooking({
        dateISO: data.date,
        startMin,
        durationMin,
        gapMin: pkg.startGapMin,
        rules,
        existing: existing.map((e) => ({
          start: e.startMin,
          end: e.endMin,
          gapMin: e.package.startGapMin,
        })),
        nowMin,
        todayISO: now.dateISO,
      });
      if (!check.ok) throw new BookingError(check.reason);

      // Reuse a customer by phone, otherwise create.
      const customer = await tx.customer.upsert({
        where: { phone: data.owner.phone },
        update: {
          name: data.owner.name,
          email: data.owner.email || undefined,
        },
        create: {
          name: data.owner.name,
          phone: data.owner.phone,
          email: data.owner.email || undefined,
        },
      });

      const pet = await tx.pet.create({
        data: {
          name: data.pet.name,
          breed: data.pet.breed,
          age: data.pet.age,
          gender: (data.pet.gender ?? "UNKNOWN") as PetGender,
          notes: data.pet.notes,
          customerId: customer.id,
        },
      });

      const code = data.code ?? bookingCode();
      // Booking-confirmation WhatsApp is composed & queued (SRS). The owner sends
      // it with one tap from the admin — free wa.me, no per-message billing.
      const confirmationBody = bookingConfirmationBody({
        businessName: settings.businessName,
        ownerName: data.owner.name,
        petName: data.pet.name,
        packageName: pkg.name,
        dateLabel: formatDateLabel(dateOnly(data.date)),
        timeLabel: to12h(startMin),
        code,
      });

      return tx.appointment.create({
        data: {
          code,
          customerId: customer.id,
          petId: pet.id,
          packageId: pkg.id,
          addOnKeys: data.addOnKeys,
          date: dateOnly(data.date),
          startMin,
          endMin,
          durationMin,
          status: AppointmentStatus.PENDING_CONFIRMATION,
          priceEstimate,
          notes: data.notes,
          payment: { create: {} },
          notifications: {
            create: {
              type: "BOOKING_CONFIRMATION",
              toPhone: data.owner.phone,
              body: confirmationBody,
            },
          },
        },
        select: { id: true, code: true, date: true, startMin: true, endMin: true },
      });
    });

    return NextResponse.json(
      {
        ok: true,
        booking: {
          code: appointment.code,
          date: data.date,
          start: data.start,
          durationMin,
          priceEstimate,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof BookingError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    // Unique-code collision (extremely rare) or DB error.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Please try again." }, { status: 409 });
    }
    console.error("Booking failed:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

class BookingError extends Error {}
