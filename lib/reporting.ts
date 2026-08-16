// Appointment + revenue reporting over a day, a week or a month.
//
// One rule decides every number on the Reports page, and it is worth stating
// once here rather than re-deciding it per table:
//
//   • An appointment belongs to the day it was BOOKED FOR (`Appointment.date`),
//     not the day it was typed in. "What did we earn on Tuesday" is a question
//     about Tuesday's work — a Monday walk-in written up on Wednesday is still
//     Monday's.
//   • Revenue is MONEY THAT CHANGED HANDS: the settled `Payment.amount` of an
//     appointment whose payment is PAID. Anything still unpaid is counted
//     separately as expected, never mixed into revenue — otherwise a booking
//     nobody has paid for inflates the month.
//   • Cancellations and no-shows are counted, but not as appointments served.
//
// Both sources feed every figure. An online reservation and a walk-in are the
// same visit to the salon; `source` only ever SPLITS a total, it never filters
// one out.
import { AppointmentSource, AppointmentStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "./db";
import { addDaysISO, dateOnly, toDateISO } from "./time";

export type Period = "day" | "week" | "month" | "custom";

export const ALL_PERIODS: Period[] = ["day", "week", "month", "custom"];

export const PERIOD_LABEL: Record<Period, string> = {
  day: "Today",
  week: "This week",
  month: "This month",
  custom: "Custom range",
};

export const isPeriod = (v: string | undefined | null): v is Period =>
  v === "day" || v === "week" || v === "month" || v === "custom";

/**
 * A custom range is two dates the admin typed, so it is the one period that can
 * arrive nonsensical — backwards, or a decade wide. Both are fixed here rather
 * than rejected: the page still has to render something, and silently reading
 * "15 Aug → 01 Aug" as "01 Aug → 15 Aug" is what the admin meant. The cap is
 * what stops a typo'd year from pulling every appointment the salon has ever
 * taken into one in-memory fold.
 */
export const MAX_CUSTOM_DAYS = 366;

// ---------------------------------------------------------------- date maths
// All of it on "YYYY-MM-DD" strings via UTC-midnight Dates, the same way the
// rest of the app treats a @db.Date. Local-timezone Date arithmetic would shift
// a day on any server that isn't on UTC, and the salon's report would quietly
// start on the wrong Monday.

const utc = (dateISO: string) => new Date(`${dateISO}T00:00:00.000Z`);

/** 0 = Sunday … 6 = Saturday, for a "YYYY-MM-DD". */
export const weekdayOf = (dateISO: string) => utc(dateISO).getUTCDay();

/** The Monday of the week containing this date. Weeks run Mon–Sun. */
export function weekStartISO(dateISO: string): string {
  const dow = weekdayOf(dateISO); // Sunday is 0, and Sunday ENDS our week
  return addDaysISO(dateISO, -((dow + 6) % 7));
}

/** The first day of the month containing this date. */
export const monthStartISO = (dateISO: string) => `${dateISO.slice(0, 7)}-01`;

/** The last day of the month containing this date. */
export function monthEndISO(dateISO: string): string {
  const y = Number(dateISO.slice(0, 4));
  const m = Number(dateISO.slice(5, 7)); // 1-based
  // Day 0 of the NEXT month is the last day of this one — no leap-year table.
  return toDateISO(new Date(Date.UTC(y, m, 0)));
}

export type Range = {
  period: Period;
  /** The day the admin picked; the range is derived from it. */
  anchorISO: string;
  fromISO: string;
  toISO: string;
  /** Days in the range, inclusive — 1 for a single day, 7 for a week. */
  dayCount: number;
  /** "Tue, 12 Aug 2026" · "Mon 10 Aug – Sun 16 Aug 2026" · "August 2026" */
  label: string;
  /** The same period one step back / forward — drives the ‹ › buttons. */
  prevISO: string;
  nextISO: string;
};

const fmt = (dateISO: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(utc(dateISO));

const dayLabel = (dateISO: string) =>
  fmt(dateISO, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

const shortDay = (dateISO: string) =>
  fmt(dateISO, { weekday: "short", day: "numeric", month: "short" });

const monthLabel = (dateISO: string) => fmt(dateISO, { month: "long", year: "numeric" });

/** Whole days from → to, inclusive. Both are UTC midnights, so this is exact. */
const daysBetween = (fromISO: string, toISO: string) =>
  Math.round((utc(toISO).getTime() - utc(fromISO).getTime()) / 86_400_000) + 1;

/** What the admin typed into From/To, made safe to query. See MAX_CUSTOM_DAYS. */
export function normaliseCustom(
  fromRaw: string | undefined,
  toRaw: string | undefined,
  fallbackISO: string
): { fromISO: string; toISO: string } {
  const iso = (v: string | undefined) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? "") ? v! : "");
  // One end filled in is a range of that one day, not an open-ended scan.
  const a = iso(fromRaw) || iso(toRaw) || fallbackISO;
  const b = iso(toRaw) || iso(fromRaw) || fallbackISO;
  const fromISO = a <= b ? a : b; // typed backwards — read it the way they meant
  let toISO = a <= b ? b : a;
  if (daysBetween(fromISO, toISO) > MAX_CUSTOM_DAYS) {
    toISO = addDaysISO(fromISO, MAX_CUSTOM_DAYS - 1);
  }
  return { fromISO, toISO };
}

/**
 * Turn "the admin picked this period and this day" into real dates.
 *
 * `custom` is only read for period === "custom"; the other three derive their
 * range from the anchor alone, which is what lets the ‹ › buttons step them.
 */
export function resolveRange(
  period: Period,
  anchorISO: string,
  custom?: { fromISO: string; toISO: string }
): Range {
  if (period === "week") {
    const fromISO = weekStartISO(anchorISO);
    const toISO = addDaysISO(fromISO, 6);
    return {
      period,
      anchorISO,
      fromISO,
      toISO,
      dayCount: 7,
      label: `${shortDay(fromISO)} – ${dayLabel(toISO)}`,
      prevISO: addDaysISO(fromISO, -7),
      nextISO: addDaysISO(fromISO, 7),
    };
  }
  if (period === "month") {
    const fromISO = monthStartISO(anchorISO);
    const toISO = monthEndISO(anchorISO);
    return {
      period,
      anchorISO,
      fromISO,
      toISO,
      dayCount: daysBetween(fromISO, toISO),
      label: monthLabel(fromISO),
      // A day inside the neighbouring month — resolveRange snaps it to the 1st.
      prevISO: addDaysISO(fromISO, -1),
      nextISO: addDaysISO(toISO, 1),
    };
  }
  if (period === "custom") {
    const { fromISO, toISO } = normaliseCustom(custom?.fromISO, custom?.toISO, anchorISO);
    const span = daysBetween(fromISO, toISO);
    return {
      period,
      anchorISO: fromISO,
      fromISO,
      toISO,
      dayCount: span,
      label:
        fromISO === toISO
          ? dayLabel(fromISO)
          : `${shortDay(fromISO)} – ${dayLabel(toISO)}`,
      // ‹ › step a custom range by its own length, so "the previous 10 days" is
      // one tap rather than two dates retyped.
      prevISO: addDaysISO(fromISO, -span),
      nextISO: addDaysISO(fromISO, span),
    };
  }
  return {
    period,
    anchorISO,
    fromISO: anchorISO,
    toISO: anchorISO,
    dayCount: 1,
    label: dayLabel(anchorISO),
    prevISO: addDaysISO(anchorISO, -1),
    nextISO: addDaysISO(anchorISO, 1),
  };
}

/** Every date from → to inclusive. A day with nothing on it still gets a row. */
export function eachDayISO(fromISO: string, toISO: string): string[] {
  const days: string[] = [];
  for (let d = fromISO; d <= toISO; d = addDaysISO(d, 1)) days.push(d);
  return days;
}

// -------------------------------------------------------------- aggregation

export type SourceSplit = { online: number; walkIn: number };

export type Bucket = {
  /** Appointments served or still standing — cancellations excluded. */
  appointments: number;
  bySource: SourceSplit;
  /** Settled money only. */
  revenue: number;
  revenueBySource: SourceSplit;
  /** Booked but not settled — what is still owed for the period. */
  expected: number;
  paidCount: number;
  cancelled: number;
  noShow: number;
};

const emptyBucket = (): Bucket => ({
  appointments: 0,
  bySource: { online: 0, walkIn: 0 },
  revenue: 0,
  revenueBySource: { online: 0, walkIn: 0 },
  expected: 0,
  paidCount: 0,
  cancelled: 0,
  noShow: 0,
});

export type DayRow = Bucket & { dateISO: string; label: string };
export type WeekRow = Bucket & { fromISO: string; toISO: string; label: string };
export type MonthRow = Bucket & { month: string; label: string };
export type ServiceRow = { name: string; count: number; revenue: number };

export type Report = Range & {
  totals: Bucket;
  days: DayRow[];
  weeks: WeekRow[];
  months: MonthRow[];
  services: ServiceRow[];
  /** Best day in the range by revenue — null when nothing was earned. */
  bestDay: DayRow | null;
};

/**
 * How finely the trend charts are bucketed. A chart is only useful while the eye
 * can still separate one column from the next: 31 daily columns fit, 366 do not.
 * So a long range is drawn week by week and a very long one month by month —
 * the same folded buckets the tables below the charts already use, never a
 * different sum.
 */
export type Grain = "day" | "week" | "month";

export const GRAIN_LABEL: Record<Grain, string> = {
  day: "day by day",
  week: "week by week",
  month: "month by month",
};

export type TrendPoint = {
  key: string;
  /** Full name of the bucket — what the hover tooltip says. */
  label: string;
  /** Two or three characters for the x axis, where 31 full labels won't fit. */
  short: string;
  bucket: Bucket;
};

export const trendGrain = (dayCount: number): Grain =>
  dayCount <= 31 ? "day" : dayCount <= 186 ? "week" : "month";

export function trendPoints(r: Report): { grain: Grain; points: TrendPoint[] } {
  const grain = trendGrain(r.dayCount);
  if (grain === "month") {
    return {
      grain,
      points: r.months.map((m) => ({
        key: m.month,
        label: m.label,
        short: fmt(`${m.month}-01`, { month: "short" }),
        bucket: m,
      })),
    };
  }
  if (grain === "week") {
    return {
      grain,
      points: r.weeks.map((w) => ({
        key: w.fromISO,
        label: w.label,
        short: fmt(w.fromISO, { day: "numeric", month: "short" }),
        bucket: w,
      })),
    };
  }
  return {
    grain,
    points: r.days.map((d) => ({
      key: d.dateISO,
      label: d.label,
      // Just the day number: the month is already in the range label above the
      // chart, and repeating it 31 times is what makes an axis unreadable.
      short: String(Number(d.dateISO.slice(8, 10))),
      bucket: d,
    })),
  };
}

type ReportRow = {
  dateISO: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  paid: boolean;
  /** Settled amount once paid, otherwise what the visit is worth. */
  amount: number;
  packageName: string;
};

// A cancellation is not a customer the salon served, so it must not be counted
// as one — but it did happen, and the salon wants to see how often.
const RELEASED: AppointmentStatus[] = [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW];

function add(b: Bucket, a: ReportRow) {
  if (a.status === AppointmentStatus.CANCELLED) {
    b.cancelled++;
    return;
  }
  if (a.status === AppointmentStatus.NO_SHOW) {
    b.noShow++;
    return;
  }
  const walkIn = a.source === AppointmentSource.WALK_IN;
  b.appointments++;
  if (walkIn) b.bySource.walkIn++;
  else b.bySource.online++;

  if (a.paid) {
    b.revenue += a.amount;
    if (walkIn) b.revenueBySource.walkIn += a.amount;
    else b.revenueBySource.online += a.amount;
    b.paidCount++;
  } else {
    b.expected += a.amount;
  }
}

/** Fold a row into a map's bucket, creating the bucket on first sight. */
function into(map: Map<string, Bucket>, key: string, row: ReportRow) {
  let b = map.get(key);
  if (!b) {
    b = emptyBucket();
    map.set(key, b);
  }
  add(b, row);
}

/**
 * The whole Reports page from one pass over the range.
 *
 * Deliberately a single query plus in-memory grouping rather than several
 * `groupBy` round trips: the range is at most a month of one salon's
 * appointments, the price rule (`priceOverride ?? priceEstimate`, lib/price.ts)
 * is not something SQL can express without duplicating it, and every breakdown
 * has to agree with every other one — which they only do if they are folded
 * from the same rows.
 */
export async function buildReport(
  period: Period,
  anchorISO: string,
  custom?: { fromISO: string; toISO: string }
): Promise<Report> {
  const range = resolveRange(period, anchorISO, custom);
  const from = dateOnly(range.fromISO);
  const toExcl = dateOnly(addDaysISO(range.toISO, 1));

  const appts = await prisma.appointment.findMany({
    where: { date: { gte: from, lt: toExcl } },
    select: {
      date: true,
      status: true,
      source: true,
      priceEstimate: true,
      priceOverride: true,
      package: { select: { name: true } },
      payment: { select: { status: true, amount: true } },
    },
    orderBy: [{ date: "asc" }, { startMin: "asc" }],
  });

  const rows: ReportRow[] = appts.map((a) => {
    const paid = a.payment?.status === PaymentStatus.PAID;
    return {
      dateISO: toDateISO(a.date),
      status: a.status,
      source: a.source,
      paid,
      // Settled money is the truth once it exists; before that, what the visit
      // is quoted at — which is the override when the admin adjusted the price.
      amount: paid ? a.payment!.amount : a.priceOverride ?? a.priceEstimate,
      packageName: a.package.name,
    };
  });

  const totals = emptyBucket();
  const dayMap = new Map<string, Bucket>();
  const weekMap = new Map<string, Bucket>();
  const monthMap = new Map<string, Bucket>();
  const services = new Map<string, ServiceRow>();

  // Seed every day/week/month the range covers, so a quiet Wednesday shows as a
  // zero row instead of disappearing — a gap in a day-wise table reads as data
  // that wasn't loaded, not as a day nobody came in.
  for (const dateISO of eachDayISO(range.fromISO, range.toISO)) {
    dayMap.set(dateISO, emptyBucket());
    const wk = weekStartISO(dateISO);
    if (!weekMap.has(wk)) weekMap.set(wk, emptyBucket());
    const mo = dateISO.slice(0, 7);
    if (!monthMap.has(mo)) monthMap.set(mo, emptyBucket());
  }

  for (const r of rows) {
    add(totals, r);
    into(dayMap, r.dateISO, r);
    into(weekMap, weekStartISO(r.dateISO), r);
    into(monthMap, r.dateISO.slice(0, 7), r);

    if (!RELEASED.includes(r.status)) {
      const s = services.get(r.packageName) ?? { name: r.packageName, count: 0, revenue: 0 };
      s.count++;
      if (r.paid) s.revenue += r.amount;
      services.set(r.packageName, s);
    }
  }

  const days: DayRow[] = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateISO, b]) => ({
      ...b,
      dateISO,
      label: shortDay(dateISO),
    }));

  const weeks: WeekRow[] = [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fromISO, b]) => {
      const toISO = addDaysISO(fromISO, 6);
      return { ...b, fromISO, toISO, label: `${shortDay(fromISO)} – ${shortDay(toISO)}` };
    });

  const months: MonthRow[] = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, b]) => ({ ...b, month, label: monthLabel(`${month}-01`) }));

  const earning = days.filter((d) => d.revenue > 0);
  const bestDay = earning.length
    ? earning.reduce((best, d) => (d.revenue > best.revenue ? d : best))
    : null;

  return {
    ...range,
    totals,
    days,
    weeks,
    months,
    services: [...services.values()].sort((a, b) => b.count - a.count || b.revenue - a.revenue),
    bestDay,
  };
}
