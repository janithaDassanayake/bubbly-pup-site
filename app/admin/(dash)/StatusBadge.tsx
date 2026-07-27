import { AppointmentStatus } from "@prisma/client";
import { STATUS_LABEL, STATUS_COLOR } from "@/lib/status";

export default function StatusBadge({ status }: { status: AppointmentStatus }) {
  const c = STATUS_COLOR[status];
  return (
    <span className="adm-badge" style={{ background: c.bg, color: c.fg }}>
      {STATUS_LABEL[status]}
    </span>
  );
}
