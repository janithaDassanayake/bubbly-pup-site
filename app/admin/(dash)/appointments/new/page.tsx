import Link from "next/link";
import { prisma } from "@/lib/db";
import { salonNow } from "@/lib/time";
import { coveredCategoriesForKey } from "@/lib/data";
import NewAppointmentForm from "./NewAppointmentForm";

export const dynamic = "force-dynamic";

// Manual booking — for walk-ins and appointments taken over the phone, which is
// how most of this salon's bookings actually arrive.
export default async function NewAppointmentPage() {
  const [packages, addOns] = await Promise.all([
    prisma.package.findMany({
      where: { active: true },
      orderBy: [{ standalone: "asc" }, { price: "desc" }],
      // No durationMin: the form no longer prints a package duration, and the
      // booking action reads the real one from the database when it saves.
      select: { key: true, name: true, price: true, standalone: true },
    }),
    prisma.addOn.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { key: true, name: true, price: true, group: true, category: true },
    }),
  ]);

  // What each package already includes, so a chip can say so before staff add
  // it a second time. Same "covers" rules the website uses (lib/data.ts).
  const includedByPackage: Record<string, string[]> = {};
  for (const p of packages) {
    const cats = coveredCategoriesForKey(p.key) as string[];
    includedByPackage[p.key] = addOns.filter((a) => cats.includes(a.category)).map((a) => a.key);
  }

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

      <NewAppointmentForm
        packages={packages}
        addOns={addOns}
        includedByPackage={includedByPackage}
        todayISO={salonNow().dateISO}
      />
    </>
  );
}
