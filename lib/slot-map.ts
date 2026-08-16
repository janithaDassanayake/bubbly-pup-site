// Slot occupancy for the admin "Slot Management" view — who is in which slot,
// and which slots are actually free. Reads the SAME business rules and the same
// "which statuses release a slot" rule as the public booking APIs, so the admin
// map can never disagree with what a customer is offered.
import { AppointmentStatus, type PetSpecies } from "@prisma/client";
import { prisma } from "./db";
import { formatPhone } from "./phone";
import { dateOnly, toDateISO, addDaysISO, salonNow } from "./time";
import { getSettings, toBusinessRules, RELEASED_STATUSES } from "./settings";
import {
  buildDayTimeline,
  to12h,
  toMinutes,
  type DayTimeline,
  type Interval,
} from "./booking-engine";
import { buildSlots, slotGrid, slotOccupancy } from "./booking-slots";

// Shaped as an Interval so the pure engine can work with it directly.
export type SlotBooking = Interval & {
  id: string;
  code: string;
  status: AppointmentStatus;
  customer: string;
  phone: string;
  pet: string;
  petSpecies: PetSpecies;
  pkg: string;
  durationMin: number;
};

/** One bookable start time — the unit the salon sells, one client each. */
export type DaySlot = {
  min: number; // 540
  label: string; // "09:00 AM"
  taken: boolean;
  reason?: "booked" | "passed";
  /** who holds it — more than one only if capacity was raised above 1 */
  bookings: SlotBooking[];
};

export type DaySlotMap = {
  dateISO: string;
  /** the six start times, each with its own capacity */
  slots: DaySlot[];
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
  pet: { select: { name: true, species: true } },
  package: { select: { name: true, startGapMin: true } },
} as const;

type ApptRow = {
  id: string;
  code: string;
  status: AppointmentStatus;
  startMin: number;
  endMin: number;
  durationMin: number;
  customer: { name: string | null; phone: string };
  pet: { name: string; species: PetSpecies };
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
  // No name is collected any more — the strip identifies a booking by its pet
  // (shown beside this) and falls back to the number rather than an empty gap.
  customer: a.customer.name || formatPhone(a.customer.phone),
  phone: a.customer.phone,
  pet: a.pet.name,
  petSpecies: a.pet.species,
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
      // Every service sees the same starts now — it takes one of the period's
      // two places whatever its length — but the overlay stays because the
      // admin still asks "where could I put this booking today?".
      const free = slotGrid({
        dateISO,
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

  // What the salon sells: six independent start times, one client each. Built
  // from the SAME grid the customer's form is served, so the two can't disagree.
  const grid = slotGrid({
    dateISO,
    rules,
    existing: active,
    nowMin,
    todayISO: now.dateISO,
  });
  const gridByStart = new Map(grid.map((s) => [toMinutes(s.value), s]));
  const slots: DaySlot[] = buildSlots(rules).map((min) => {
    const cell = gridByStart.get(min);
    return {
      min,
      label: to12h(min),
      taken: cell?.taken ?? true,
      reason: cell?.reason,
      bookings: active.filter((b) => b.start === min),
    };
  });

  return {
    dateISO,
    slots,
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
    const dayNowMin = dateISO === now.dateISO ? now.nowMin : undefined;
    // Closed/holiday still comes from the timeline — it owns those rules — but
    // the COUNTS are per booking period, so "4 free" on this strip means four
    // bookable start times, the same four the customer is offered. Counting
    // half-hour steps here would advertise times that can't be booked at all.
    const t = buildDayTimeline({
      dateISO,
      rules,
      existing,
      nowMin: dayNowMin,
      todayISO: now.dateISO,
    });
    const daySlots = buildSlots(rules);
    const counts = slotOccupancy(existing, rules);
    const grid = t.closed
      ? []
      : slotGrid({ dateISO, rules, existing, nowMin: dayNowMin, todayISO: now.dateISO });
    const full = daySlots.filter((m) => (counts.get(m) ?? 0) >= rules.capacity).length;
    // With one client per slot there is no half-taken state; kept at 0 so the
    // shape of DaySummary (and the strip that reads it) stays unchanged.
    const partial = 0;
    const gone = grid.filter((s) => s.reason === "passed").length;
    return {
      dateISO,
      closed: t.closed,
      reason: t.reason,
      // Everything below is counted in START TIMES, never in clock steps, so
      // this strip agrees with the customer's calendar.
      total: daySlots.length,
      full,
      partial,
      free: grid.filter((s) => !s.taken).length,
      gone,
      bookings: existing.length,
    };
  });
}
