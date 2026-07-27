// The salon operates in Sri Lanka time; "today" and "now" for same-day slot
// rules must be computed in that zone regardless of server timezone.
export const SALON_TZ = "Asia/Colombo";

export function salonNow(): { dateISO: string; nowMin: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SALON_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const dateISO = `${get("year")}-${get("month")}-${get("day")}`;
  const nowMin = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  return { dateISO, nowMin };
}

// A UTC-midnight Date for a "YYYY-MM-DD" day — matches Postgres @db.Date storage.
export function dateOnly(dateISO: string): Date {
  return new Date(`${dateISO}T00:00:00.000Z`);
}

// "YYYY-MM-DD" for a @db.Date value (stored at UTC midnight — read back as UTC).
export function toDateISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// How far the salon's clock is ahead of UTC at a given instant, in ms. Read from
// the timezone database rather than hard-coded, so it stays right if the offset
// ever changes.
function salonOffsetMs(at: Date): number {
  // Whole seconds only: `formatToParts` has no millisecond field, so comparing a
  // formatted instant against one carrying milliseconds makes the offset short
  // by up to 999ms — enough to pull the first millisecond of the next day into
  // the range.
  const whole = new Date(Math.floor(at.getTime() / 1000) * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SALON_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(whole);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  );
  return asIfUtc - whole.getTime();
}

// The UTC instants that bracket a run of SALON days — for filtering timestamp
// columns (`createdAt`, `sentAt`) by the day the salon actually experienced.
// Filtering those in UTC would put anything before 05:30 local on the day before.
export function salonDayRangeUtc(fromISO?: string, toISO?: string) {
  const bound = (dateISO: string, endOfDay: boolean) => {
    const naive = Date.UTC(
      Number(dateISO.slice(0, 4)),
      Number(dateISO.slice(5, 7)) - 1,
      Number(dateISO.slice(8, 10)),
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0
    );
    // Offset is looked up at the naive instant, then applied — good enough for a
    // day boundary in any zone that isn't switching DST at midnight.
    return new Date(naive - salonOffsetMs(new Date(naive)));
  };
  const gte = fromISO ? bound(fromISO, false) : undefined;
  const lte = toISO ? bound(toISO, true) : undefined;
  return gte || lte ? { gte, lte } : undefined;
}

// A timestamp as the salon reads it — "13 Oct 2026, 02:30 PM" in Colombo time,
// not the server's UTC.
export function formatSalonDateTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: SALON_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

// Human date label, e.g. "Fri, 3 Jul 2026". Formatted in UTC to match storage.
export function formatDateLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

// Add whole days to a "YYYY-MM-DD" string, returns "YYYY-MM-DD".
export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
