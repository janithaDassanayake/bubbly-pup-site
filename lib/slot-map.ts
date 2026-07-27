// Slot occupancy for the admin "Slot Management" view — who is in which slot,
// and which slots are actually free. Reads the SAME business rules and the same
// "which statuses release a slot" rule as the public booking APIs, so the admin
// map can never disagree with what a customer is offered.
import { AppointmentStatus } from "@prisma/client";
import { prisma } from "./db";
import { dateOnly, toDateISO, addDaysISO, salonNow } from "./time";
import { getSettings, toBusinessRules, RELEASED_STATUSES } from "./settings";
import {
  buildDayTimeline,
  generateSlotGrid,
  toMinutes,
  type DayTimeline,
  type Interval,
} from "./booking-engine";

// Shaped as an Interval so the pure engine can work with it directly.
export type SlotBooking = Interval & {
  id: string;
  code: string;
  status: AppointmentStatus;
  customer: string;
  phone: string;
  pet: string;
  pkg: string;
  durationMin: number;
};

export type DaySlotMap = {
  dateISO: string;
  timeline: DayTimeline<SlotBooking>;
  /** cancelled / no-show bookings — their time is free again (SRS §9) */
  released: SlotBooking[];
  counts: {
    total: number;
    free: number;
    /** one pet in, one place still sellable */
    partial: number;
    /** every place taken */
    full: number;
    gone: number;
    bookings: number;
  };
  /** set when ?pkg= is used: step starts where a booking of that length fits */
  fits: { name: string; durationMin: number; starts: Set<number> } | null;
  /** pets the salon can groom at once — what "full" means on this day */
  capacity: number;
  openTime: string;
  closeTime: string;
  slotStepMin: number;
  todayISO: string;
  nowMin?: number;
};

const APPT_SELECT = {
  id: true,
  code: true,
  status: true,
  startMin: true,
  endMin: true,
  durationMin: true,
  customer: { select: { name: true, phone: true } },
  pet: { select: { name: true } },
  package: { select: { name: true, startGapMin: true } },
} as const;

type ApptRow = {
  id: string;
  code: string;
  status: AppointmentStatus;
  startMin: number;
  endMin: number;
  durationMin: number;
  customer: { name: string; phone: string };
  pet: { name: string };
  package: { name: string; startGapMin: number };
};

const toBooking = (a: ApptRow): SlotBooking => ({
  id: a.id,
  code: a.code,
  status: a.status,
  start: a.startMin,
  end: a.endMin,
  gapMin: a.package.startGapMin,
  durationMin: a.durationMin,
  customer: a.customer.name,
  phone: a.customer.phone,
  pet: a.pet.name,
  pkg: a.package.name,
});

/** One day, step by step: which slots are booked (and by whom) and which are free. */
export async function daySlotMap(
  dateISO: string,
  opts: { packageKey?: string } = {}
): Promise<DaySlotMap> {
  const settings = await getSettings();
  const rules = toBusinessRules(settings);

  const rows = (await prisma.appointment.findMany({
    where: { date: dateOnly(dateISO) },
    select: APPT_SELECT,
    orderBy: { startMin: "asc" },
  })) as ApptRow[];

  const active = rows.filter((r) => !RELEASED_STATUSES.includes(r.status)).map(toBooking);
  const released = rows.filter((r) => RELEASED_STATUSES.includes(r.status)).map(toBooking);

  const now = salonNow();
  const nowMin = dateISO === now.dateISO ? now.nowMin : undefined;
  const timeline = buildDayTimeline({ dateISO, rules, existing: active, nowMin, todayISO: now.dateISO });

  // Three states now, not two: a step holding one pet is still sellable, so
  // counting it as "booked" would hide capacity the salon could sell.
  const full = timeline.cells.filter((c) => c.full).length;
  const partial = timeline.cells.filter((c) => !c.full && c.booked.length > 0).length;
  const gone = timeline.cells.filter((c) => c.booked.length === 0 && c.past).length;

  // Optional overlay: a 30-min gap is useless for a 2-hour groom, so the admin
  // can ask "where could THIS service actually start today?" — answered by the
  // very same function the booking form calls.
  let fits: DaySlotMap["fits"] = null;
  if (opts.packageKey) {
    const pkg = await prisma.package.findUnique({ where: { key: opts.packageKey } });
    if (pkg) {
      const free = generateSlotGrid({
        dateISO,
        durationMin: pkg.durationMin,
        gapMin: pkg.startGapMin,
        rules,
        existing: active,
        nowMin,
        todayISO: now.dateISO,
      }).filter((s) => !s.taken);
      fits = {
        name: pkg.name,
        durationMin: pkg.durationMin,
        starts: new Set(free.map((s) => toMinutes(s.value))),
      };
    }
  }

  return {
    dateISO,
    timeline,
    released,
    counts: {
      total: timeline.cells.length,
      free: timeline.cells.length - full - partial - gone,
      partial,
      full,
      gone,
      bookings: active.length,
    },
    fits,
    capacity: rules.capacity,
    openTime: settings.openTime,
    closeTime: settings.closeTime,
    slotStepMin: settings.slotStepMin,
    todayISO: now.dateISO,
    nowMin,
  };
}

export type DaySummary = {
  dateISO: string;
  closed: boolean;
  reason?: "holiday" | "closed-day";
  total: number;
  /** every place taken */
  full: number;
  /** part-filled — still sellable */
  partial: number;
  free: number;
  /** slots whose time has passed — a day with 0 free and some gone is over, not full */
  gone: number;
  bookings: number;
};

/** Free/booked counts for a window of days — the "which day is busy?" strip. */
export async function rangeSlotSummary(fromISO: string, days: number): Promise<DaySummary[]> {
  const settings = await getSettings();
  const rules = toBusinessRules(settings);
  const toISO = addDaysISO(fromISO, days - 1);

  const rows = await prisma.appointment.findMany({
    where: {
      date: { gte: dateOnly(fromISO), lte: dateOnly(toISO) },
      status: { notIn: RELEASED_STATUSES },
    },
    select: {
      date: true,
      startMin: true,
      endMin: true,
      package: { select: { startGapMin: true } },
    },
  });

  // One query, grouped in memory — a query per day would be 14 round trips.
  const byDay = new Map<string, Interval[]>();
  for (const r of rows) {
    const k = toDateISO(r.date);
    const list = byDay.get(k) ?? [];
    list.push({ start: r.startMin, end: r.endMin, gapMin: r.package.startGapMin });
    byDay.set(k, list);
  }

  const now = salonNow();
  return Array.from({ length: days }, (_, i) => {
    const dateISO = addDaysISO(fromISO, i);
    const existing = byDay.get(dateISO) ?? [];
    const t = buildDayTimeline({
      dateISO,
      rules,
      existing,
      nowMin: dateISO === now.dateISO ? now.nowMin : undefined,
      todayISO: now.dateISO,
    });
    const full = t.cells.filter((c) => c.full).length;
    const partial = t.cells.filter((c) => !c.full && c.booked.length > 0).length;
    const gone = t.cells.filter((c) => c.booked.length === 0 && c.past).length;
    return {
      dateISO,
      closed: t.closed,
      reason: t.reason,
      total: t.cells.length,
      full,
      partial,
      free: t.cells.length - full - partial - gone,
      gone,
      bookings: existing.length,
    };
  });
}
