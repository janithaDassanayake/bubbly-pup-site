"use client";
// The customer's day picker.
//
// It replaces <input type="date">, which can only clamp a range: a holiday the
// admin set in Settings, a weekday the salon never opens and a fully-booked
// Saturday all looked identical and invitingly bookable, and the customer only
// found out after picking the day and meeting an empty slot list. Here every
// day carries its real state, read from the same rules the booking API
// validates against (`/api/availability/days` → `lib/day-availability.ts` →
// the same engine as the slot grid). Closed is shown, never hidden — a day
// crossed out as "Closed" answers the question; a day that silently refuses
// bookings just looks broken.
import { useEffect, useMemo, useState } from "react";
import styles from "./Booking.module.css";

export type DayStatus = "past" | "closed" | "full" | "open";

type DayInfo = {
  dateISO: string;
  status: DayStatus;
  reason?: "holiday" | "closed-day";
  free: number;
};

// Everything is formatted in UTC: the ISO strings are salon days, not instants,
// so letting the browser's zone touch them would shift the labels by a day.
const MONTH_LABEL = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});
const FULL_DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
});
const SHORT_DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long" });

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const utc = (dateISO: string) => new Date(`${dateISO}T12:00:00Z`);
const ymOf = (dateISO: string) => dateISO.slice(0, 7);
const firstOf = (ym: string) => `${ym}-01`;

const shiftMonth = (ym: string, n: number) =>
  new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1))
    .toISOString()
    .slice(0, 7);

const daysInMonth = (ym: string) =>
  new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();

const dayISO = (ym: string, day: number) => `${ym}-${String(day).padStart(2, "0")}`;

export default function BookingCalendar({
  value,
  onChange,
  todayISO,
  packageKey,
  monthsAhead = 3,
}: {
  value: string;
  onChange: (dateISO: string) => void;
  todayISO: string;
  /** free counts are measured against this service when set */
  packageKey: string | null;
  /** how far ahead the customer may browse */
  monthsAhead?: number;
}) {
  const thisMonth = ymOf(todayISO);
  const lastMonth = shiftMonth(thisMonth, monthsAhead);

  const [ym, setYm] = useState(() => (value ? ymOf(value) : thisMonth));
  const [info, setInfo] = useState<Record<string, DayInfo> | null>(null);
  // Starts true: until the first answer lands every day would otherwise look
  // open and tappable, and a closed day is exactly what must not be tapped.
  const [loading, setLoading] = useState(true);

  // Follow the form: a date restored or set elsewhere should open its month.
  useEffect(() => {
    if (value) setYm(ymOf(value));
  }, [value]);

  // One request per visible month, refreshed when the package changes — a
  // 2-hour groom fills days a 1-hour wash still fits into.
  useEffect(() => {
    const span = daysInMonth(ym);
    const qs = new URLSearchParams({ from: firstOf(ym), days: String(span) });
    if (packageKey) qs.set("packageKey", packageKey);

    let cancelled = false;
    setLoading(true);
    fetch(`/api/availability/days?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { days: DayInfo[] }) => {
        if (cancelled) return;
        const map: Record<string, DayInfo> = {};
        for (const d of data.days ?? []) map[d.dateISO] = d;
        setInfo(map);
      })
      // A failed lookup must not lock the customer out of booking: the days
      // fall back to plain selectable, and the server still validates.
      .catch(() => !cancelled && setInfo(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [ym, packageKey]);

  const cells = useMemo(() => {
    const total = daysInMonth(ym);
    return Array.from({ length: total }, (_, i) => {
      const dateISO = dayISO(ym, i + 1);
      const d = info?.[dateISO];
      const status: DayStatus = d?.status ?? (dateISO < todayISO ? "past" : "open");
      return { dateISO, day: i + 1, status, reason: d?.reason, free: d?.free ?? 0 };
    });
  }, [ym, info, todayISO]);

  // Lead-in blanks so the 1st lands under its weekday.
  const blanks = utc(firstOf(ym)).getUTCDay();

  // Upcoming closures worth spelling out. A one-off holiday is news; a weekday
  // the salon never opens is a standing rule, so it's said once, not per date.
  const closures = cells.filter((c) => c.status === "closed" && c.dateISO >= todayISO);
  const holidays = closures.filter((c) => c.reason === "holiday");
  const offDays = [
    ...new Set(closures.filter((c) => c.reason === "closed-day").map((c) => WEEKDAY.format(utc(c.dateISO)))),
  ];

  const selected = value ? info?.[value] : undefined;
  const canPrev = ym > thisMonth;
  const canNext = ym < lastMonth;

  return (
    <div className={styles.cal}>
      <div className={styles.calHead}>
        <button
          type="button"
          className={styles.calNav}
          onClick={() => setYm(shiftMonth(ym, -1))}
          disabled={!canPrev}
          aria-label="Previous month"
        >
          ‹
        </button>
        <strong className={styles.calMonth}>{MONTH_LABEL.format(utc(firstOf(ym)))}</strong>
        <button
          type="button"
          className={styles.calNav}
          onClick={() => setYm(shiftMonth(ym, 1))}
          disabled={!canNext}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className={styles.calDow} aria-hidden="true">
        {DOW.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div
        className={`${styles.calGrid} ${loading ? styles.calLoading : ""}`}
        role="group"
        aria-label="Choose an appointment date"
        aria-busy={loading}
      >
        {Array.from({ length: blanks }, (_, i) => (
          <span key={`b${i}`} className={styles.calBlank} />
        ))}
        {cells.map((c) => {
          const isSelected = c.dateISO === value;
          const isToday = c.dateISO === todayISO;
          const disabled = c.status !== "open";
          // "3 left" is a nudge worth showing; "12 left" is just clutter.
          const tag =
            c.status === "closed"
              ? "Closed"
              : c.status === "full"
              ? "Full"
              : // Today, once the last bookable time has gone. Other past days
              // need no label — the date alone says it.
              c.status === "past"
              ? isToday
                ? "Over"
                : ""
              : c.free > 0 && c.free <= 3
              ? `${c.free} left`
              : "";
          const cls = [
            styles.calDay,
            styles[`calDay_${c.status}`],
            isSelected ? styles.calDayOn : "",
            isToday ? styles.calToday : "",
            c.status === "open" && c.free > 0 && c.free <= 3 ? styles.calDayLow : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={c.dateISO}
              type="button"
              className={cls}
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={`${FULL_DAY.format(utc(c.dateISO))}${
                c.status === "closed"
                  ? " — we're closed"
                  : c.status === "full"
                  ? " — fully booked"
                  : c.status === "past"
                  ? isToday
                    ? " — no times left today"
                    : " — already passed"
                  : ` — ${c.free} time${c.free === 1 ? "" : "s"} free`
              }`}
              title={
                c.status === "closed"
                  ? c.reason === "holiday"
                    ? "Closed — holiday"
                    : "Closed on this day"
                  : c.status === "full"
                  ? "Fully booked"
                  : undefined
              }
              onClick={() => onChange(c.dateISO)}
            >
              <span className={styles.calNum}>{c.day}</span>
              {tag && <span className={styles.calTag}>{tag}</span>}
            </button>
          );
        })}
      </div>

      <div className={styles.calLegend}>
        <span>
          <i className={styles.calKeyOpen} /> Available
        </span>
        <span>
          <i className={styles.calKeyClosed} /> Closed
        </span>
        <span>
          <i className={styles.calKeyFull} /> Fully booked
        </span>
      </div>

      {/* Say it in words too — the colours alone can't carry a closure. */}
      {holidays.length > 0 && (
        <p className={styles.calNotice}>
          🚪 We&apos;re <strong>closed</strong> on{" "}
          {holidays
            .slice(0, 4)
            .map((c) => SHORT_DAY.format(utc(c.dateISO)))
            .join(", ")}
          {holidays.length > 4 ? ` +${holidays.length - 4} more` : ""} — please pick another day.
        </p>
      )}
      {offDays.length > 0 && (
        <p className={styles.calNoteSm}>
          The salon doesn&apos;t open on {offDays.join(" or ")}.
        </p>
      )}
      {selected?.status === "closed" && (
        <p className={styles.calNotice}>
          🚪 {FULL_DAY.format(utc(value))} is now closed — please choose another day.
        </p>
      )}
      {info === null && !loading && (
        <p className={styles.calNoteSm}>
          Couldn&apos;t check which days are open — pick a date and we&apos;ll confirm on WhatsApp.
        </p>
      )}
    </div>
  );
}
