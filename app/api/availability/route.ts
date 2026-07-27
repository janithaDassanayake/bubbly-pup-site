import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSettings, toBusinessRules, bookedIntervals } from "@/lib/settings";
import { generateSlotGrid, to12h, toMinutes } from "@/lib/booking-engine";
import { salonNow } from "@/lib/time";

export const dynamic = "force-dynamic";

// GET /api/availability?date=YYYY-MM-DD&packageKey=wash-premium
// → { durationMin, slots: [{ value: "14:00", label: "02:00 PM" }] }
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const packageKey = searchParams.get("packageKey");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "A valid date (YYYY-MM-DD) is required." }, { status: 400 });
  }
  if (!packageKey) {
    return NextResponse.json({ error: "packageKey is required." }, { status: 400 });
  }

  const pkg = await prisma.package.findUnique({ where: { key: packageKey } });
  if (!pkg || !pkg.active) {
    return NextResponse.json({ error: "Unknown package." }, { status: 404 });
  }

  const settings = await getSettings();
  const rules = toBusinessRules(settings);
  const existing = await bookedIntervals(date);

  const now = salonNow();
  const nowMin = date === now.dateISO ? now.nowMin : undefined;

  // The whole grid, with unavailable times MARKED rather than removed, so the
  // customer can see the salon is busy at 10:00 instead of wondering why the
  // time vanished. `slots` stays free-only for anything still reading it.
  const grid = generateSlotGrid({
    dateISO: date,
    durationMin: pkg.durationMin,
    gapMin: pkg.startGapMin,
    rules,
    existing,
    nowMin,
    todayISO: now.dateISO,
  }).map((s) => ({ ...s, label: to12h(toMinutes(s.value)) }));

  return NextResponse.json({
    durationMin: pkg.durationMin,
    slots: grid.filter((s) => !s.taken).map(({ value, label }) => ({ value, label })),
    grid,
  });
}
