import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { CustomerSearch } from "../Filters";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const where: Prisma.CustomerWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const customers = await prisma.customer.findMany({
    where,
    include: {
      pets: { select: { id: true, name: true } },
      _count: { select: { appointments: true } },
      appointments: { orderBy: { date: "desc" }, take: 1, select: { date: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Customers &amp; Pets</h1>
          <p>{customers.length} shown</p>
        </div>
      </div>

      <div className="adm-card" style={{ marginBottom: 16 }}>
        <div className="adm-card-body">
          <CustomerSearch q={q} />
        </div>
      </div>

      <div className="adm-card">
        {customers.length === 0 ? (
          <div className="adm-empty"><div className="big">🐶</div>No customers found.</div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table adm-cards">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Pets</th>
                  <th>Visits</th>
                  <th>Last visit</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td className="adm-strong" data-label="Customer">{c.name}</td>
                    <td data-label="Phone">{c.phone}</td>
                    <td data-label="Pets">{c.pets.map((p) => p.name).join(", ") || "—"}</td>
                    <td data-label="Visits">{c._count.appointments}</td>
                    <td data-label="Last visit">{c.appointments[0] ? c.appointments[0].date.toISOString().slice(0, 10) : "—"}</td>
                    <td data-label="Do">
                      <Link className="adm-btn adm-btn-sm" href={`/admin/customers/${c.id}`}>
                        View history →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
