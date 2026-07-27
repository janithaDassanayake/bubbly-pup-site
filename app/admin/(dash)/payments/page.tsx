import { AppointmentStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDateLabel } from "@/lib/time";
import { to12h } from "@/lib/booking-engine";
import { formatLKR } from "@/lib/format";
import { PayForm } from "../ActionButtons";

export const dynamic = "force-dynamic";

const METHOD_LABEL: Record<string, string> = { CASH: "Cash", CARD: "Card", BANK_TRANSFER: "Bank Transfer" };

export default async function PaymentsPage() {
  const [awaiting, recent] = await Promise.all([
    prisma.appointment.findMany({
      where: { status: { in: [AppointmentStatus.ARRIVED, AppointmentStatus.GROOMING_STARTED] } },
      include: { customer: true, pet: true, package: true, payment: true },
      orderBy: [{ date: "asc" }, { startMin: "asc" }],
    }),
    prisma.payment.findMany({
      where: { status: PaymentStatus.PAID },
      include: { appointment: { include: { customer: true, package: true } } },
      orderBy: { paidDate: "desc" },
      take: 50,
    }),
  ]);

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Payments</h1>
          <p>Collect payment in-salon — cash, card or bank transfer.</p>
        </div>
      </div>

      <div className="adm-card" style={{ marginBottom: 18 }}>
        <div className="adm-card-head"><h2>Awaiting payment</h2></div>
        {awaiting.length === 0 ? (
          <div className="adm-empty"><div className="big">💳</div>No visits awaiting payment.</div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table adm-cards">
              <thead>
                <tr><th>Code</th><th>Customer</th><th>Pet / Package</th><th>Estimate</th><th>Record payment</th></tr>
              </thead>
              <tbody>
                {awaiting.map((a) => (
                  <tr key={a.id}>
                    <td className="adm-code" data-label="Code">{a.code}</td>
                    <td data-label="Customer">{a.customer.name}<br /><span className="adm-note">{a.customer.phone}</span></td>
                    <td data-label="Pet / Package">{a.pet.name}<br /><span className="adm-note">{a.package.name}</span></td>
                    <td className="adm-strong" data-label="Estimate">{formatLKR(a.priceEstimate)}</td>
                    <td data-label="Do"><PayForm id={a.id} suggested={a.payment?.amount || a.priceEstimate} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="adm-card">
        <div className="adm-card-head"><h2>Recent payments</h2></div>
        {recent.length === 0 ? (
          <div className="adm-empty">No payments recorded yet.</div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table adm-cards">
              <thead>
                <tr><th>Paid on</th><th>Code</th><th>Customer</th><th>Package</th><th>Method</th><th>Amount</th></tr>
              </thead>
              <tbody>
                {recent.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Paid on">{p.paidDate ? formatDateLabel(p.paidDate) : "—"}</td>
                    <td className="adm-code" data-label="Code">{p.appointment.code}</td>
                    <td data-label="Customer">{p.appointment.customer.name}</td>
                    <td data-label="Package">{p.appointment.package.name}</td>
                    <td data-label="Method">{p.method ? METHOD_LABEL[p.method] : "—"}</td>
                    <td className="adm-strong" data-label="Amount">{formatLKR(p.amount)}</td>
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
