// Which DAYS a customer may pick — the calendar's source of truth.
//
// `generateSlotGrid` answers "which times on this day?"; this answers the
// question before it: "is the salon even open that day, and is anything left?".
// Same Settings, same engine, same RELEASED_STATUSES as the booking APIs, so a
// day the calendar offers can never be one POST /api/bookings would refuse —
// and a day the admin closed in Settings can never look bookable.
import { prisma } from "./db";
import { dateOnly, toDateISO, addDaysISO, salonNow } from "./time";
import { getSettings, toBusinessRules, RELEASED_STATUSES } from "./settings";
import {
  buildDayTimeline,
  generateSlotGrid,
  isWorkingDay,
  type Interval,
} from "./booking-engine";

export type DayStatus = "past" | "closed" | "full" | "open";

export type DayAvailability = {
  dateISO: string;
  status: DayStatus;
  /** only when closed: a one-off holiday vs a weekday the salon never opens */
  reason?: "holiday" | "closed-day";
  /** bookable start times left — 0 unless the day is open */
  free: number;
};

export type RangeAvailability = {
  fromISO: string;
  todayISO: string;
  days: DayAvailability[];
  openTime: string;
  closeTime: string;
  /** the package the free counts were measured against, if one was asked for */
  packageKey?: string;
};

// A month at a time is all the calendar ever asks for; the cap only stops a
// crafted `days=99999` from walking years of dates.
const MAX_DAYS = 100;

export async function rangeDayAvailability(
  fromISO: string,
  days: number,
  packageKey?: string
): Promise<RangeAvailability> {
  const span = Math.min(Math.max(1, Math.floor(days) || 1), MAX_DAYS);
  const settings = await getSettings();
  const rules = toBusinessRules(settings);
  const { dateISO: todayISO, nowMin } = salonNow();
  const toISO = addDaysISO(fromISO, span - 1);

  // An unknown or retired package is not an error here — the calendar still has
  // opening days and holidays to show. It just falls back to counting free
  // slots rather than "does THIS service fit".
  const found = packageKey
    ? await prisma.package.findUnique({ where: { key: packageKey } })
    : null;
  const pkg = found?.active ? found : null;

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

  // One query, grouped in memory — a query per day would be a month of round trips.
  const byDay = new Map<string, Interval[]>();
  for (const r of rows) {
    const k = toDateISO(r.date);
    const list = byDay.get(k) ?? [];
    list.push({ start: r.startMin, end: r.endMin, gapMin: r.package.startGapMin });
    byDay.set(k, list);
  }

  const list: DayAvailability[] = Array.from({ length: span }, (_, i) => {
    const dateISO = addDaysISO(fromISO, i);
    const existing = byDay.get(dateISO) ?? [];

    // Past first: a closed day that has already gone is simply past. The
    // customer can't act on either, and two kinds of grey read as noise.
    if (dateISO < todayISO) return { dateISO, status: "past", free: 0 };

    if (!isWorkingDay(dateISO, rules)) {
      return {
        dateISO,
        status: "closed",
        // Which kind matters to the wording: "closed on 25 Dec" is news,
        // "we never open on Mondays" is a standing rule.
        reason: rules.holidays.includes(dateISO) ? "holiday" : "closed-day",
        free: 0,
      };
    }

    const dayNowMin = dateISO === todayISO ? nowMin : undefined;
    // With a package chosen, "free" means "this service still fits" — a 30-min
    // hole is no use to a 2-hour groom, so counting bare steps would show days
    // as open that the slot grid then reveals as fully booked.
    let free: number;
    // Nothing left BECAUSE the salon is booked out, or only because today's
    // remaining hours have run out? Labelling an empty evening "Full" tells the
    // customer the salon is busy when it simply closed for the day.
    let bookedOut: boolean;
    if (pkg) {
      const grid = generateSlotGrid({
        dateISO,
        durationMin: pkg.durationMin,
        gapMin: pkg.startGapMin,
        rules,
        existing,
        nowMin: dayNowMin,
        todayISO,
      });
      free = grid.filter((s) => !s.taken).length;
      bookedOut = grid.some((s) => s.reason === "booked");
    } else {
      const cells = buildDayTimeline({
        dateISO,
        rules,
        existing,
        nowMin: dayNowMin,
        todayISO,
      }).cells;
      free = cells.filter((c) => !c.full && !c.past).length;
      bookedOut = cells.some((c) => c.full);
    }

    if (free > 0) return { dateISO, status: "open", free };
    return { dateISO, status: bookedOut ? "full" : "past", free: 0 };
  });

  return {
    fromISO,
    todayISO,
    days: list,
    openTime: settings.openTime,
    closeTime: settings.closeTime,
    ...(pkg ? { packageKey: pkg.key } : {}),
  };
}
