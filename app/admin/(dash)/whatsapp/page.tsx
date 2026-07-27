import Link from "next/link";
import { Prisma, NotificationStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { waLink, NOTIFICATION_LABEL } from "@/lib/whatsapp";
import { salonDayRangeUtc, formatSalonDateTime } from "@/lib/time";
import { SendWhatsApp } from "../ActionButtons";
import { LiveDateRange } from "../Filters";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<NotificationStatus, { bg: string; fg: string }> = {
  PENDING: { bg: "#fff4e5", fg: "#b26a00" },
  SENT: { bg: "#e8f7ee", fg: "#1c7c3f" },
  FAILED: { bg: "#ffecec", fg: "#c0392b" },
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TAKE = 100;

export default async function WhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status;
  const from = ISO.test(sp.from ?? "") ? sp.from! : undefined;
  const to = ISO.test(sp.to ?? "") ? sp.to! : undefined;

  // Messages are timestamped in UTC; the salon thinks in Colombo days. Filtering
  // the raw timestamps would file anything before 05:30 local under the previous
  // day, so the range is converted to the matching UTC instants.
  const createdAt = salonDayRangeUtc(from, to);

  const where: Prisma.NotificationWhereInput = {
    ...(status && ["PENDING", "SENT", "FAILED"].includes(status)
      ? { status: status as NotificationStatus }
      : {}),
    ...(createdAt ? { createdAt } : {}),
  };

  const [notifications, total, pendingCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      include: { appointment: { include: { customer: true } } },
      orderBy: { createdAt: "desc" },
      take: TAKE,
    }),
    prisma.notification.count({ where }),
    // Pending count follows the date filter too — otherwise the tab promises
    // messages the list below isn't showing.
    prisma.notification.count({
      where: { status: "PENDING", ...(createdAt ? { createdAt } : {}) },
    }),
  ]);

  // Keep the chosen dates when switching status tab, or picking a date and then
  // a tab would silently throw the date away.
  const href = (key: string) => {
    const q = new URLSearchParams();
    if (key) q.set("status", key);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const s = q.toString();
    return s ? `/admin/whatsapp?${s}` : "/admin/whatsapp";
  };

  const filters = [
    { key: "", label: "All" },
    { key: "PENDING", label: `Pending (${pendingCount})` },
    { key: "SENT", label: "Sent" },
    { key: "FAILED", label: "Failed" },
  ];

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>WhatsApp</h1>
          <p>Free click-to-chat — tap Send to open WhatsApp with the message ready. Every message is logged.</p>
        </div>
      </div>

      <div className="adm-card" style={{ marginBottom: 16 }}>
        <div className="adm-card-body">
          <div className="adm-filters">
            {filters.map((f) => (
              <Link
                key={f.key}
                href={href(f.key)}
                className={(status ?? "") === f.key ? "active" : ""}
              >
                {f.label}
              </Link>
            ))}
          </div>

          <LiveDateRange
            from={from ?? ""}
            to={to ?? ""}
            extra={status ? { status } : {}}
            labelFrom="Messages from"
          />

          <p className="adm-note" style={{ marginTop: 10, marginBottom: 0 }}>
            {total === 0
              ? "No messages match."
              : `${total} message${total === 1 ? "" : "s"}${
                  from || to
                    ? ` · ${from ?? "the beginning"} to ${to ?? "today"}`
                    : ""
                }`}
            {total > TAKE ? ` · showing the newest ${TAKE}` : ""}
            {(from || to) && (
              <>
                {" · "}
                <Link href={status ? `/admin/whatsapp?status=${status}` : "/admin/whatsapp"}>
                  clear dates
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="adm-card">
        {notifications.length === 0 ? (
          <div className="adm-empty"><div className="big">💬</div>No messages here.</div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table adm-cards">
              <thead>
                <tr><th>Type</th><th>To</th><th>Message</th><th>Status</th><th>When</th><th>Send</th></tr>
              </thead>
              <tbody>
                {notifications.map((n) => {
                  const c = STATUS_COLOR[n.status];
                  const name = n.appointment?.customer.name ?? "";
                  return (
                    <tr key={n.id}>
                      <td className="adm-strong" data-label="Type">{NOTIFICATION_LABEL[n.type]}</td>
                      <td data-label="To">{name}<br /><span className="adm-note">{n.toPhone}</span></td>
                      <td data-label="Message" style={{ maxWidth: 340 }}>
                        <span className="adm-note" style={{ whiteSpace: "pre-wrap", display: "block", maxHeight: 66, overflow: "hidden" }}>
                          {n.body}
                        </span>
                      </td>
                      <td data-label="Status"><span className="adm-badge" style={{ background: c.bg, color: c.fg }}>{n.status}</span></td>
                      {/* Salon time, not the server's UTC — otherwise the column
                          and the date filter disagree by five and a half hours. */}
                      <td className="adm-note" data-label="When">
                        {formatSalonDateTime(n.sentAt ?? n.createdAt)}
                        {n.sentAt && <br />}
                        {n.sentAt && <span style={{ opacity: 0.75 }}>sent</span>}
                      </td>
                      <td data-label="Do">
                        <SendWhatsApp
                          notificationId={n.id}
                          href={waLink(n.toPhone, n.body)}
                          label={n.status === "SENT" ? "Resend" : "Send"}
                          sent={n.status === "SENT"}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
