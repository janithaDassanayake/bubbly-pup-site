import Link from "next/link";
import { prisma } from "@/lib/db";
import { salonNow } from "@/lib/time";
import { toHHMM } from "@/lib/booking-engine";
import { coveredCategoriesForKey } from "@/lib/data";
import WalkInForm from "./WalkInForm";

export const dynamic = "force-dynamic";

// Add Walk-In Customer — someone standing at the counter, or a call-in the
// salon took itself. Kept apart from /appointments/new (which mirrors the
// customer's reservation flow, six slots and all) because a walk-in isn't
// reserving anything: they are HERE, at whatever time it happens to be, and the
// price was agreed at the desk. See createWalkIn in app/admin/actions.ts.
export default async function WalkInPage() {
  const [packages, addOns] = await Promise.all([
    prisma.package.findMany({
      where: { active: true },
      orderBy: [{ standalone: "asc" }, { price: "desc" }],
      select: { key: true, name: true, price: true, standalone: true },
    }),
    prisma.addOn.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { key: true, name: true, price: true, group: true, category: true },
    }),
  ]);

  // What each package already covers, so a chip can say so before staff charge
  // for it twice. Same "covers" rules the website uses (lib/data.ts).
  const includedByPackage: Record<string, string[]> = {};
  for (const p of packages) {
    const cats = coveredCategoriesForKey(p.key) as string[];
    includedByPackage[p.key] = addOns.filter((a) => cats.includes(a.category)).map((a) => a.key);
  }

  const { dateISO, nowMin } = salonNow();

  return (
    <>
      {/* Just the way back: the form carries its own hero, so a second title
          here would say the same thing twice above the fold. */}
      <div className="adm-head">
        <Link href="/admin/appointments" className="adm-btn adm-btn-sm">
          ← Back to appointments
        </Link>
      </div>

      <WalkInForm
        packages={packages}
        addOns={addOns}
        includedByPackage={includedByPackage}
        todayISO={dateISO}
        nowHHMM={toHHMM(nowMin)}
      />
    </>
  );
}
