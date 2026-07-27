// Pure scheduling logic — no DB, no framework. Fully unit-testable.
// Implements SRS §5 (duration rules), §6 (start/end), §7 (overlap prevention).
//
// All times are handled as "minutes since midnight" to sidestep timezone math.
// Callers pass plain data (business hours, existing appointments) so this file
// stays a pure function library.

export type Interval = {
  start: number;
  end: number; // minutes since midnight
  /**
   * How long after THIS booking starts before the next pet may start.
   * One bath, and bathing comes first — see `startGapOk`. Absent = 0, which
   * makes every function below behave exactly as it did before gaps existed.
   */
  gapMin?: number;
};

export type BusinessRules = {
  openMin: number; // e.g. 540 = 09:00
  closeMin: number; // e.g. 1080 = 18:00
  workingDays: number[]; // 0=Sun … 6=Sat
  holidays: string[]; // ISO "YYYY-MM-DD"
  slotStepMin: number; // slot granularity, e.g. 30
  minLeadMin: number; // earliest a same-day slot may start from "now"
  /** how many grooms may run at the same time (salon has 2 places) */
  capacity: number;
};

// ---- time helpers ----
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// 12-hour display, e.g. "02:00 PM"
export function to12h(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
}

// ---- SRS §5: duration ----
// A booking is EITHER a package (add-ons don't extend it) OR one standalone
// service. The chosen "package" row already carries the correct duration, so
// duration resolution is simply the selected item's duration.
export function resolveDurationMin(pkg: { durationMin: number }): number {
  return pkg.durationMin;
}

// ---- SRS §6: end time ----
export function computeEndMin(startMin: number, durationMin: number): number {
  return startMin + durationMin;
}

// ---- SRS §7: overlap ----
// Half-open intervals [start, end): touching at an edge is NOT an overlap, so a
// 10:00–12:00 booking leaves 12:00 free.
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function hasConflict(candidate: Interval, existing: Interval[]): boolean {
  return existing.some((e) => overlaps(candidate, e));
}

// ---- capacity (SRS update: the salon grooms 2 pets at once) ----
//
// RULE 1 — never more than `capacity` grooms running at the same moment.
//
// The count only ever goes UP when a groom starts, so the busiest moment inside
// a proposed booking is either its own start or the start of something already
// booked inside it. Checking those few instants is enough; there's no need to
// walk the day minute by minute.
export function maxConcurrent(candidate: Interval, existing: Interval[]): number {
  const points = [candidate.start];
  for (const e of existing) {
    if (e.start > candidate.start && e.start < candidate.end) points.push(e.start);
  }
  let peak = 0;
  for (const p of points) {
    // Half-open: a groom ending exactly at `p` has left, so it doesn't count.
    const running = existing.filter((e) => e.start <= p && p < e.end).length;
    if (running > peak) peak = running;
  }
  return peak;
}

// RULE 2 — two pets may not START within the first one's gap.
//
// Both dogs would need the bath at the same time, and there's one bath. The gap
// belongs to whichever booking starts FIRST — that's the dog in the tub. It
// tracks time in the bath, not the length of the appointment, which is why the
// 2-hour trim package holds the tub no longer than the 1-hour wash.
export function startGapOk(candidate: Interval, existing: Interval[]): boolean {
  return existing.every((e) => {
    const gap = (e.start <= candidate.start ? e.gapMin : candidate.gapMin) ?? 0;
    if (gap <= 0) return true;
    return Math.abs(candidate.start - e.start) >= gap;
  });
}

/** Both capacity rules. The single question every screen and API asks. */
export function canBook(
  candidate: Interval,
  existing: Interval[],
  capacity: number
): boolean {
  if (maxConcurrent(candidate, existing) + 1 > capacity) return false;
  return startGapOk(candidate, existing);
}

// ---- calendar helpers ----
export function isWorkingDay(dateISO: string, rules: BusinessRules): boolean {
  if (rules.holidays.includes(dateISO)) return false;
  // Parse as UTC noon to avoid TZ day-shift.
  const dow = new Date(`${dateISO}T12:00:00Z`).getUTCDay();
  return rules.workingDays.includes(dow);
}

export type SlotArgs = {
  dateISO: string;
  durationMin: number;
  /** the gap the package being booked imposes on whoever comes after it */
  gapMin?: number;
  rules: BusinessRules;
  existing: Interval[];
  /** minutes-since-midnight "now" IF dateISO is today, else undefined */
  nowMin?: number;
  /** today in the salon's timezone — anything before it is unbookable */
  todayISO?: string;
};

/** A slot in the day's grid. `taken` = the time exists but can't be booked. */
export type SlotState = {
  value: string; // "14:00"
  taken: boolean;
  /** why it can't be booked — lets the UI say "Booked" vs "Too soon" */
  reason?: "booked" | "passed";
};

// The FULL grid for the day, marking which starts are unavailable rather than
// omitting them. Showing a crossed-out 10:00 tells the customer the salon is
// busy then; silently dropping it just looks like odd opening hours.
export function generateSlotGrid({
  dateISO,
  durationMin,
  gapMin,
  rules,
  existing,
  nowMin,
  todayISO,
}: SlotArgs): SlotState[] {
  // Nothing is bookable in the past — showing a whole greyed-out day is noise.
  if (todayISO && dateISO < todayISO) return [];
  if (!isWorkingDay(dateISO, rules)) return [];

  const grid: SlotState[] = [];
  const earliest =
    nowMin === undefined ? rules.openMin : Math.max(rules.openMin, nowMin + rules.minLeadMin);

  for (let start = rules.openMin; start + durationMin <= rules.closeMin; start += rules.slotStepMin) {
    const candidate: Interval = { start, end: start + durationMin, gapMin };
    if (!canBook(candidate, existing, rules.capacity)) {
      grid.push({ value: toHHMM(start), taken: true, reason: "booked" });
    } else if (start < earliest) {
      // Today's already-gone times: shown, but not offered.
      grid.push({ value: toHHMM(start), taken: true, reason: "passed" });
    } else {
      grid.push({ value: toHHMM(start), taken: false });
    }
  }
  return grid;
}

// Bookable start times only. Kept as the authority for anything that must not
// see unavailable slots.
export function generateSlots(args: SlotArgs): string[] {
  return generateSlotGrid(args)
    .filter((s) => !s.taken)
    .map((s) => s.value);
}

// ---- day occupancy (admin slot map) ----
// `generateSlotGrid` answers "where can a booking of length N start?" — the
// customer's question. This answers "what is the salon doing at 10:30?" — the
// admin's. Same rules, but stepped at raw slot granularity and annotated with
// WHICH booking occupies each step, so nothing has to be inferred from a list.
export type DayCell<T> = {
  startMin: number;
  endMin: number;
  /** bookings overlapping this step — up to `capacity` of them */
  booked: T[];
  /** every place taken for this step */
  full: boolean;
  /** the step is entirely in the past (only ever true for today) */
  past: boolean;
  /** "now" falls inside this step */
  current: boolean;
};

export type DayTimeline<T> = {
  closed: boolean;
  reason?: "holiday" | "closed-day";
  cells: DayCell<T>[];
  /** bookings reaching outside opening hours — no cell can show them in full */
  outside: T[];
};

export function buildDayTimeline<T extends Interval>({
  dateISO,
  rules,
  existing,
  nowMin,
  todayISO,
}: {
  dateISO: string;
  rules: BusinessRules;
  existing: T[];
  /** minutes-since-midnight "now" IF dateISO is today, else undefined */
  nowMin?: number;
  /** today in the salon's timezone — makes a whole past day read as gone, not free */
  todayISO?: string;
}): DayTimeline<T> {
  // A closed day has no grid, but bookings may still exist on it (hours changed
  // after the fact, or a holiday added later) — surface them instead of hiding.
  if (rules.holidays.includes(dateISO)) {
    return { closed: true, reason: "holiday", cells: [], outside: existing };
  }
  if (!isWorkingDay(dateISO, rules)) {
    return { closed: true, reason: "closed-day", cells: [], outside: existing };
  }

  const outside = existing.filter((e) => e.start < rules.openMin || e.end > rules.closeMin);
  // A non-positive step would loop forever — bad settings shouldn't hang a page.
  if (rules.slotStepMin <= 0) return { closed: false, cells: [], outside };

  // A date that's already gone has no free slots — only unbooked ones. Calling
  // them "free" would invite booking into the past.
  const dayGone = todayISO !== undefined && dateISO < todayISO;

  const cells: DayCell<T>[] = [];
  for (let start = rules.openMin; start + rules.slotStepMin <= rules.closeMin; start += rules.slotStepMin) {
    const end = start + rules.slotStepMin;
    const booked = existing.filter((e) => overlaps({ start, end }, e));
    cells.push({
      startMin: start,
      endMin: end,
      booked,
      // With two places, "has a booking" no longer means "unavailable" — the
      // admin needs to see 1-of-2 as sellable, not as busy.
      full: booked.length >= rules.capacity,
      past: dayGone || (nowMin !== undefined && nowMin >= end),
      current: nowMin !== undefined && nowMin >= start && nowMin < end,
    });
  }
  return { closed: false, cells, outside };
}

// Full validation for a concrete booking request (used server-side before save).
export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateBooking(args: {
  dateISO: string;
  startMin: number;
  durationMin: number;
  gapMin?: number;
  rules: BusinessRules;
  existing: Interval[];
  nowMin?: number;
  todayISO?: string;
}): ValidationResult {
  const { dateISO, startMin, durationMin, gapMin, rules, existing, nowMin, todayISO } = args;
  const endMin = computeEndMin(startMin, durationMin);

  // A past date never reaches the lead-time rule below, because `nowMin` is only
  // supplied for today — so without this it would validate clean. ISO dates
  // compare correctly as strings.
  if (todayISO && dateISO < todayISO) {
    return { ok: false, reason: "That date has already passed." };
  }
  if (!isWorkingDay(dateISO, rules)) {
    return { ok: false, reason: "We're closed on the selected date." };
  }
  if (startMin < rules.openMin || endMin > rules.closeMin) {
    return { ok: false, reason: "That time is outside business hours." };
  }
  if (nowMin !== undefined && startMin < nowMin + rules.minLeadMin) {
    return { ok: false, reason: "That time is too soon — please pick a later slot." };
  }
  const candidate: Interval = { start: startMin, end: endMin, gapMin };
  // Two separate reasons, two separate messages — "already booked" when the
  // salon is genuinely full, and something more useful when the time is only
  // blocked because another pet is going into the bath just then.
  if (maxConcurrent(candidate, existing) + 1 > rules.capacity) {
    return { ok: false, reason: "That time slot is already booked." };
  }
  if (!startGapOk(candidate, existing)) {
    return {
      ok: false,
      reason: "Another pet starts at that time — please pick the next slot.",
    };
  }
  return { ok: true };
}
