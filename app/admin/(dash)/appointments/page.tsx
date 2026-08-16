import Link from "next/link";
import { Prisma, AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateOnly, formatDateLabel, salonNow } from "@/lib/time";
import { to12h } from "@/lib/booking-engine";
import { formatLKR, customerLabel } from "@/lib/format";
import { finalPrice, isPriceAdjusted } from "@/lib/price";
import { formatPhone } from "@/lib/phone";
import { petIcon } from "@/lib/pet";
import { ALL_STATUSES, canEditAppointment } from "@/lib/status";
import { isCloudApiConfigured } from "@/lib/whatsapp-send";
import { isSource } from "@/lib/source";
import { getSettings } from "@/lib/settings";
import { waPreviews } from "@/lib/admin-wa";
import { daySlotMap } from "@/lib/slot-map";
import StatusBadge from "../StatusBadge";
import SourceBadge from "../SourceBadge";

import ProgressTrail from "../ProgressTrail";
// Before/after photo flow is parked for now — swap StatusActions back for
// <GroomFlow> (same props) to switch it on again. GroomFlow.tsx, lib/s3.ts,
// lib/collage-client.ts and /api/admin/photos are all still in place.
import { StatusActions, DeleteAppointment } from "../ActionButtons";
import { AppointmentFilters } from "../Filters";

export const dynamic = "force-dynamic";

type SP = { date?: string; status?: string; source?: string; q?: string };

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const where: Prisma.AppointmentWhereInput = {};

  // Landing here shows TODAY — that's the day the salon is working. The filters
  // can move to any date, or to `date=all` for the whole history.
  //
  // Two exceptions span every date, or the default would hide what was asked for:
  //   • a text search — the customer's WhatsApp message deep-links to
  //     `?q=BP-XXXXXX`, and that booking is usually NOT today.
  //   • an explicit `date=all`.
  const { dateISO: todayISO } = salonNow();
  const searching = Boolean(sp.q?.trim());
  const dateSel =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
      ? sp.date
      : sp.date || searching // `all`, anything unparseable, or a search
      ? "all"
      : todayISO;

  const onDate = dateSel === "all" ? null : dateSel;
  if (onDate) where.date = dateOnly(onDate);
  if (sp.status && ALL_STATUSES.includes(sp.status as AppointmentStatus)) {
    where.status = sp.status as AppointmentStatus;
  }
  // Unset = both kinds together, which is the point of the page: one list of
  // everyone due in today, however they got on it.
  if (isSource(sp.source)) where.source = sp.source;
  if (sp.q) {
    where.OR = [
      { code: { contains: sp.q, mode: "insensitive" } },
      // The pet is how the salon knows a booking now that no owner name is
      // taken; `name` still matches the customers saved back when it was.
      { pet: { name: { contains: sp.q, mode: "insensitive" } } },
      { customer: { name: { contains: sp.q, mode: "insensitive" } } },
      { customer: { phone: { contains: sp.q } } },
    ];
  }

  const appts = await prisma.appointment.findMany({
    where,
    include: {
      customer: true,
      pet: true,
      package: true,
      payment: true,
      // Drives the progress trail: which messages exist and whether they were sent.
      notifications: { select: { type: true, status: true } },
    },
    orderBy: [{ date: "desc" }, { startMin: "asc" }],
    take: 200,
  });

  const cloudApi = isCloudApiConfigured();
  const { businessName } = await getSettings();

  // Filtering by a date turns this into "that day's list" — so show that day's
  // free/booked shape right here, with the full map one tap away.
  const day = onDate ? await daySlotMap(onDate) : null;

  const qs = (patch: Partial<SP>) => {
    const merged = { ...sp, ...patch };
    const p = new URLSearchParams();
    Object.entries(merged).forEach(([k, v]) => {
      if (v) p.set(k, String(v));
    });
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Appointments</h1>
          <p>
            {appts.length} shown
            {appts.length > 0 && !sp.source ? (
              <>
                {" "}({appts.filter((a) => a.source === "ONLINE").length} online ·{" "}
                {appts.filter((a) => a.source === "WALK_IN").length} walk-in)
              </>
            ) : null}{" "}
            ·{" "}
            {onDate
              ? `${formatDateLabel(dateOnly(onDate))}${onDate === todayISO ? " · today" : ""}`
              : searching
              ? "all dates · matching your search"
              : "all dates · newest first"}
          </p>
        </div>
        <div className="adm-btn-row">
          <Link
            href={onDate ? `/admin/slots?date=${onDate}` : "/admin/slots"}
            className="adm-btn"
          >
            🗓️ Slot management
          </Link>
          <Link href="/admin/appointments/new" className="adm-btn">
            + New appointment
          </Link>
          {/* The busy-counter path: a pet is here NOW and needs to be on this
              list in one screen. The form beside it mirrors the customer's
              reservation flow instead, six slots and all. */}
          <Link href="/admin/appointments/walk-in" className="adm-btn adm-btn-primary">
            🚶 Add walk-in customer
          </Link>
        </div>
      </div>

      <div className="adm-card" style={{ marginBottom: 16 }}>
        <div className="adm-card-body">
          <AppointmentFilters
            date={dateSel}
            status={sp.status}
            source={sp.source}
            q={sp.q}
            todayISO={todayISO}
          />

          {day && (
            <div className="adm-slotsum">
              {day.timeline.closed ? (
                <p className="adm-note" style={{ margin: 0 }}>
                  🚪 {day.timeline.reason === "holiday" ? "Holiday" : "Closed"} on{" "}
                  {formatDateLabel(dateOnly(onDate!))} — no slots on this date.
                </p>
              ) : (
                <>
                  {/* Counted in bookable START TIMES, not in clock steps — the
                      salon sells six individual slots, and a half-hour strip
                      would show 10:00 as free on a day when nothing can start
                      at 10:00 at all. */}
                  <div className="adm-slotsum-top">
                    <strong>
                      {day.slots.filter((s) => !s.taken).length} of {day.slots.length} times free
                    </strong>
                    <span className="adm-note">
                      {day.slots.filter((s) => s.reason === "booked").length} booked ·{" "}
                      {day.counts.bookings} appointment
                      {day.counts.bookings === 1 ? "" : "s"}
                    </span>
                  </div>
                  <ul className="adm-slots">
                    {day.slots.map((s) => {
                      // Keyed off `taken`, not off whether a booking sits on
                      // this exact minute: a slot also closes when its part of
                      // the day is full — which is how a dog booked at 11:00
                      // closes 09:00 and 09:30.
                      const state = s.reason === "passed" ? "past" : s.taken ? "booked" : "free";
                      return (
                        <li key={s.min} className={`adm-slot adm-slot-${state}`}>
                          <span className="t">{s.label}</span>
                          <div className="adm-slot-body">
                            <span className={`adm-slot-tag ${state}`}>
                              {s.reason === "passed"
                                ? "Time passed"
                                : s.bookings.length
                                ? "Booked"
                                : s.taken
                                ? "This part of the day is full"
                                : "Free"}
                            </span>
                            {s.bookings.map((b) => (
                              <span key={b.id} className="adm-note">
                                {petIcon(b.petSpecies)} {b.pet} · {b.customer} · {b.pkg}
                              </span>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              <Link href={`/admin/slots?date=${onDate}`} className="adm-btn adm-btn-sm">
                Open slot map →
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="adm-card">
        {appts.length === 0 ? (
          <div className="adm-empty">
            <div className="big">{onDate ? "🐾" : "🔍"}</div>
            {onDate && !sp.status && !searching ? (
              <>
                Nothing booked for {formatDateLabel(dateOnly(onDate))}.
                {/* The default view is one day, so an empty page must say where
                    the rest of the bookings went. */}
                <div style={{ marginTop: 12 }}>
                  <Link href="/admin/appointments?date=all" className="adm-btn">
                    View all dates
                  </Link>
                </div>
              </>
            ) : (
              "No appointments match these filters."
            )}
          </div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table adm-cards">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Source</th>
                  <th>When</th>
                  <th>Customer</th>
                  <th>Pet</th>
                  <th>Package</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {appts.map((a) => (
                  <tr key={a.id}>
                    <td className="adm-code" data-label="Code">{a.code}</td>
                    <td data-label="Source"><SourceBadge source={a.source} /></td>
                    <td className="adm-strong" data-label="When">
                      {formatDateLabel(a.date)}
                      <br />
                      <span className="adm-note">
                        {to12h(a.startMin)}–{to12h(a.endMin)}
                      </span>
                    </td>
                    <td data-label="Customer">
                      {customerLabel(a.customer)}
                      {a.customer.name ? (
                        <>
                          <br />
                          <span className="adm-note">{formatPhone(a.customer.phone)}</span>
                        </>
                      ) : null}
                    </td>
                    <td data-label="Pet">
                      {petIcon(a.pet.species)} {a.pet.name}
                      {a.pet.breed ? <><br /><span className="adm-note">{a.pet.breed}</span></> : null}
                    </td>
                    <td data-label="Package">{a.package.name}</td>
                    {/* What's owed, not what the rules alone say: a manual
                        adjustment made on the edit form is the real price. */}
                    <td data-label="Price">
                      {formatLKR(a.payment?.amount || finalPrice(a))}
                      {isPriceAdjusted(a) && !a.payment?.amount ? (
                        <>
                          <br />
                          <span className="adm-note">
                            adjusted · was {formatLKR(a.priceEstimate)}
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td data-label="Status">
                      <StatusBadge status={a.status} />
                      <ProgressTrail
                        status={a.status}
                        payment={a.payment}
                        notifications={a.notifications}
                      />
                    </td>
                    <td data-label="Do">
                      <StatusActions
                        id={a.id}
                        status={a.status}
                        autoSend={cloudApi}
                        waPreview={waPreviews(a, businessName)}
                        finalPrice={finalPrice(a)}
                        paidAmount={
                          a.payment?.status === "PAID" ? a.payment.amount : null
                        }
                      />
                      {/* Wrong package or a time change — fix the booking in
                          place instead of cancelling and re-entering it, which
                          would lose the code the customer already has. */}
                      {canEditAppointment(a.status) && a.payment?.status !== "PAID" && (
                        <Link
                          href={`/admin/appointments/${a.id}/edit`}
                          className="adm-btn adm-btn-sm"
                        >
                          ✏️ Edit
                        </Link>
                      )}
                      {/* No status gate: a row that shouldn't exist can be in
                          any state, including part-way through a groom. */}
                      <DeleteAppointment id={a.id} code={a.code} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
