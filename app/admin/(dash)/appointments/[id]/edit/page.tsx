import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { salonNow } from "@/lib/time";
import { canEditAppointment } from "@/lib/status";
import { to12h } from "@/lib/booking-engine";
import EditAppointmentForm from "./EditAppointmentForm";

export const dynamic = "force-dynamic";

// Re-scope an existing booking: wrong package picked, or the customer wants a
// different time. The customer and pet aren't editable here — those live on the
// customer record (Customers → edit contact), so there's one place to change them.
export default async function EditAppointmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [appt, packages, addOns] = await Promise.all([
    prisma.appointment.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        status: true,
        date: true,
        startMin: true,
        addOnKeys: true,
        notes: true,
        priceEstimate: true,
        package: { select: { key: true, name: true } },
        customer: { select: { name: true } },
        pet: { select: { name: true } },
        payment: { select: { status: true } },
      },
    }),
    prisma.package.findMany({
      where: { active: true },
      orderBy: [{ standalone: "asc" }, { price: "desc" }],
      select: { key: true, name: true, durationMin: true, price: true, standalone: true },
    }),
    prisma.addOn.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { key: true, name: true, price: true, group: true },
    }),
  ]);

  if (!appt) notFound();

  const locked = !canEditAppointment(appt.status) || appt.payment?.status === "PAID";

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Edit appointment</h1>
          <p>
            {appt.code} · {appt.customer.name} · {appt.pet.name}
          </p>
        </div>
        <Link href="/admin/appointments" className="adm-btn adm-btn-sm">
          ← Back to appointments
        </Link>
      </div>

      {locked ? (
        <div className="adm-card">
          <div className="adm-card-body">
            <p className="adm-error">
              This appointment can no longer be edited — it&apos;s already completed, paid or
              cancelled.
            </p>
            <p className="adm-note" style={{ marginTop: 8 }}>
              Changing it now would disagree with the payment already recorded and the totals in
              Reports.
            </p>
          </div>
        </div>
      ) : (
        <EditAppointmentForm
          appointment={{
            id: appt.id,
            code: appt.code,
            packageKey: appt.package.key,
            packageName: appt.package.name,
            addOnKeys: appt.addOnKeys,
            dateISO: appt.date.toISOString().slice(0, 10),
            start: `${String(Math.floor(appt.startMin / 60)).padStart(2, "0")}:${String(
              appt.startMin % 60
            ).padStart(2, "0")}`,
            startLabel: to12h(appt.startMin),
            notes: appt.notes ?? "",
            priceEstimate: appt.priceEstimate,
          }}
          packages={packages}
          addOns={addOns}
          todayISO={salonNow().dateISO}
        />
      )}
    </>
  );
}
