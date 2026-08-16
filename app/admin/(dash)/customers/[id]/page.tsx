import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDateLabel } from "@/lib/time";
import { to12h } from "@/lib/booking-engine";
import { formatLKR, customerLabel } from "@/lib/format";
import { petIcon } from "@/lib/pet";
import StatusBadge from "../../StatusBadge";
import EditContact from "./EditContact";

export const dynamic = "force-dynamic";

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      pets: true,
      appointments: {
        include: { package: true, pet: true, payment: true },
        orderBy: [{ date: "desc" }, { startMin: "desc" }],
      },
    },
  });
  if (!customer) notFound();

  const paid = customer.appointments.reduce((s, a) => s + (a.payment?.amount ?? 0), 0);

  return (
    <>
      <div className="adm-head">
        <div>
          {/* The pets are the heading now — a nameless customer would otherwise
              be a page titled with the phone number printed again below it. */}
          <h1>
            {customer.pets.length
              ? customer.pets.map((p) => `${petIcon(p.species)} ${p.name}`).join(", ")
              : customerLabel(customer)}
          </h1>
          {customer.name && <p className="adm-note">{customer.name}</p>}
          <EditContact
            id={customer.id}
            phone={customer.phone}
            email={customer.email}
          />
        </div>
        <Link href="/admin/customers" className="adm-btn">← Back</Link>
      </div>

      <div className="adm-grid adm-stats" style={{ marginBottom: 16 }}>
        <div className="adm-tile"><div className="k">Total visits</div><div className="v">{customer.appointments.length}</div></div>
        <div className="adm-tile"><div className="k">Total paid</div><div className="v">{formatLKR(paid)}</div></div>
        <div className="adm-tile"><div className="k">Pets</div><div className="v">{customer.pets.length}</div></div>
      </div>

      <div className="adm-card" style={{ marginBottom: 16 }}>
        <div className="adm-card-head"><h2>Pets</h2></div>
        <div className="adm-table-wrap">
          <table className="adm-table adm-cards">
            <thead>
              <tr><th>Name</th><th>Breed</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {customer.pets.map((p) => (
                <tr key={p.id}>
                  <td className="adm-strong" data-label="Name">{petIcon(p.species)} {p.name}</td>
                  {/* A cat has no breed by design — say so, rather than leaving
                      a dash that reads as a detail somebody forgot. */}
                  <td data-label="Breed">{p.breed || (p.species === "CAT" ? "n/a for cats" : "—")}</td>
                  <td className="adm-note" data-label="Notes">{p.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-card-head"><h2>Visit history</h2></div>
        {customer.appointments.length === 0 ? (
          <div className="adm-empty">No visits yet.</div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table adm-cards">
              <thead>
                <tr><th>Code</th><th>When</th><th>Pet</th><th>Package</th><th>Paid</th><th>Status</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {customer.appointments.map((a) => (
                  <tr key={a.id}>
                    <td className="adm-code" data-label="Code">{a.code}</td>
                    <td data-label="When">{formatDateLabel(a.date)}<br /><span className="adm-note">{to12h(a.startMin)}</span></td>
                    <td data-label="Pet">{a.pet.name}</td>
                    <td data-label="Package">{a.package.name}</td>
                    <td data-label="Paid">{a.payment?.amount ? formatLKR(a.payment.amount) : "—"}</td>
                    <td data-label="Status"><StatusBadge status={a.status} /></td>
                    <td className="adm-note" data-label="Notes">{a.notes || "—"}</td>
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
