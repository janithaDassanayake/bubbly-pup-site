import { reportData } from "@/lib/admin-data";
import { findPriceIssues } from "@/lib/price-audit";
import { salonNow } from "@/lib/time";
import { formatLKR } from "@/lib/format";
import { LiveDateRange } from "../Filters";

export const dynamic = "force-dynamic";

const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank Transfer",
  UNKNOWN: "Unknown",
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const { dateISO } = salonNow();
  const monthStart = dateISO.slice(0, 8) + "01";
  const fromISO = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : monthStart;
  const toISO = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : dateISO;

  const [r, audit] = await Promise.all([
    reportData(fromISO, toISO),
    findPriceIssues(),
  ]);

  const tiles = [
    { k: "Total Revenue", v: formatLKR(r.totalRevenue) },
    { k: "Payments", v: r.paymentCount },
    { k: "Completed", v: r.completed },
    { k: "Cancelled", v: r.cancelled },
    { k: "No Shows", v: r.noShow },
  ];

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Reports</h1>
          <p>{fromISO} → {toISO}</p>
        </div>
      </div>

      <div className="adm-card" style={{ marginBottom: 16 }}>
        <div className="adm-card-body">
          <LiveDateRange from={fromISO} to={toISO} labelTo="To" />
        </div>
      </div>

      <div className="adm-grid adm-stats" style={{ marginBottom: 18 }}>
        {tiles.map((t) => (
          <div key={t.k} className="adm-tile">
            <div className="k">{t.k}</div>
            <div className="v">{t.v}</div>
          </div>
        ))}
      </div>

      <div className="adm-grid adm-cols-2" style={{ marginBottom: 16 }}>
        <div className="adm-card">
          <div className="adm-card-head"><h2>Popular Packages</h2></div>
          <div className="adm-table-wrap">
            <table className="adm-table adm-cards">
              <thead><tr><th>Package</th><th>Bookings</th></tr></thead>
              <tbody>
                {r.popularPackages.length === 0 ? (
                  <tr><td colSpan={2} className="adm-note">No data.</td></tr>
                ) : r.popularPackages.map((p) => (
                  <tr key={p.name}><td data-label="Package">{p.name}</td><td className="adm-strong" data-label="Bookings">{p.count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-card-head"><h2>Payment Summary</h2></div>
          <div className="adm-table-wrap">
            <table className="adm-table adm-cards">
              <thead><tr><th>Method</th><th>Total</th></tr></thead>
              <tbody>
                {Object.keys(r.byMethod).length === 0 ? (
                  <tr><td colSpan={2} className="adm-note">No payments in range.</td></tr>
                ) : Object.entries(r.byMethod).map(([m, amt]) => (
                  <tr key={m}><td data-label="Method">{METHOD_LABEL[m] ?? m}</td><td className="adm-strong" data-label="Total">{formatLKR(amt)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-card-head"><h2>Most Frequent Customers</h2></div>
        <div className="adm-table-wrap">
          <table className="adm-table adm-cards">
            <thead><tr><th>Customer</th><th>Phone</th><th>Visits</th></tr></thead>
            <tbody>
              {r.frequentCustomers.length === 0 ? (
                <tr><td colSpan={3} className="adm-note">No data.</td></tr>
              ) : r.frequentCustomers.map((c) => (
                <tr key={c.phone + c.name}><td className="adm-strong" data-label="Customer">{c.name}</td><td data-label="Phone">{c.phone}</td><td data-label="Visits">{c.visits}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Price check — every appointment ever taken, not just the date range:
          a wrong price doesn't stop mattering because the month rolled over. */}
      <div className="adm-card" style={{ marginTop: 16 }}>
        <div className="adm-card-head">
          <h2>Price check</h2>
          <p>
            Appointments whose recorded price doesn&apos;t match the current pricing
            rules. Single-service bookings taken before 27 Jul 2026 were quoted the
            standalone duration row&apos;s price <em>on top of</em> the service itself —
            e.g. a Rs. 5,000 colouring recorded as Rs. 10,000. Nothing here is changed
            automatically.
          </p>
        </div>
        <div className="adm-card-body">
          {audit.issues.length === 0 ? (
            <div className="adm-empty">
              <div className="big">✅</div>
              All {audit.scanned} appointments match the current pricing rules.
            </div>
          ) : (
            <>
              <p className="adm-note" style={{ marginBottom: 12 }}>
                <strong>{audit.issues.length}</strong> of {audit.scanned} appointments
                affected · overcharged by <strong>{formatLKR(audit.overchargedTotal)}</strong>{" "}
                in total · <strong>{audit.paidCount}</strong> already settled.
              </p>
              <div className="adm-table-wrap">
                <table className="adm-table adm-cards">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Date</th>
                      <th>Customer</th>
                      <th>Booked</th>
                      <th>Recorded</th>
                      <th>Should be</th>
                      <th>Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.issues.map((i) => (
                      <tr key={i.id}>
                        <td className="adm-code" data-label="Code">{i.code}</td>
                        <td data-label="Date">{i.dateISO}</td>
                        <td data-label="Customer">
                          {i.customer}
                          <br />
                          <span className="adm-note">{i.phone}</span>
                        </td>
                        <td data-label="Booked">
                          {i.packageName}
                          {i.services.length > 0 && (
                            <>
                              <br />
                              <span className="adm-note">{i.services.join(", ")}</span>
                            </>
                          )}
                        </td>
                        <td data-label="Recorded">{formatLKR(i.recorded)}</td>
                        <td className="adm-strong" data-label="Should be">
                          {formatLKR(i.correct)}
                        </td>
                        <td data-label="Payment">
                          {i.paid ? (
                            <>
                              Paid {formatLKR(i.paidAmount ?? 0)}
                              <br />
                              <span className="adm-note">refund may be due</span>
                            </>
                          ) : (
                            <span className="adm-note">not settled — quote the correct price</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
