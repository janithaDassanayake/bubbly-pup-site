// Server-only query helpers for the admin portal (dashboard + reports).
import { AppointmentStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "./db";
import { salonNow, dateOnly, addDaysISO } from "./time";

export async function dashboardStats() {
  const { dateISO } = salonNow();
  const today = dateOnly(dateISO);

  const [todays, upcoming, byStatusToday, revenueToday] = await Promise.all([
    prisma.appointment.findMany({
      where: { date: today },
      include: { customer: true, pet: true, package: true },
      orderBy: { startMin: "asc" },
    }),
    prisma.appointment.findMany({
      where: {
        date: { gt: today },
        status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] },
      },
      include: { customer: true, pet: true, package: true },
      orderBy: [{ date: "asc" }, { startMin: "asc" }],
      take: 8,
    }),
    prisma.appointment.groupBy({
      by: ["status"],
      where: { date: today },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: { status: PaymentStatus.PAID, paidDate: { gte: today, lt: dateOnly(addDaysISO(dateISO, 1)) } },
      _sum: { amount: true },
    }),
  ]);

  const count = (s: AppointmentStatus) =>
    byStatusToday.find((r) => r.status === s)?._count ?? 0;

  return {
    dateISO,
    todays,
    upcoming,
    counts: {
      total: todays.length,
      pending: count(AppointmentStatus.PENDING_CONFIRMATION),
      confirmed: count(AppointmentStatus.CONFIRMED),
      completed: count(AppointmentStatus.COMPLETED),
      cancelled: count(AppointmentStatus.CANCELLED),
      noShow: count(AppointmentStatus.NO_SHOW),
    },
    revenueToday: revenueToday._sum.amount ?? 0,
  };
}

// Reports over a date range (inclusive ISO dates).
export async function reportData(fromISO: string, toISO: string) {
  const from = dateOnly(fromISO);
  const toExcl = dateOnly(addDaysISO(toISO, 1));

  const [payments, appts, popularPackages, frequentCustomers] = await Promise.all([
    prisma.payment.findMany({
      where: { status: PaymentStatus.PAID, paidDate: { gte: from, lt: toExcl } },
      select: { amount: true, method: true, paidDate: true },
    }),
    prisma.appointment.groupBy({
      by: ["status"],
      where: { date: { gte: from, lt: toExcl } },
      _count: true,
    }),
    prisma.appointment.groupBy({
      by: ["packageId"],
      where: { date: { gte: from, lt: toExcl } },
      _count: true,
      orderBy: { _count: { packageId: "desc" } },
      take: 6,
    }),
    prisma.appointment.groupBy({
      by: ["customerId"],
      where: { date: { gte: from, lt: toExcl } },
      _count: true,
      orderBy: { _count: { customerId: "desc" } },
      take: 6,
    }),
  ]);

  const totalRevenue = payments.reduce((s, p) => s + p.amount, 0);
  const byMethod = payments.reduce<Record<string, number>>((m, p) => {
    const k = p.method ?? "UNKNOWN";
    m[k] = (m[k] ?? 0) + p.amount;
    return m;
  }, {});

  const statusCount = (s: AppointmentStatus) =>
    appts.find((r) => r.status === s)?._count ?? 0;

  // Resolve names for the grouped ids.
  const pkgIds = popularPackages.map((p) => p.packageId);
  const custIds = frequentCustomers.map((c) => c.customerId);
  const [pkgs, custs] = await Promise.all([
    prisma.package.findMany({ where: { id: { in: pkgIds } }, select: { id: true, name: true } }),
    prisma.customer.findMany({ where: { id: { in: custIds } }, select: { id: true, name: true, phone: true } }),
  ]);
  const pkgName = (id: string) => pkgs.find((p) => p.id === id)?.name ?? id;
  const cust = (id: string) => custs.find((c) => c.id === id);

  return {
    totalRevenue,
    byMethod,
    paymentCount: payments.length,
    completed: statusCount(AppointmentStatus.COMPLETED),
    cancelled: statusCount(AppointmentStatus.CANCELLED),
    noShow: statusCount(AppointmentStatus.NO_SHOW),
    popularPackages: popularPackages.map((p) => ({ name: pkgName(p.packageId), count: p._count })),
    // `name` is only set for customers saved before the salon stopped asking
    // for one; the phone is what identifies the row either way.
    frequentCustomers: frequentCustomers.map((c) => ({
      name: cust(c.customerId)?.name ?? null,
      phone: cust(c.customerId)?.phone ?? "",
      visits: c._count,
    })),
  };
}
