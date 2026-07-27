import { AppointmentStatus } from "@prisma/client";
import { prisma } from "./db";
import { dateOnly } from "./time";
import { toMinutes, type BusinessRules, type Interval } from "./booking-engine";

// A slot is freed only when an appointment is CANCELLED or a NO_SHOW (SRS §9).
export const RELEASED_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
];

const DEFAULTS = {
  businessName: "Bubbly Pup Pet Grooming",
  openTime: "09:00",
  closeTime: "18:00",
  // The salon is open every day, Sunday included (0=Sun … 6=Sat).
  workingDays: [1, 2, 3, 4, 5, 6, 0],
  holidays: [] as string[],
  slotStepMin: 30,
  minLeadMinutes: 60,
  reminderLeadMinutes: 180,
  capacity: 2,
};

// Normalise the closed-days submitted by the settings form. The picker sends one
// `holidays` field per date; the split also tolerates a legacy comma-separated
// value so an old cached form can't wipe the list. Invalid entries are dropped
// rather than stored, deduped, and sorted for a predictable order.
//
// Pure and exported so it can be tested without a request context.
export function parseHolidays(values: readonly (string | File)[]): string[] {
  return [
    ...new Set(
      values
        .map((v) => (typeof v === "string" ? v : ""))
        .flatMap((v) => v.split(/[\s,]+/))
        .map((s) => s.trim())
        .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))
    ),
  ].sort();
}

export async function getSettings() {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  return s ?? { id: 1, updatedAt: new Date(), ...DEFAULTS };
}

export function toBusinessRules(s: {
  openTime: string;
  closeTime: string;
  workingDays: number[];
  holidays: string[];
  slotStepMin: number;
  minLeadMinutes: number;
  capacity?: number;
}): BusinessRules {
  return {
    openMin: toMinutes(s.openTime),
    closeMin: toMinutes(s.closeTime),
    workingDays: s.workingDays,
    holidays: s.holidays,
    slotStepMin: s.slotStepMin,
    minLeadMin: s.minLeadMinutes,
    // A missing/zero capacity would silently block the whole diary, so treat it
    // as the single-pet salon this started as rather than as "closed".
    capacity: Math.max(1, s.capacity ?? 1),
  };
}

// Booked intervals for a given day that still block the calendar (SRS §7).
// Each carries its package's start gap: the bath is free again after that, so
// the gap decides how soon the NEXT pet may start.
export async function bookedIntervals(dateISO: string): Promise<Interval[]> {
  const rows = await prisma.appointment.findMany({
    where: { date: dateOnly(dateISO), status: { notIn: RELEASED_STATUSES } },
    select: { startMin: true, endMin: true, package: { select: { startGapMin: true } } },
  });
  return rows.map((r) => ({
    start: r.startMin,
    end: r.endMin,
    gapMin: r.package.startGapMin,
  }));
}
