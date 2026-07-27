import Link from "next/link";
import { dashboardStats } from "@/lib/admin-data";
import { formatDateLabel, dateOnly } from "@/lib/time";
import { to12h } from "@/lib/booking-engine";
import { formatLKR } from "@/lib/format";
import StatusBadge from "./StatusBadge";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const s = await dashboardStats();
  const todayLabel = formatDateLabel(dateOnly(s.dateISO));

  const tiles = [
    { k: "Today's Appointments", v: s.counts.total, glyph: "📅" },
    { k: "Pending Confirmation", v: s.counts.pending, glyph: "📞", href: "/admin/pending" },
    { k: "Confirmed", v: s.counts.confirmed, glyph: "✅" },
    { k: "Completed", v: s.counts.completed, glyph: "🎉" },
    { k: "Cancelled", v: s.counts.cancelled, glyph: "🚫" },
    { k: "No Shows", v: s.counts.noShow, glyph: "👻" },
  ];

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Dashboard</h1>
          <p>{todayLabel}</p>
        </div>
        {/* Explicit date=all — /admin/appointments alone now opens on today. */}
        <Link href="/admin/appointments?date=all" className="adm-btn adm-btn-primary">
          View all appointments
        </Link>
      </div>

      <div className="adm-grid adm-stats" style={{ marginBottom: 18 }}>
        <div className="adm-tile" style={{ gridColumn: "span 1" }}>
          <div className="k">💰 Today's Revenue</div>
          <div className="v">{formatLKR(s.revenueToday)}</div>
          <div className="sub">Paid today</div>
        </div>
        {tiles.map((t) => {
          const inner = (
            <>
              <div className="k">
                <span>{t.glyph}</span> {t.k}
              </div>
              <div className="v">{t.v}</div>
            </>
          );
          return t.href ? (
            <Link key={t.k} href={t.href} className="adm-tile" style={{ display: "block" }}>
              {inner}
            </Link>
          ) : (
            <div key={t.k} className="adm-tile">
              {inner}
            </div>
          );
        })}
      </div>

      <div className="adm-grid adm-cols-2">
        <ApptCard title="Today's schedule" empty="No appointments today." rows={s.todays} showDate={false} />
        <ApptCard title="Upcoming" empty="No upcoming appointments." rows={s.upcoming} showDate />
      </div>
    </>
  );
}

type Row = {
  id: string;
  code: string;
  date: Date;
  startMin: number;
  status: import("@prisma/client").AppointmentStatus;
  customer: { name: string };
  pet: { name: string };
  package: { name: string };
};

function ApptCard({
  title,
  rows,
  empty,
  showDate,
}: {
  title: string;
  rows: Row[];
  empty: string;
  showDate: boolean;
}) {
  return (
    <div className="adm-card">
      <div className="adm-card-head">
        <h2>{title}</h2>
      </div>
      {rows.length === 0 ? (
        <div className="adm-empty">
          <div className="big">🐾</div>
          {empty}
        </div>
      ) : (
        <div className="adm-table-wrap">
          {/* adm-cards + data-label = stacks into readable cards under 767px.
              Without it this table stayed full width and scrolled sideways. */}
          <table className="adm-table adm-cards">
            <thead>
              <tr>
                <th>{showDate ? "When" : "Time"}</th>
                <th>Customer</th>
                <th>Pet</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="adm-strong" data-label={showDate ? "When" : "Time"}>
                    {showDate ? `${formatDateLabel(r.date)} · ` : ""}
                    {to12h(r.startMin)}
                  </td>
                  <td data-label="Customer">{r.customer.name}</td>
                  <td data-label="Pet">{r.pet.name}</td>
                  <td data-label="Status">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
