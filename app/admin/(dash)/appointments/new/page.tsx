import Link from "next/link";
import { prisma } from "@/lib/db";
import { salonNow } from "@/lib/time";
import NewAppointmentForm from "./NewAppointmentForm";

export const dynamic = "force-dynamic";

// Manual booking — for walk-ins and appointments taken over the phone, which is
// how most of this salon's bookings actually arrive.
export default async function NewAppointmentPage() {
  const [packages, addOns] = await Promise.all([
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

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>New appointment</h1>
          <p>Add a walk-in or a booking taken over the phone</p>
        </div>
        <Link href="/admin/appointments" className="adm-btn adm-btn-sm">
          ← Back to appointments
        </Link>
      </div>

      <NewAppointmentForm packages={packages} addOns={addOns} todayISO={salonNow().dateISO} />
    </>
  );
}
