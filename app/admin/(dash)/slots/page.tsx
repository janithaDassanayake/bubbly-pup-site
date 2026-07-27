import Link from "next/link";
import { prisma } from "@/lib/db";
import { daySlotMap, rangeSlotSummary, type SlotBooking } from "@/lib/slot-map";
import { to12h } from "@/lib/booking-engine";
import { addDaysISO, dateOnly, formatDateLabel, salonNow } from "@/lib/time";
import StatusBadge from "../StatusBadge";
import SlotStrip, { SlotLegend } from "../SlotStrip";
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

  const { timeline, counts, released, fits } = map;
  // Occupancy counts places sold, not steps touched: a step holding one pet out
  // of two is half sold, and calling it 100% busy would hide sellable capacity.
  const places = counts.total * map.capacity;
  const sold = counts.full * map.capacity + counts.partial;
  const occupancy = places ? Math.round((sold / places) * 100) : 0;

  // Detail is printed once per booking, on the first step it occupies; the steps
  // it continues into just point back at it, so a 2-hour groom reads as one
  // block instead of four identical rows.
  const seen = new Set<string>();

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Slot Management</h1>
          <p>
            {formatDateLabel(dateOnly(date))}
            {date === todayISO ? " · today" : ""} · open {map.openTime}–{map.closeTime} ·{" "}
            {map.slotStepMin}-min slots
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
                <span>🟢</span> Free slots
              </div>
              <div className="v">{counts.free + counts.partial}</div>
              <div className="sub">
                of {counts.total} slots
                {counts.partial > 0
                  ? ` · ${counts.partial} with 1 of ${map.capacity} taken`
                  : ""}
              </div>
            </div>
            <div className="adm-tile">
              <div className="k">
                <span>🔴</span> Full slots
              </div>
              <div className="v">{counts.full}</div>
              <div className="sub">
                {counts.bookings} appointment{counts.bookings === 1 ? "" : "s"}
              </div>
            </div>
            <div className="adm-tile">
              <div className="k">
                <span>📊</span> Occupancy
              </div>
              <div className="v">{occupancy}%</div>
              <div className="sub">{counts.gone > 0 ? `${counts.gone} slots already passed` : "of the whole day"}</div>
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

          <div className="adm-card">
            <div className="adm-card-head">
              <h2>The day, slot by slot</h2>
              <SlotLegend gone={counts.gone > 0} partial={map.capacity > 1} />
            </div>
            <div className="adm-card-body">
              <SlotStrip cells={timeline.cells} capacity={map.capacity} />

              {fits && (
                <p className="adm-note" style={{ margin: "12px 0 0" }}>
                  🎯 marks slots where a <strong>{fits.name}</strong> ({fits.durationMin} min) can
                  actually start — a free {map.slotStepMin}-min gap isn't always long enough.
                </p>
              )}

              <ul className="adm-slots" style={{ marginTop: 14 }}>
                {timeline.cells.map((c) => {
                  // Four states, each with its own colour, so the row can be read
                  // without counting the bookings printed inside it. A slot with
                  // one pet is NOT the same as a full one — it's still sellable.
                  const state = c.full
                    ? "booked"
                    : c.booked.length
                    ? "partial"
                    : c.past
                    ? "past"
                    : "free";
                  const statusLabel = c.full
                    ? `Full · ${c.booked.length} of ${map.capacity}`
                    : c.booked.length
                    ? `Room for ${map.capacity - c.booked.length} more · ${c.booked.length} of ${map.capacity}`
                    : c.past
                    ? "Time passed"
                    : "Free";
                  const canStart = fits?.starts.has(c.startMin) ?? false;
                  const lines = c.booked.map((bk) => {
                    const isFirst = !seen.has(bk.id);
                    seen.add(bk.id);
                    return { bk, isFirst };
                  });

                  return (
                    <li
                      key={c.startMin}
                      className={`adm-slot adm-slot-${state}${c.current ? " adm-slot-now" : ""}`}
                    >
                      <span className="t">
                        {to12h(c.startMin)}
                        <em>to {to12h(c.endMin)}</em>
                      </span>
                      <div className="adm-slot-body">
                        {/* The status badge is always present — a slot holding
                            one pet used to show only that booking, leaving the
                            reader to work out whether it was still sellable. */}
                        <span className={`adm-slot-tag ${state}`}>
                          {canStart && !c.past && !c.full ? "🎯 " : ""}
                          {statusLabel}
                        </span>
                        {c.booked.length === 0 ? (
                          fits && !c.past && !canStart ? (
                            <span className="adm-note">
                              Free, but not enough room for {fits.durationMin} min
                            </span>
                          ) : null
                        ) : (
                          lines.map(({ bk, isFirst }) => (
                            <BookedLine key={bk.id} b={bk} first={isFirst} />
                          ))
                        )}
                        {/* Two pets at once is normal now — it's what the second
                            place is FOR. Only flag it when the count is above
                            what the salon can actually handle, which can happen
                            if capacity was lowered after these were booked. */}
                        {c.booked.length > map.capacity && (
                          <span className="adm-note" style={{ color: "#c0392b", fontWeight: 600 }}>
                            ⚠ {c.booked.length} pets booked — more than the {map.capacity} you can groom at once
                          </span>
                        )}
                      </div>
                      {c.current && <span className="adm-slot-nowtag">now</span>}
                    </li>
                  );
                })}
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
