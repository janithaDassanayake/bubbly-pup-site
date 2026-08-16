// Booking SLOTS — one client per exact start time, per
// new_new_Individual_Time_Slot_Booking_Update_README.
//
// Six slots a day, each its own capacity:
//
//   09:00   09:30   12:00   12:30   15:00   15:30
//
// Each is independent: booking 09:00 leaves 09:30 open, and 15:30 is the last
// start of the day. This REPLACED the shared-group rule that came before it —
// under that rule 09:00 and 09:30 drew on the same two places, so taking one
// could close the other. That grouping is gone; the only question a slot asks
// is "is this exact time already taken?".
//
// It also replaced, earlier still, a duration-and-overlap model in which a
// 2-hour groom starting at 09:30 blocked later starts. Durations are recorded
// on the appointment and drive the salon's day, but they no longer decide what
// a customer may book.
//
// Pure: no DB, no framework, minutes-since-midnight throughout, so the customer
// form, the public API and the admin's manual booking all share one rulebook.
import {
  isWorkingDay,
  toHHMM,
  type BusinessRules,
  type SlotState,
  type ValidationResult,
} from "./booking-engine";

/**
 * How far apart the day's slot pairs sit. The salon's service cycle is three
 * hours, so with the shop open 09:00–18:00 the pairs land at 09:00/09:30,
 * 12:00/12:30 and 15:00/15:30 — the six times in the spec — and the last start
 * it can offer is 15:30. Derived from Settings rather than hard-coded, so
 * changing the opening hours moves them.
 */
export const SLOT_CYCLE_MIN = 180;

/** Every start time the salon offers, in order. */
export function buildSlots(rules: BusinessRules): number[] {
  const slots: number[] = [];
  if (SLOT_CYCLE_MIN <= 0) return slots;

  for (let start = rules.openMin; start + SLOT_CYCLE_MIN <= rules.closeMin; start += SLOT_CYCLE_MIN) {
    slots.push(start);
    const second = start + rules.slotStepMin;
    if (rules.slotStepMin > 0 && second < start + SLOT_CYCLE_MIN) slots.push(second);
  }
  return slots;
}

/** Is this one of the start times the salon actually offers? */
export function isOfferedStart(startMin: number, rules: BusinessRules): boolean {
  return buildSlots(rules).includes(startMin);
}

/**
 * The service block a time falls in — 09:00–12:00, 12:00–15:00, 15:00–18:00 —
 * and how many dogs it can hold (its offered slots, one client each: two).
 *
 * This exists because the exact-time rule alone can be walked around by history.
 * Bookings made under earlier rules sit at times the grid no longer offers —
 * 11:00, 14:00, 14:30 — and an exact-minute count matches none of them, so a
 * block already holding two dogs looked completely empty to a customer. The
 * block cap catches those: whatever time a dog is booked at, it occupies its
 * block.
 */
export function blockFor(
  startMin: number,
  rules: BusinessRules
): { startMin: number; endMin: number; capacity: number } | null {
  if (SLOT_CYCLE_MIN <= 0) return null;
  for (let start = rules.openMin; start + SLOT_CYCLE_MIN <= rules.closeMin; start += SLOT_CYCLE_MIN) {
    const end = start + SLOT_CYCLE_MIN;
    if (startMin >= start && startMin < end) {
      const slotsHere = buildSlots(rules).filter((m) => m >= start && m < end).length;
      return { startMin: start, endMin: end, capacity: slotsHere * rules.capacity };
    }
  }
  return null;
}

/** Dogs booked in each service block, keyed by the block's start minute. */
export function blockOccupancy(
  existing: readonly { start: number }[],
  rules: BusinessRules
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const e of existing) {
    const block = blockFor(e.start, rules);
    if (!block) continue; // booked outside opening hours — holds no block place
    counts.set(block.startMin, (counts.get(block.startMin) ?? 0) + 1);
  }
  return counts;
}

/**
 * How many active bookings sit on each EXACT start time. `existing` must already
 * exclude the statuses that release a slot (CANCELLED / NO_SHOW) — a cancelled
 * booking must free its time again.
 *
 * Counted by exact minute, never by range: that is the whole point of this
 * model, and it is what keeps 09:30 open when 09:00 is taken.
 */
export function slotOccupancy(
  existing: readonly { start: number }[],
  rules: BusinessRules
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const s of buildSlots(rules)) counts.set(s, 0);

  for (const e of existing) {
    // A booking at a time no longer offered (moved by hand, or made under an
    // older grid) still occupies that minute — it just has no slot to close.
    counts.set(e.start, (counts.get(e.start) ?? 0) + 1);
  }
  return counts;
}

export type SlotArgs = {
  dateISO: string;
  rules: BusinessRules;
  existing: readonly { start: number }[];
  /** minutes-since-midnight "now" IF dateISO is today, else undefined */
  nowMin?: number;
  /** today in the SALON's timezone — never the customer's device clock */
  todayISO?: string;
};

/**
 * The day's slots, with unavailable ones MARKED rather than dropped — the spec
 * asks for a disabled "Booked"/"Time passed" over a vanishing time.
 *
 * A slot is available when BOTH hold (two independent rules):
 *   • its start has not already passed today, and
 *   • that exact time is not already booked.
 */
export function slotGrid({
  dateISO,
  rules,
  existing,
  nowMin,
  todayISO,
}: SlotArgs): SlotState[] {
  if (todayISO && dateISO < todayISO) return [];
  if (!isWorkingDay(dateISO, rules)) return [];

  const counts = slotOccupancy(existing, rules);
  const blocks = blockOccupancy(existing, rules);
  // Today only. `minLeadMin` is the salon's own cut-off; at 0 this is exactly
  // the spec's rule — a start strictly before now has passed.
  const earliest = nowMin === undefined ? -Infinity : nowMin + rules.minLeadMin;

  return buildSlots(rules).map((start) => {
    if (start < earliest) {
      return { value: toHHMM(start), taken: true, reason: "passed" as const };
    }
    // Two independent ways to be taken: this exact time is gone, or the
    // service block around it already holds all the dogs it can.
    const block = blockFor(start, rules);
    const blockFull =
      block !== null && (blocks.get(block.startMin) ?? 0) >= block.capacity;
    if ((counts.get(start) ?? 0) >= rules.capacity || blockFull) {
      return { value: toHHMM(start), taken: true, reason: "booked" as const };
    }
    return { value: toHHMM(start), taken: false };
  });
}

/** Bookable start times only. */
export function freeSlots(args: SlotArgs): string[] {
  return slotGrid(args)
    .filter((s) => !s.taken)
    .map((s) => s.value);
}

/**
 * The authority every write goes through. Re-run server-side inside the booking
 * transaction: the customer may have left the page open while the clock moved,
 * or someone else may have taken the slot in the meantime.
 */
export function validateSlotBooking(args: {
  dateISO: string;
  startMin: number;
  rules: BusinessRules;
  existing: readonly { start: number }[];
  nowMin?: number;
  todayISO?: string;
}): ValidationResult {
  const { dateISO, startMin, rules, existing, nowMin, todayISO } = args;

  // ISO dates compare correctly as strings. `nowMin` is only supplied for today,
  // so without this a past date would never reach the time checks below.
  if (todayISO && dateISO < todayISO) {
    return { ok: false, reason: "That date has already passed." };
  }
  if (!isWorkingDay(dateISO, rules)) {
    return { ok: false, reason: "We're closed on the selected date." };
  }
  if (!isOfferedStart(startMin, rules)) {
    return { ok: false, reason: "Please choose one of the available start times." };
  }

  // Rule 1 — the start must not already have passed today.
  if (nowMin !== undefined && startMin < nowMin + rules.minLeadMin) {
    return {
      ok: false,
      reason: "This booking time has already passed. Please select another available time.",
    };
  }

  // Rule 2 — that exact time must still be free.
  if ((slotOccupancy(existing, rules).get(startMin) ?? 0) >= rules.capacity) {
    return {
      ok: false,
      reason: "This time slot has already been booked. Please select another available time.",
    };
  }

  // Rule 3 — the service block around it must still have room. Catches dogs
  // booked at times the grid no longer offers, which rule 2 can't see.
  const block = blockFor(startMin, rules);
  if (block && (blockOccupancy(existing, rules).get(block.startMin) ?? 0) >= block.capacity) {
    return {
      ok: false,
      reason: "This part of the day is already fully booked. Please select another time.",
    };
  }

  return { ok: true };
}
