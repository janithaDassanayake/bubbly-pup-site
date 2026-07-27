import { NextResponse } from "next/server";
import { rangeDayAvailability } from "@/lib/day-availability";
import { salonNow } from "@/lib/time";

export const dynamic = "force-dynamic";

// GET /api/availability/days?from=YYYY-MM-DD&days=31&packageKey=wash-premium
// → { todayISO, days: [{ dateISO, status: "past"|"closed"|"full"|"open",
//                        reason?: "holiday"|"closed-day", free }] }
//
// Feeds the customer's booking calendar so closed days, holidays and fully
// booked days are visible BEFORE a date is picked. `packageKey` is optional:
// without it the counts are plain free slots, with it they're start times where
// that service actually fits.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const { dateISO: todayISO } = salonNow();

  const from = searchParams.get("from");
  const fromISO = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : todayISO;

  const raw = Number(searchParams.get("days") ?? 31);
  const days = Number.isFinite(raw) ? raw : 31;

  const data = await rangeDayAvailability(
    fromISO,
    days,
    searchParams.get("packageKey") ?? undefined
  );
  return NextResponse.json(data);
}
