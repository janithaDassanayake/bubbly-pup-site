"use server";

import { revalidatePath } from "next/cache";
import {
  AppointmentStatus,
  NotificationStatus,
  PaymentMethod,
  PaymentStatus,
  PetGender,
  PhotoKind,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/session";
import { isAdmin, isAssignable, isSuperUser, ROLE, type Role } from "@/lib/roles";
import { canTransition } from "@/lib/status";
import { getSettings, parseHolidays, toBusinessRules, RELEASED_STATUSES } from "@/lib/settings";
import { computeEndMin, toMinutes, to12h, validateBooking } from "@/lib/booking-engine";
import { salonNow, dateOnly, formatDateLabel } from "@/lib/time";
import {
  appointmentConfirmedBody,
  bookingConfirmationBody,
  groomingCompleteBody,
  thankYouBody,
  waLink,
  withPhotoLinks,
} from "@/lib/whatsapp";
import { isCloudApiConfigured, sendThankYou } from "@/lib/whatsapp-send";
import { phoneProblem, toStoredPhone } from "@/lib/phone";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { issueResetToken } from "@/lib/reset";
import { isMailConfigured, resetEmail, sendMail } from "@/lib/mailer";
import { requestOrigin, siteUrl } from "@/lib/site";

// `whatsapp` is returned when the owner should send the message with one tap
// (free wa.me fallback). `autoSent` is true when the Cloud API already sent it
// from the business number — no tap needed.
type Result = {
  ok: boolean;
  error?: string;
  // `href` carries the message text alone — the before/after photos are attached
  // as real files by the browser's share sheet. `hrefWithLinks` is the fallback
  // for browsers that can't share files, where linking beats sending nothing.
  whatsapp?: { notificationId: string; href: string; hrefWithLinks?: string };
  // Photo ids the client fetches to build the share-sheet attachments.
  photos?: { before?: string; after?: string };
  autoSent?: boolean;
};

async function guard() {
  const admin = await getCurrentAdmin();
  if (!admin) throw new Error("Unauthorized");
  return admin;
}

// Admin-level actions (creating/removing logins, business settings). The role is
// re-read from the DATABASE rather than trusted from the session claim: a claim is
// only as fresh as the login, and account management is the one place where a
// stale role would be worth exploiting. Hiding the UI is not a check.
async function guardAdminRole() {
  const admin = await guard();
  const row = await prisma.adminUser.findUnique({
    where: { id: admin.sub },
    select: { role: true },
  });
  if (!isAdmin(row)) throw new Error("Forbidden");
  return admin;
}

async function audit(
  adminId: string,
  action: string,
  entity: string,
  entityId: string,
  meta?: Prisma.InputJsonValue
) {
  await prisma.auditLog.create({
    data: { adminUserId: adminId, action, entity, entityId, ...(meta !== undefined ? { meta } : {}) },
  });
}

// Absolute base for photo links (from lib/site, shared with reset links). Only
// used by the fallback message — the normal path attaches the image files.

function buildWaLinks(
  notificationId: string,
  phone: string,
  body: string,
  beforeId?: string,
  afterId?: string
): NonNullable<Result["whatsapp"]> {
  const base = { notificationId, href: waLink(phone, body) };
  if (!beforeId || !afterId) return base;
  return {
    ...base,
    hrefWithLinks: waLink(
      phone,
      withPhotoLinks(body, `${siteUrl()}/p/${beforeId}`, `${siteUrl()}/p/${afterId}`)
    ),
  };
}

// Move an appointment along its lifecycle (SRS status flow). Enforces the
// allowed-transition matrix and fires side effects (thank-you queue on complete).
export async function changeStatus(
  id: string,
  to: AppointmentStatus,
  // Set when completing: what was actually taken at the counter. Without it the
  // price ESTIMATE is banked, which is only ever a guess — the groom may have
  // run short, or the customer paid part in cash.
  payment?: { amount: number; method: PaymentMethod }
): Promise<Result> {
  const admin = await guard();

  const appt = await prisma.appointment.findUnique({
    where: { id },
    include: { customer: true, pet: true, package: true, photos: true },
  });
  if (!appt) return { ok: false, error: "Appointment not found." };

  if (appt.status === to) return { ok: true };
  if (!canTransition(appt.status, to)) {
    return { ok: false, error: `Can't move from ${appt.status} to ${to}.` };
  }

  await prisma.appointment.update({ where: { id }, data: { status: to } });

  // Completing the visit queues the thank-you / feedback WhatsApp (SRS) and hands
  // the ready-to-send link back so the UI can open it immediately.
  let whatsapp: Result["whatsapp"];

  // Confirming the slot is the moment the customer is waiting on — their booking
  // went in as "pending confirmation", so tell them straight away.
  if (to === AppointmentStatus.CONFIRMED) {
    const settings = await getSettings();
    const note = await prisma.notification.create({
      data: {
        appointmentId: id,
        type: "APPOINTMENT_CONFIRMED",
        toPhone: appt.customer.phone,
        body: appointmentConfirmedBody({
          businessName: settings.businessName,
          ownerName: appt.customer.name,
          petName: appt.pet.name,
          packageName: appt.package.name,
          dateLabel: formatDateLabel(appt.date),
          timeLabel: to12h(appt.startMin),
          code: appt.code,
        }),
      },
    });
    await audit(admin.sub, "STATUS_CHANGE", "Appointment", id, { from: appt.status, to });
    revalidatePath("/admin", "layout");
    return {
      ok: true,
      whatsapp: { notificationId: note.id, href: waLink(note.toPhone, note.body) },
    };
  }
  if (to === AppointmentStatus.COMPLETED) {
    // "Paid & Completed" is one action: settle payment if not already recorded.
    // The admin normally types what was taken (and how) in the popup; the price
    // estimate is only the fallback for a caller that didn't supply one.
    const takings =
      payment && Number.isFinite(payment.amount) && payment.amount >= 0
        ? payment
        : null;
    const pay = await prisma.payment.findUnique({ where: { appointmentId: id } });
    if (takings || !pay || pay.status !== PaymentStatus.PAID) {
      const amount = takings ? takings.amount : pay?.amount || appt.priceEstimate;
      await prisma.payment.upsert({
        where: { appointmentId: id },
        update: {
          status: PaymentStatus.PAID,
          amount,
          method: takings?.method ?? undefined,
          paidDate: new Date(),
        },
        create: {
          appointmentId: id,
          status: PaymentStatus.PAID,
          amount,
          method: takings?.method,
          paidDate: new Date(),
        },
      });
    }

    const before = appt.photos.find((p) => p.kind === PhotoKind.BEFORE);
    const after = appt.photos.find((p) => p.kind === PhotoKind.AFTER);

    let note = await prisma.notification.findFirst({
      where: { appointmentId: id, type: "THANK_YOU" },
    });
    if (!note) {
      const settings = await getSettings();
      // With photos captured this is the "grooming complete" message the photos
      // are attached to; without them it stays the plain thank-you.
      const body =
        before && after
          ? groomingCompleteBody({
              businessName: settings.businessName,
              ownerName: appt.customer.name,
              petName: appt.pet.name,
              packageName: appt.package.name,
            })
          : thankYouBody({
              businessName: settings.businessName,
              ownerName: appt.customer.name,
              petName: appt.pet.name,
            });
      note = await prisma.notification.create({
        data: { appointmentId: id, type: "THANK_YOU", toPhone: appt.customer.phone, body },
      });
    }
    // If the Cloud API is set up, actually send it from our number automatically.
    // Otherwise hand back the one-tap wa.me link as a fallback.
    let autoSent = false;
    if (isCloudApiConfigured()) {
      const sent = await sendThankYou(note.toPhone, note.body, [appt.customer.name, appt.pet.name]);
      await prisma.notification.update({
        where: { id: note.id },
        data: sent.ok
          ? { status: "SENT", sentAt: new Date(), providerMsgId: sent.id, attempts: { increment: 1 } }
          : { status: "FAILED", error: sent.error, attempts: { increment: 1 } },
      });
      if (sent.ok) autoSent = true;
      else whatsapp = buildWaLinks(note.id, note.toPhone, note.body, before?.id, after?.id);
    } else {
      whatsapp = buildWaLinks(note.id, note.toPhone, note.body, before?.id, after?.id);
    }

    await audit(admin.sub, "STATUS_CHANGE", "Appointment", id, { from: appt.status, to });
    revalidatePath("/admin", "layout");
    return {
      ok: true,
      whatsapp,
      autoSent,
      photos: { before: before?.id, after: after?.id },
    };
  }

  await audit(admin.sub, "STATUS_CHANGE", "Appointment", id, { from: appt.status, to });
  revalidatePath("/admin", "layout");
  return { ok: true };
}


// ---------- customer contact details ----------

// Correcting a mistyped WhatsApp number is a recovery path, not a nicety: every
// message the salon sends goes to this one field, so until it's right the
// customer is unreachable and the booking is effectively lost. Staff can fix it —
// they're the ones holding the phone when the number bounces.
export async function updateCustomerContact(input: {
  id: string;
  name: string;
  phone: string;
  email: string;
}): Promise<{ ok: boolean; error?: string }> {
  const admin = await guard();

  const name = input.name.trim();
  const email = input.email.trim();
  if (!name) return { ok: false, error: "A name is required." };
  const phoneErr = phoneProblem(input.phone);
  if (phoneErr) return { ok: false, error: phoneErr };
  // Validate what was typed, store the canonical form.
  const phone = toStoredPhone(input.phone.trim());

  const before = await prisma.customer.findUnique({
    where: { id: input.id },
    select: { name: true, phone: true, email: true },
  });
  if (!before) return { ok: false, error: "That customer no longer exists." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: input.id },
        data: { name, phone, email: email || null },
      });
      // Messages already queued still carry the OLD number — re-point the ones
      // that haven't gone out, or the confirmation link keeps opening the dead
      // chat even after the number is fixed. Sent rows stay as they are: they're
      // the audit trail of what was actually sent, and where.
      if (before.phone !== phone) {
        await tx.notification.updateMany({
          where: {
            toPhone: before.phone,
            status: NotificationStatus.PENDING,
            appointment: { customerId: input.id },
          },
          data: { toPhone: phone },
        });
      }
    });
  } catch (e) {
    // `phone` is unique — the number may already belong to another customer.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return {
        ok: false,
        error: "Another customer already has that number. Search for them instead.",
      };
    }
    throw e;
  }

  await audit(admin.sub, "CUSTOMER_CONTACT_UPDATE", "Customer", input.id, {
    from: before.phone,
    to: phone,
  });
  revalidatePath("/admin", "layout");
  return { ok: true };
}

// ---------- manual booking (walk-ins & phone bookings) ----------

// Look up a customer by phone so the admin doesn't retype details for a repeat
// client — and so their existing pets can be picked instead of duplicated.
export async function findCustomerByPhone(phone: string): Promise<{
  ok: boolean;
  customer?: {
    id: string;
    name: string;
    email: string | null;
    pets: { id: string; name: string; breed: string | null; age: string | null }[];
  };
}> {
  await guard();
  const trimmed = phone.trim();
  if (trimmed.length < 6) return { ok: true };

  const customer = await prisma.customer.findUnique({
    // Look up by the stored form, not by what was typed — otherwise a repeat
    // client typed as "+94 76 …" misses the row saved as "076 …" and the admin
    // creates a duplicate customer instead of reusing their pets.
    where: { phone: toStoredPhone(trimmed) },
    select: {
      id: true,
      name: true,
      email: true,
      pets: { select: { id: true, name: true, breed: true, age: true }, orderBy: { name: "asc" } },
    },
  });
  return { ok: true, customer: customer ?? undefined };
}

export type NewAppointmentInput = {
  packageKey: string;
  addOnKeys: string[];
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  ownerName: string;
  ownerPhone: string;
  ownerEmail?: string;
  petId?: string; // reuse an existing pet…
  petName?: string; // …or create a new one
  petBreed?: string;
  petAge?: string;
  petGender?: PetGender;
  notes?: string;
  status: AppointmentStatus; // CONFIRMED for a booking taken by phone
  queueConfirmation: boolean; // compose the confirmation WhatsApp?
};

const bookingCode = () => `BP-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

class BookingError extends Error {}

// Create an appointment from the admin side. Deliberately runs the SAME
// transaction-level overlap check as the public API — an appointment booked over
// the phone must not be able to double-book a slot that the website protects.
export async function createAppointment(
  input: NewAppointmentInput
): Promise<{ ok: boolean; error?: string; code?: string; id?: string }> {
  const admin = await guard();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Pick a valid date." };
  if (!/^\d{2}:\d{2}$/.test(input.start)) return { ok: false, error: "Pick a time slot." };
  if (!input.ownerName.trim()) return { ok: false, error: "Customer name is required." };
  const phoneErr = phoneProblem(input.ownerPhone);
  if (phoneErr) return { ok: false, error: phoneErr };
  // One canonical value for the customer key AND the queued message.
  const ownerPhone = toStoredPhone(input.ownerPhone.trim());
  if (!input.petId && !input.petName?.trim()) return { ok: false, error: "Pet name is required." };
  // A new booking may only start in one of these states. Without this a crafted
  // call could create an appointment already COMPLETED — skipping payment,
  // grooming and the whole lifecycle.
  const ALLOWED_START: AppointmentStatus[] = [
    AppointmentStatus.PENDING_CONFIRMATION,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.ARRIVED,
  ];
  if (!ALLOWED_START.includes(input.status)) {
    return { ok: false, error: "Invalid starting status." };
  }

  const pkg = await prisma.package.findUnique({ where: { key: input.packageKey } });
  if (!pkg || !pkg.active) return { ok: false, error: "Pick a package or service." };

  const startMin = toMinutes(input.start);
  const durationMin = pkg.durationMin; // add-ons never change duration
  const endMin = computeEndMin(startMin, durationMin);

  const settings = await getSettings();
  const rules = toBusinessRules(settings);
  const now = salonNow();
  const nowMin = input.date === now.dateISO ? now.nowMin : undefined;

  const addOns = input.addOnKeys.length
    ? await prisma.addOn.findMany({ where: { key: { in: input.addOnKeys } } })
    : [];
  // Same rule as the public API: a standalone row carries the duration for a
  // visit with no package, not a price to add on top of the service.
  if (pkg.standalone && addOns.length === 0) {
    return { ok: false, error: "Pick at least one service for a booking without a package." };
  }
  const addOnTotal = addOns.reduce((s, a) => s + a.price, 0);
  const priceEstimate = pkg.standalone ? addOnTotal : pkg.price + addOnTotal;

  try {
    const appointment = await prisma.$transaction(async (tx) => {
      // Same per-date lock as the public API — an admin taking a phone booking
      // while a customer books online is exactly the race this closes.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.date}))`;

      const existing = await tx.appointment.findMany({
        where: { date: dateOnly(input.date), status: { notIn: RELEASED_STATUSES } },
        select: { startMin: true, endMin: true, package: { select: { startGapMin: true } } },
      });
      const check = validateBooking({
        dateISO: input.date,
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

      const customer = await tx.customer.upsert({
        where: { phone: ownerPhone },
        update: { name: input.ownerName.trim(), email: input.ownerEmail?.trim() || undefined },
        create: {
          name: input.ownerName.trim(),
          phone: ownerPhone,
          email: input.ownerEmail?.trim() || undefined,
        },
      });

      // Reuse the chosen pet when it really belongs to this customer; otherwise
      // create one, so a mistyped id can't attach someone else's dog.
      let petId = input.petId;
      if (petId) {
        const owned = await tx.pet.findFirst({
          where: { id: petId, customerId: customer.id },
          select: { id: true },
        });
        if (!owned) petId = undefined;
      }
      if (!petId) {
        const pet = await tx.pet.create({
          data: {
            name: (input.petName ?? "").trim(),
            breed: input.petBreed?.trim() || undefined,
            age: input.petAge?.trim() || undefined,
            gender: input.petGender ?? PetGender.UNKNOWN,
            customerId: customer.id,
          },
        });
        petId = pet.id;
      }

      const code = bookingCode();
      const petName =
        input.petName?.trim() ||
        (await tx.pet.findUnique({ where: { id: petId }, select: { name: true } }))?.name ||
        "your pet";

      return tx.appointment.create({
        data: {
          code,
          customerId: customer.id,
          petId,
          packageId: pkg.id,
          addOnKeys: input.addOnKeys,
          date: dateOnly(input.date),
          startMin,
          endMin,
          durationMin,
          status: input.status,
          priceEstimate,
          notes: input.notes?.trim() || undefined,
          payment: { create: {} },
          // Queued, not sent — the admin sends it with one tap from the
          // WhatsApp page, same as an online booking.
          ...(input.queueConfirmation
            ? {
                notifications: {
                  create: {
                    // A slot booked over the phone is already confirmed, so the
                    // customer must not be told it's "pending confirmation".
                    type:
                      input.status === AppointmentStatus.PENDING_CONFIRMATION
                        ? ("BOOKING_CONFIRMATION" as const)
                        : ("APPOINTMENT_CONFIRMED" as const),
                    toPhone: ownerPhone,
                    body: (input.status === AppointmentStatus.PENDING_CONFIRMATION
                      ? bookingConfirmationBody
                      : appointmentConfirmedBody)({
                      businessName: settings.businessName,
                      ownerName: input.ownerName.trim(),
                      petName,
                      packageName: pkg.name,
                      dateLabel: formatDateLabel(dateOnly(input.date)),
                      timeLabel: to12h(startMin),
                      code,
                    }),
                  },
                },
              }
            : {}),
        },
        select: { id: true, code: true },
      });
    });

    await audit(admin.sub, "APPOINTMENT_CREATE", "Appointment", appointment.id, {
      code: appointment.code,
      date: input.date,
      start: input.start,
      packageKey: input.packageKey,
      source: "admin",
    });
    revalidatePath("/admin", "layout");
    return { ok: true, code: appointment.code, id: appointment.id };
  } catch (err) {
    if (err instanceof BookingError) return { ok: false, error: err.message };
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "That reference already exists — please try again." };
    }
    console.error("Manual booking failed:", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

// Rebuild the before/after message for an already-completed appointment, so it
// can be re-sent after a page reload (the browser's in-memory attachments are
// gone by then and have to be fetched back from S3).
export async function completionMessage(id: string): Promise<Result> {
  await guard();
  const appt = await prisma.appointment.findUnique({
    where: { id },
    include: { customer: true, pet: true, package: true, photos: true },
  });
  if (!appt) return { ok: false, error: "Appointment not found." };

  const before = appt.photos.find((p) => p.kind === PhotoKind.BEFORE);
  const after = appt.photos.find((p) => p.kind === PhotoKind.AFTER);

  let note = await prisma.notification.findFirst({
    where: { appointmentId: id, type: "THANK_YOU" },
  });
  if (!note) {
    const settings = await getSettings();
    note = await prisma.notification.create({
      data: {
        appointmentId: id,
        type: "THANK_YOU",
        toPhone: appt.customer.phone,
        body: groomingCompleteBody({
          businessName: settings.businessName,
          ownerName: appt.customer.name,
          petName: appt.pet.name,
          packageName: appt.package.name,
        }),
      },
    });
  }

  return {
    ok: true,
    whatsapp: buildWaLinks(note.id, note.toPhone, note.body, before?.id, after?.id),
    photos: { before: before?.id, after: after?.id },
  };
}

// Record an in-salon payment and advance the appointment to PAID.
export async function recordPayment(
  id: string,
  amount: number,
  method: PaymentMethod
): Promise<Result> {
  const admin = await guard();
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: "Invalid amount." };

  const appt = await prisma.appointment.findUnique({ where: { id } });
  if (!appt) return { ok: false, error: "Appointment not found." };

  await prisma.$transaction([
    prisma.payment.upsert({
      where: { appointmentId: id },
      update: { amount, method, status: PaymentStatus.PAID, paidDate: new Date() },
      create: { appointmentId: id, amount, method, status: PaymentStatus.PAID, paidDate: new Date() },
    }),
    // Advance to PAID unless already past it in the flow.
    ...(appt.status === AppointmentStatus.GROOMING_STARTED ||
    appt.status === AppointmentStatus.GROOM_FINISHED ||
    appt.status === AppointmentStatus.ARRIVED
      ? [prisma.appointment.update({ where: { id }, data: { status: AppointmentStatus.PAID } })]
      : []),
  ]);

  await audit(admin.sub, "PAYMENT", "Appointment", id, { amount, method });
  revalidatePath("/admin", "layout");
  return { ok: true };
}

// Mark a queued WhatsApp message as sent (owner tapped the wa.me link).
export async function markNotificationSent(id: string): Promise<Result> {
  const admin = await guard();
  await prisma.notification.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } },
  });
  await audit(admin.sub, "WHATSAPP_SENT", "Notification", id);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

// Settings form (business hours, days, lead times, holidays).
export async function updateSettings(formData: FormData): Promise<void> {
  // Business hours, opening days and prices are the owner's alone.
  const admin = await guardAdminRole();
  const str = (k: string) => String(formData.get(k) ?? "");
  const num = (k: string, d: number) => {
    const n = Number(formData.get(k));
    return Number.isFinite(n) ? n : d;
  };
  const days = formData.getAll("workingDays").map((d) => Number(d)).filter((n) => !Number.isNaN(n));
  const holidays = parseHolidays(formData.getAll("holidays"));

  await prisma.settings.upsert({
    where: { id: 1 },
    update: {
      businessName: str("businessName") || undefined,
      openTime: str("openTime") || undefined,
      closeTime: str("closeTime") || undefined,
      workingDays: days.length ? days : undefined,
      holidays,
      slotStepMin: num("slotStepMin", 30),
      minLeadMinutes: num("minLeadMinutes", 60),
      // 0 or a negative would close the diary completely — clamp to at least 1.
      capacity: Math.max(1, num("capacity", 2)),
    },
    create: {
      id: 1,
      businessName: str("businessName") || "Bubbly Pup Pet Grooming",
      openTime: str("openTime") || "09:00",
      closeTime: str("closeTime") || "18:00",
      workingDays: days.length ? days : [1, 2, 3, 4, 5, 6, 0],
      holidays,
      slotStepMin: num("slotStepMin", 30),
      minLeadMinutes: num("minLeadMinutes", 60),
      capacity: Math.max(1, num("capacity", 2)),
    },
  });
  await audit(admin.sub, "SETTINGS_UPDATE", "Settings", "1");
  revalidatePath("/admin", "layout");
}

// Edit a package/service price + duration from Settings.
export async function updatePackage(formData: FormData): Promise<void> {
  // Pricing is owner-only, same as the rest of Settings.
  const admin = await guardAdminRole();
  const id = String(formData.get("id"));
  const price = Number(formData.get("price"));
  const durationMin = Number(formData.get("durationMin"));
  const startGapMin = Number(formData.get("startGapMin"));
  const active = formData.get("active") === "on";
  if (!id) return;

  // A standalone row prices nothing — a visit without a package is billed from
  // the services chosen (Add-ons & extras). Its price column isn't editable and
  // isn't trusted here either, so the same service can never end up with two
  // different prices in two tables.
  const target = await prisma.package.findUnique({
    where: { id },
    select: { standalone: true },
  });
  if (!target) return;

  await prisma.package.update({
    where: { id },
    data: {
      price:
        target.standalone || !Number.isFinite(price) ? undefined : price,
      durationMin: Number.isFinite(durationMin) ? durationMin : undefined,
      startGapMin:
        Number.isFinite(startGapMin) && startGapMin >= 0 ? startGapMin : undefined,
      active,
    },
  });
  await audit(admin.sub, "PACKAGE_UPDATE", "Package", id, { price, durationMin, active });
  revalidatePath("/admin", "layout");
  // The website reads these prices too — drop its cached render as well, or the
  // customer keeps seeing yesterday's price list.
  revalidatePath("/");
}

// The à-la-carte services behind the Spa Treatments and Trims, Cuts & Colour
// pickers. These live in their OWN table: "Colouring Only" (a package that
// carries the 30-minute duration for a colour-only visit) and "Pet Hair
// Colouring" (the service the customer ticks) are different rows, and editing
// the first never changed the second — which is why the website looked stuck.
export async function updateAddOn(formData: FormData): Promise<void> {
  const admin = await guardAdminRole();
  const id = String(formData.get("id"));
  const price = Number(formData.get("price"));
  const active = formData.get("active") === "on";
  if (!id) return;
  await prisma.addOn.update({
    where: { id },
    data: { price: Number.isFinite(price) ? price : undefined, active },
  });
  await audit(admin.sub, "ADDON_UPDATE", "AddOn", id, { price, active });
  revalidatePath("/admin", "layout");
  revalidatePath("/");
}



// ---------------------------------------------------------------------------
// Logins (Settings → Staff & admin logins).
//
// There is NO self-service registration anywhere in the app. A login exists only
// because an owner/admin created it here. Every action below goes through
// guardAdminRole(), so staff cannot reach them however they call them.
//
// The seeded OWNER account is protected: it can't be removed, demoted, or
// re-passworded from this table — otherwise an admin could lock the salon out or
// take over the owner's account, and the owner's own password would skip the
// current-password check it goes through under My Account.
// ---------------------------------------------------------------------------

export type LoginResult = {
  ok: boolean;
  error?: string;
  /** Fallback when no mail provider is set: the link to hand over. */
  link?: string;
  emailed?: boolean;
  emailError?: string;
};

const normaliseEmail = (v: string) => v.trim().toLowerCase();
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Create a login — staff, or another full admin who can manage logins too.
export async function createLogin(input: {
  name: string;
  email: string;
  password: string;
  role: string;
  requireChange?: boolean;
}): Promise<LoginResult> {
  const me = await guardAdminRole();
  const name = input.name.trim();
  const email = normaliseEmail(input.email);

  if (!name) return { ok: false, error: "Enter a name." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email address." };
  // Only admin/staff may be assigned — "owner" is not on the menu, so the
  // protected account can never be duplicated through the UI.
  if (!isAssignable(input.role)) return { ok: false, error: "Pick a role." };
  const problem = passwordProblem(input.password);
  if (problem) return { ok: false, error: problem };

  const clash = await prisma.adminUser.findUnique({ where: { email } });
  if (clash) return { ok: false, error: "That email already has a login." };

  const created = await prisma.adminUser.create({
    data: {
      name,
      email,
      role: input.role,
      passwordHash: await hashPassword(input.password),
      mustChangePassword: Boolean(input.requireChange),
    },
  });
  await audit(me.sub, "LOGIN_CREATE", "AdminUser", created.id, { email, role: input.role });
  revalidatePath("/admin/settings");
  return { ok: true };
}

// Promote staff to admin, or demote an admin to staff.
export async function setLoginRole(input: { id: string; role: string }): Promise<LoginResult> {
  const me = await guardAdminRole();
  if (!isAssignable(input.role)) return { ok: false, error: "Pick a role." };

  const target = await prisma.adminUser.findUnique({ where: { id: input.id } });
  if (!target) return { ok: false, error: "That login no longer exists." };
  if (isSuperUser(target)) return { ok: false, error: "The owner's role can't be changed." };
  // Self-demotion would silently strip your own access mid-session.
  if (target.id === me.sub) return { ok: false, error: "You can't change your own role." };

  await prisma.adminUser.update({ where: { id: target.id }, data: { role: input.role } });
  await audit(me.sub, "LOGIN_ROLE_CHANGE", "AdminUser", target.id, {
    from: target.role,
    to: input.role,
  });
  revalidatePath("/admin/settings");
  return { ok: true };
}

// Replace someone's password directly — the quickest fix when they're locked out
// and there's no email set up.
export async function setLoginPassword(input: {
  id: string;
  password: string;
  requireChange?: boolean;
}): Promise<LoginResult> {
  const me = await guardAdminRole();
  const target = await prisma.adminUser.findUnique({ where: { id: input.id } });
  if (!target) return { ok: false, error: "That login no longer exists." };
  if (isSuperUser(target)) {
    return {
      ok: false,
      error: "The owner's password changes under My Account, where the current one is required.",
    };
  }
  if (target.id === me.sub) {
    return { ok: false, error: "Change your own password under My Account." };
  }

  const problem = passwordProblem(input.password);
  if (problem) return { ok: false, error: problem };

  await prisma.adminUser.update({
    where: { id: target.id },
    data: {
      passwordHash: await hashPassword(input.password),
      mustChangePassword: Boolean(input.requireChange),
    },
  });
  // Any outstanding reset link for them is now pointless.
  await prisma.passwordResetToken.updateMany({
    where: { adminUserId: target.id, usedAt: null },
    data: { expiresAt: new Date() },
  });
  await audit(me.sub, "LOGIN_PASSWORD_SET", "AdminUser", target.id);
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function deleteLogin(id: string): Promise<LoginResult> {
  const me = await guardAdminRole();
  if (id === me.sub) return { ok: false, error: "You can't remove your own account." };

  const target = await prisma.adminUser.findUnique({ where: { id } });
  if (!target) return { ok: false, error: "That login no longer exists." };
  if (isSuperUser(target)) return { ok: false, error: "The owner account can't be removed." };

  await prisma.adminUser.delete({ where: { id } });
  await audit(me.sub, "LOGIN_DELETE", "AdminUser", id, { email: target.email, role: target.role });
  revalidatePath("/admin/settings");
  return { ok: true };
}

// Change YOUR OWN password — the one account action every role may take. The
// current password is required, so a borrowed unlocked screen can't be turned
// into a permanent takeover.
export async function changeMyPassword(input: {
  current: string;
  next: string;
}): Promise<LoginResult> {
  const admin = await guard();
  const me = await prisma.adminUser.findUnique({ where: { id: admin.sub } });
  if (!me) return { ok: false, error: "Your account no longer exists." };

  const ok = await verifyPassword(input.current, me.passwordHash);
  if (!ok) return { ok: false, error: "That's not your current password." };

  const problem = passwordProblem(input.next);
  if (problem) return { ok: false, error: problem };
  if (input.current === input.next) {
    return { ok: false, error: "Pick a password you haven't just used." };
  }

  await prisma.adminUser.update({
    where: { id: me.id },
    data: { passwordHash: await hashPassword(input.next), mustChangePassword: false },
  });
  await prisma.passwordResetToken.updateMany({
    where: { adminUserId: me.id, usedAt: null },
    data: { expiresAt: new Date() },
  });
  await audit(admin.sub, "PASSWORD_CHANGED", "AdminUser", me.id);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

// A reset link for someone else. Unlike the public form this may return the link
// itself — the caller already holds the whole portal, and it's what makes recovery
// work before any mail provider is configured.
export async function issueResetLink(id: string): Promise<LoginResult> {
  const me = await guardAdminRole();
  const target = await prisma.adminUser.findUnique({ where: { id } });
  if (!target) return { ok: false, error: "That login no longer exists." };

  const { raw } = await issueResetToken(target.id);
  const link = `${await requestOrigin()}/admin/reset/${raw}`;

  let emailed = false;
  let emailError: string | undefined;
  if (isMailConfigured()) {
    const { businessName } = await getSettings();
    const sent = await sendMail({ to: target.email, ...resetEmail(link, target.name, businessName) });
    emailed = sent.ok;
    emailError = sent.error;
  }

  await audit(me.sub, "PASSWORD_RESET_LINK_ISSUED", "AdminUser", target.id, { emailed });
  return { ok: true, link, emailed, emailError };
}
