// Finds appointments whose recorded price doesn't match what the rules say it
// should be — built to surface one specific historical bug, but written as a
// general check so it keeps earning its place.
//
// The bug: the estimate was `package price + add-ons`, and for a SINGLE-service
// visit the "package" is a standalone container that only carries the duration
// ("Colouring Only", "Trim Only", "Spa Treatment"). Its price was added on top
// of the service the customer actually chose, so a Rs. 5,000 colouring was
// recorded as Rs. 10,000. Fixed in the booking API and the admin's manual
// booking; this reports the rows written before the fix.
//
// Read-only on purpose. It reports, it never rewrites — a recorded payment is a
// record of what changed hands, and only the salon can say what to do about it.
import { prisma } from "./db";
import { customerLabel } from "./format";

export type PriceIssue = {
  id: string;
  code: string;
  dateISO: string;
  customer: string;
  phone: string;
  packageName: string;
  services: string[];
  recorded: number; // what was stored on the appointment
  correct: number; // what today's rules give
  overBy: number;
  status: string;
  paid: boolean;
  paidAmount: number | null;
};

export async function findPriceIssues(): Promise<{
  issues: PriceIssue[];
  scanned: number;
  overchargedTotal: number;
  paidCount: number;
}> {
  const [appts, addOnRows] = await Promise.all([
    prisma.appointment.findMany({
      include: { package: true, customer: true, payment: true },
      orderBy: { date: "desc" },
    }),
    prisma.addOn.findMany(),
  ]);
  const addOnByKey = new Map(addOnRows.map((a) => [a.key, a]));

  const issues: PriceIssue[] = [];
  for (const a of appts) {
    const chosen = a.addOnKeys.flatMap((k) => {
      const row = addOnByKey.get(k);
      return row ? [row] : [];
    });
    const addOnTotal = chosen.reduce((s, x) => s + x.price, 0);
    // Same rule as app/api/bookings/route.ts — keep these two in step.
    const correct = a.package.standalone
      ? addOnTotal || a.package.price
      : a.package.price + addOnTotal;

    if (correct === a.priceEstimate) continue;

    issues.push({
      id: a.id,
      code: a.code,
      dateISO: a.date.toISOString().slice(0, 10),
      customer: customerLabel(a.customer),
      phone: a.customer.phone,
      packageName: a.package.name,
      services: chosen.map((x) => x.name),
      recorded: a.priceEstimate,
      correct,
      overBy: a.priceEstimate - correct,
      status: a.status,
      paid: a.payment?.status === "PAID",
      paidAmount: a.payment?.amount ?? null,
    });
  }

  return {
    issues,
    scanned: appts.length,
    overchargedTotal: issues.reduce((s, i) => s + Math.max(0, i.overBy), 0),
    paidCount: issues.filter((i) => i.paid).length,
  };
}
