// What has actually been DONE for this appointment, as a persistent trail.
//
// Before this, the only feedback was a line of text that vanished on the next
// page load — so "did I already send the confirmation?" had no answer. These
// ticks are derived from stored data (status, payment, notifications), so they
// survive refreshes and are true rather than remembered.
import { AppointmentStatus, NotificationStatus, NotificationType, PaymentStatus } from "@prisma/client";

export type TrailData = {
  status: AppointmentStatus;
  payment: { status: PaymentStatus } | null;
  notifications: { type: NotificationType; status: NotificationStatus }[];
};

// Ranking so a later stage implies the earlier ones are done.
const REACHED: Record<AppointmentStatus, number> = {
  PENDING_CONFIRMATION: 0,
  NOT_SURE: 0,
  CANCELLED: -1,
  NO_SHOW: -1,
  CONFIRMED: 1,
  ARRIVED: 1,
  GROOMING_STARTED: 2,
  GROOM_FINISHED: 2,
  PAID: 3,
  COMPLETED: 3,
};

const sent = (n: TrailData["notifications"], type: NotificationType) =>
  n.some((x) => x.type === type && x.status === "SENT");
const queued = (n: TrailData["notifications"], type: NotificationType) =>
  n.some((x) => x.type === type);

export default function ProgressTrail({ status, payment, notifications }: TrailData) {
  if (status === "CANCELLED" || status === "NO_SHOW") {
    return (
      <div className="adm-trail">
        <span className="adm-step adm-step-off">
          {status === "CANCELLED" ? "✕ Cancelled" : "✕ No show"}
        </span>
      </div>
    );
  }

  const reached = REACHED[status];
  const paid = payment?.status === "PAID";

  const steps = [
    {
      label: "Confirmed",
      done: reached >= 1,
      // A confirmation that was composed but never sent is worth flagging.
      note: sent(notifications, "APPOINTMENT_CONFIRMED")
        ? "message sent"
        : queued(notifications, "APPOINTMENT_CONFIRMED")
        ? "not sent yet"
        : undefined,
      warn: queued(notifications, "APPOINTMENT_CONFIRMED") && !sent(notifications, "APPOINTMENT_CONFIRMED"),
    },
    { label: "Grooming started", done: reached >= 2 },
    {
      label: "Paid & completed",
      done: reached >= 3,
      note: paid
        ? sent(notifications, "THANK_YOU")
          ? "paid · thank-you sent"
          : queued(notifications, "THANK_YOU")
          ? "paid · thank-you not sent"
          : "paid"
        : undefined,
      warn: reached >= 3 && queued(notifications, "THANK_YOU") && !sent(notifications, "THANK_YOU"),
    },
  ];

  return (
    <div className="adm-trail">
      {steps.map((s) => (
        <span
          key={s.label}
          className={`adm-step ${s.done ? "adm-step-done" : "adm-step-off"} ${
            s.warn ? "adm-step-warn" : ""
          }`}
          title={s.note ?? (s.done ? "Done" : "Not yet")}
        >
          {s.done ? "✓" : "○"} {s.label}
          {s.done && s.note ? <em>{s.note}</em> : null}
        </span>
      ))}
    </div>
  );
}
