import Link from "next/link";
import { prisma } from "@/lib/db";
import { daySlotMap, rangeSlotSummary, type SlotBooking } from "@/lib/slot-map";
import { to12h } from "@/lib/booking-engine";
import { addDaysISO, dateOnly, formatDateLabel, salonNow } from "@/lib/time";
import StatusBadge from "../StatusBadge";
import { SlotFilters } from "../Filters";

export const dynamic = "force-dynamic";

type SP = { date?: string; pkg?: string };

const STRIP_DAYS = 14;
const STRIP_LOOKBACK = 2; // a couple of past days stay visible for "what happened yesterday"

export default async function SlotsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { dateISO: todayISO } = salonNow();
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayISO;

  const [map, packages, week] = await Promise.all([
    daySlotMap(date, { packageKey: sp.pkg }),
    prisma.package.findMany({
      where: { active: true },
      select: { key: true, name: true, durationMin: true },
      orderBy: { durationMin: "asc" },
    }),
    rangeSlotSummary(addDaysISO(date, -STRIP_LOOKBACK), STRIP_DAYS),
  ]);

  const { timeline, counts, released, fits, slots } = map;
  // Everything here is counted in BOOKABLE START TIMES — the thing the salon
  // sells, one client each — never in half-hour steps of the clock. Counting
  // steps would call 10:00 "free" on a day when nothing can start at 10:00 at
  // all, which is exactly the disagreement with the customer's form this page
  // must never have.
  const freeStarts = slots.filter((s) => !s.taken).length;
  const bookedStarts = slots.filter((s) => s.bookings.length > 0).length;
  const occupancy = slots.length ? Math.round((bookedStarts / slots.length) * 100) : 0;
  // Bookings sitting on a time the salon no longer offers — still real.
  const offered = new Set(slots.map((s) => s.min));
  const strays = timeline.cells.flatMap((c) => c.booked).filter((b, i, a) =>
    !offered.has(b.start) && a.findIndex((x) => x.id === b.id) === i
  );

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Slot Management</h1>
          <p>
            {formatDateLabel(dateOnly(date))}
            {date === todayISO ? " · today" : ""} · open {map.openTime}–{map.closeTime} ·{" "}
            {slots.length} booking time{slots.length === 1 ? "" : "s"} · one client each
          </p>
        </div>
        <div className="adm-btn-row">
          <Link href={`/admin/appointments?date=${date}`} className="adm-btn">
            📋 List view
          </Link>
          <Link href="/admin/appointments/new" className="adm-btn adm-btn-primary">
            + New appointment
          </Link>
        </div>
      </div>

      <div className="adm-card" style={{ marginBottom: 16 }}>
        <div className="adm-card-body">
          <SlotFilters date={date} pkg={sp.pkg} packages={packages} todayISO={todayISO} />
        </div>
      </div>

      {/* Which day is busy — jump straight to it. */}
      <div className="adm-card" style={{ marginBottom: 16 }}>
        <div className="adm-card-head">
          <h2>Next two weeks</h2>
          <span className="adm-note">Tap a day to open it</span>
        </div>
        <div className="adm-card-body">
          <div className="adm-daystrip">
            {week.map((d) => {
              const active = d.dateISO === date;
              // No places left because they're all taken (worth flagging red) vs
              // because the day is simply over (not a problem). A half-taken
              // step still has a place to sell, so it doesn't count as full.
              const sellable = d.free + d.partial;
              const full = !d.closed && sellable === 0 && d.gone === 0;
              const over = !d.closed && sellable === 0 && d.gone > 0;
              const cls = [
                "adm-day",
                active ? "active" : "",
                d.closed ? "adm-day-closed" : "",
                full ? "adm-day-full" : "",
                over ? "adm-day-over" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <Link
                  key={d.dateISO}
                  href={`/admin/slots?date=${d.dateISO}${sp.pkg ? `&pkg=${sp.pkg}` : ""}`}
                  className={cls}
                  aria-current={active ? "date" : undefined}
                >
                  <div className="dw">{weekday(d.dateISO)}</div>
                  <div className="dd">{dayNum(d.dateISO)}</div>
                  <div className="dn">
                    {d.closed
                      ? d.reason === "holiday"
                        ? "Holiday"
                        : "Closed"
                      : full
                      ? "Full"
                      : over
                      ? d.full + d.partial > 0
                        ? `${d.full + d.partial} done`
                        : "Day over"
                      : `${d.free + d.partial} free`}
                  </div>
                  {!d.closed && (
                    <div className="bar">
                      {/* full steps fill the bar; half-taken steps count half */}
                      <i
                        style={{
                          width: `${d.total ? ((d.full + d.partial / 2) / d.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  )}
                  {d.dateISO === todayISO && <div className="dt">Today</div>}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {timeline.closed ? (
        <div className="adm-card">
          <div className="adm-empty">
            <div className="big">{timeline.reason === "holiday" ? "🎉" : "🚪"}</div>
            {timeline.reason === "holiday"
              ? "Marked as a holiday in Settings — no slots on this date."
              : "Closed on this weekday — no slots on this date."}
            <div style={{ marginTop: 12 }}>
              <Link href="/admin/settings" className="adm-btn">
                ⚙️ Change opening days
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="adm-grid adm-stats" style={{ marginBottom: 16 }}>
            <div className="adm-tile">
              <div className="k">
                <span>🟢</span> Bookable times
              </div>
              <div className="v">{freeStarts}</div>
              <div className="sub">
                of {slots.length} time{slots.length === 1 ? "" : "s"} today
              </div>
            </div>
            <div className="adm-tile">
              <div className="k">
                <span>🔴</span> Booked times
              </div>
              <div className="v">{bookedStarts}</div>
              <div className="sub">
                {counts.bookings} appointment{counts.bookings === 1 ? "" : "s"}
              </div>
            </div>
            <div className="adm-tile">
              <div className="k">
                <span>📊</span> Occupancy
              </div>
              <div className="v">{occupancy}%</div>
              <div className="sub">
                {bookedStarts} of {slots.length} time{slots.length === 1 ? "" : "s"} taken
              </div>
            </div>
            {fits && (
              <div className="adm-tile">
                <div className="k">
                  <span>🎯</span> Fits {fits.durationMin} min
                </div>
                <div className="v">{fits.starts.size}</div>
                <div className="sub">start times for {fits.name}</div>
              </div>
            )}
          </div>

          {/* The day, slot by slot — six individual start times, one client
              each. Nothing is grouped: booking 09:00 leaves 09:30 open, which
              is the whole point of the individual-slot rule. */}
          <div className="adm-card">
            <div className="adm-card-head">
              <h2>The day, slot by slot</h2>
              <span className="adm-note">
                One client per time · {slots.length} slots a day
              </span>
            </div>
            <div className="adm-card-body">
              {fits && (
                <p className="adm-note" style={{ margin: "0 0 12px" }}>
                  🎯 marks times still open for <strong>{fits.name}</strong> (
                  {fits.durationMin} min).
                </p>
              )}

              <ul className="adm-slots">
                {slots.map((s) => {
                  // Keyed off `taken`, not off whether a booking sits on this
                  // exact minute: a slot also closes when its part of the day is
                  // full — which is how a dog booked at 11:00 closes 09:00/09:30.
                  const state = s.reason === "passed" ? "past" : s.taken ? "booked" : "free";
                  const canStart = fits?.starts.has(s.min) ?? false;
                  const isNow =
                    map.nowMin !== undefined &&
                    map.nowMin >= s.min &&
                    map.nowMin < s.min + map.slotStepMin;
                  return (
                    <li
                      key={s.min}
                      className={`adm-slot adm-slot-${state}${isNow ? " adm-slot-now" : ""}`}
                    >
                      <span className="t">{s.label}</span>
                      <div className="adm-slot-body">
                        <span className={`adm-slot-tag ${state}`}>
                          {canStart ? "🎯 " : ""}
                          {s.reason === "passed"
                            ? "Time passed"
                            : s.bookings.length
                            ? "Booked"
                            : s.taken
                            ? "This part of the day is full"
                            : "Free"}
                        </span>
                        {s.bookings.map((b) => (
                          <BookedLine key={b.id} b={b} first />
                        ))}
                        {/* Only possible if `capacity` was raised above one, or
                            two rows were written before this rule existed. */}
                        {s.bookings.length > map.capacity && (
                          <span className="adm-note" style={{ color: "#c0392b", fontWeight: 600 }}>
                            ⚠ {s.bookings.length} bookings on one time
                          </span>
                        )}
                      </div>
                      {isNow && <span className="adm-slot-nowtag">now</span>}
                    </li>
                  );
                })}

                {/* A booking at a time no longer offered — made under an older
                    grid, or moved by hand. It holds that minute even though no
                    slot row can show it, so surface it rather than lose it. */}
                {strays.map((b) => (
                  <li key={b.id} className="adm-slot adm-slot-partial">
                    <span className="t">{to12h(b.start)}</span>
                    <div className="adm-slot-body">
                      <span className="adm-slot-tag partial">
                        Not one of today&apos;s start times
                      </span>
                      <BookedLine b={b} first />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}

      {timeline.outside.length > 0 && (
        <div className="adm-card" style={{ marginTop: 16 }}>
          <div className="adm-card-head">
            <h2>⚠ Outside opening hours</h2>
            <span className="adm-note">
              Booked before {map.openTime} or past {map.closeTime}
            </span>
          </div>
          <div className="adm-card-body">
            <ul className="adm-slots">
              {timeline.outside.map((b) => (
                <li key={b.id} className="adm-slot adm-slot-warn">
                  <span className="t">
                    {to12h(b.start)}
                    <em>to {to12h(b.end)}</em>
                  </span>
                  <div className="adm-slot-body">
                    <BookedLine b={b} first />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {released.length > 0 && (
        <div className="adm-card" style={{ marginTop: 16 }}>
          <div className="adm-card-head">
            <h2>Released slots</h2>
            <span className="adm-note">Cancelled / no-show — this time is bookable again</span>
          </div>
          <div className="adm-card-body">
            <ul className="adm-slots">
              {released.map((b) => (
                <li key={b.id} className="adm-slot adm-slot-released">
                  <span className="t">
                    {to12h(b.start)}
                    <em>to {to12h(b.end)}</em>
                  </span>
                  <div className="adm-slot-body">
                    <BookedLine b={b} first />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

function BookedLine({ b, first }: { b: SlotBooking; first: boolean }) {
  if (!first) {
    return (
      <span className="adm-note">
        ↳ continues · <span className="adm-code">{b.code}</span> {b.customer}
      </span>
    );
  }
  return (
    <>
      <span className="adm-slot-head">
        <Link href={`/admin/appointments?q=${b.code}`} className="adm-code">
          {b.code}
        </Link>
        <StatusBadge status={b.status} />
      </span>
      <span className="adm-strong">
        {b.customer} · {b.pet}
      </span>
      <span className="adm-note">
        {b.pkg} · {b.durationMin} min · {to12h(b.start)}–{to12h(b.end)} · {b.phone}
      </span>
    </>
  );
}

// Labels for the day strip — formatted in UTC to match @db.Date storage.
const weekday = (dateISO: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" }).format(dateOnly(dateISO));
const dayNum = (dateISO: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(
    dateOnly(dateISO)
  );
