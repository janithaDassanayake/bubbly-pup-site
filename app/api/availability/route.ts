import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSettings, toBusinessRules, bookedIntervals } from "@/lib/settings";
import { to12h, toMinutes } from "@/lib/booking-engine";
import { slotGrid } from "@/lib/booking-slots";
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
  // `exclude` is used by the admin edit screen so an appointment doesn't count
  // as a conflict with itself. It only changes which slots are DISPLAYED as
  // free; POST /api/bookings still validates against every booking, so this
  // can't be used to slip a real double booking past the engine.
  const existing = await bookedIntervals(date, searchParams.get("exclude") ?? undefined);

  const now = salonNow();
  const nowMin = date === now.dateISO ? now.nowMin : undefined;

  // The whole grid, with unavailable times MARKED rather than removed, so the
  // customer can see the salon is busy at 11:00 instead of wondering why the
  // time vanished. `slots` stays free-only for anything still reading it.
  //
  // The package no longer narrows availability: every booking takes one of the
  // two places in its 2-hour period whatever its length, so a 30-minute bath
  // and a 2-hour groom see exactly the same times. `durationMin` is still
  // returned — the appointment records it and the admin schedules by it.
  const grid = slotGrid({
    dateISO: date,
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
