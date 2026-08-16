import Link from "next/link";
import { AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { salonNow, dateOnly, addDaysISO, formatDateLabel } from "@/lib/time";
import { to12h } from "@/lib/booking-engine";
import { bookingConfirmationBody, waLink } from "@/lib/whatsapp";
import { formatPhone } from "@/lib/phone";
import { petIcon } from "@/lib/pet";
import { getSettings } from "@/lib/settings";
import { waPreviews } from "@/lib/admin-wa";
import StatusBadge from "../StatusBadge";
import { StatusActions, SendWhatsApp } from "../ActionButtons";
import { LiveDateRange } from "../Filters";

export const dynamic = "force-dynamic";

type SP = { range?: string; from?: string; to?: string };

// Resolve the filter into an inclusive [fromISO, toISO] window.
function resolveRange(sp: SP, todayISO: string): { fromISO: string; toISO: string; key: string } {
  const key = sp.range ?? "today";
  switch (key) {
    case "tomorrow":
      return { fromISO: addDaysISO(todayISO, 1), toISO: addDaysISO(todayISO, 1), key };
    case "next2":
      return { fromISO: todayISO, toISO: addDaysISO(todayISO, 2), key };
    case "custom":
      return {
        fromISO: /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : todayISO,
        toISO: /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : todayISO,
        key,
      };
    default:
      return { fromISO: todayISO, toISO: todayISO, key: "today" };
  }
}

const OUTCOMES: AppointmentStatus[] = [
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.NOT_SURE,
  AppointmentStatus.CANCELLED,
];

export default async function PendingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { dateISO } = salonNow();
  const { fromISO, toISO, key } = resolveRange(sp, dateISO);

  const appts = await prisma.appointment.findMany({
    where: {
      date: { gte: dateOnly(fromISO), lte: dateOnly(toISO) },
      status: { in: [AppointmentStatus.PENDING_CONFIRMATION, AppointmentStatus.NOT_SURE] },
    },
    include: {
      customer: true,
      pet: true,
      package: true,
      notifications: { where: { type: "BOOKING_CONFIRMATION" }, take: 1 },
    },
    orderBy: [{ date: "asc" }, { startMin: "asc" }],
  });

  const { businessName } = await getSettings();

  const filters = [
    { key: "today", label: "Today" },
    { key: "tomorrow", label: "Tomorrow" },
    { key: "next2", label: "Next 2 Days" },
    { key: "custom", label: "Custom Range" },
  ];

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Pending Confirmation</h1>
          <p>Call each customer and set the outcome. Cancelling frees the slot instantly.</p>
        </div>
      </div>

      <div className="adm-card" style={{ marginBottom: 16 }}>
        <div className="adm-card-body">
          <div className="adm-filters">
            {filters.map((f) => (
              <Link
                key={f.key}
                href={`/admin/pending?range=${f.key}`}
                className={key === f.key ? "active" : ""}
              >
                {f.label}
              </Link>
            ))}
          </div>
          {key === "custom" && (
            <LiveDateRange from={sp.from ?? dateISO} to={sp.to ?? dateISO} extra={{ range: "custom" }} />
          )}
        </div>
      </div>

      {appts.length === 0 ? (
        <div className="adm-card">
          <div className="adm-empty">
            <div className="big">✅</div>
            Nothing pending for this range. All caught up!
          </div>
        </div>
      ) : (
        <div className="adm-grid" style={{ gap: 14 }}>
          {appts.map((a) => {
            const note = a.notifications[0];
            // Normally the queued message is sent verbatim. If none exists (an
            // appointment created before notifications, or one whose row was
            // cleared), compose the same branded message rather than falling
            // back to a bare sentence the customer wouldn't recognise.
            const confirmHref = waLink(
              a.customer.phone,
              note?.body ??
                bookingConfirmationBody({
                  businessName,
                  petName: a.pet.name,
                  packageName: a.package.name,
                  dateLabel: formatDateLabel(a.date),
                  timeLabel: to12h(a.startMin),
                  code: a.code,
                })
            );
            return (
              <div key={a.id} className="adm-card">
                <div className="adm-card-body" style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                      <span className="adm-code">{a.code}</span>
                      <StatusBadge status={a.status} />
                    </div>
                    <div className="adm-strong" style={{ fontSize: "1.05rem" }}>
                      {a.customer.name ? `${a.customer.name} · ` : ""}
                      {formatPhone(a.customer.phone)}
                    </div>
                    <div className="adm-note" style={{ marginTop: 2 }}>
                      {petIcon(a.pet.species)} {a.pet.name}{a.pet.breed ? ` (${a.pet.breed})` : ""} · 🧴 {a.package.name}
                    </div>
                    <div className="adm-note" style={{ marginTop: 2 }}>
                      📅 {formatDateLabel(a.date)} · ⏰ {to12h(a.startMin)}–{to12h(a.endMin)}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
                    <div className="adm-btn-row">
                      <a className="adm-btn adm-btn-sm" href={`tel:${a.customer.phone}`}>📞 Call</a>
                      {note ? (
                        <SendWhatsApp
                          notificationId={note.id}
                          href={confirmHref}
                          label="WhatsApp"
                          sent={note.status === "SENT"}
                        />
                      ) : (
                        <a className="adm-btn adm-btn-sm adm-btn-wa" href={confirmHref} target="_blank" rel="noopener noreferrer">💬 WhatsApp</a>
                      )}
                    </div>
                    <StatusActions
                      id={a.id}
                      status={a.status}
                      only={OUTCOMES}
                      waPreview={waPreviews(a, businessName)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
