import {
  buildReport,
  GRAIN_LABEL,
  isPeriod,
  normaliseCustom,
  trendPoints,
  type Bucket,
  type Period,
} from "@/lib/reporting";
import { reportData } from "@/lib/admin-data";
import { findPriceIssues } from "@/lib/price-audit";
import { salonNow } from "@/lib/time";
import { formatLKR, customerLabel } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { ReportPeriodFilters } from "../Filters";
import { SourceDonut, TrendChart } from "./Charts";

export const dynamic = "force-dynamic";

const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank Transfer",
  UNKNOWN: "Unknown",
};

// The revenue bar in a table cell. Length is relative to the biggest row in the
// same table, which is the only comparison the eye is making when it scans one.
function Bar({ value, max }: { value: number; max: number }) {
  if (value <= 0 || max <= 0) return null;
  return (
    <span
      className="adm-rep-bar"
      style={{ width: `${Math.max(2, Math.round((value / max) * 100))}%` }}
      aria-hidden
    />
  );
}

// Every breakdown table has the same five columns, so it is one component.
// Day-wise, weekly and monthly differ only in what a row is CALLED.
function BreakdownTable({
  title,
  note,
  head,
  rows,
  empty,
}: {
  title: string;
  note?: string;
  head: string;
  rows: { key: string; label: string; sub?: string; bucket: Bucket }[];
  empty: string;
}) {
  const max = Math.max(0, ...rows.map((r) => r.bucket.revenue));
  const total = rows.reduce((s, r) => s + r.bucket.revenue, 0);
  const count = rows.reduce((s, r) => s + r.bucket.appointments, 0);

  return (
    <div className="adm-card" style={{ marginBottom: 16 }}>
      <div className="adm-card-head">
        <h2>{title}</h2>
        {note ? <p>{note}</p> : null}
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table adm-cards">
          <thead>
            <tr>
              <th>{head}</th>
              <th className="adm-num">Appointments</th>
              <th className="adm-num">Online</th>
              <th className="adm-num">Walk-in</th>
              <th className="adm-num">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="adm-note">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.key}>
                  <td className="adm-strong" data-label={head}>
                    {r.label}
                    {r.sub ? (
                      <>
                        <br />
                        <span className="adm-note">{r.sub}</span>
                      </>
                    ) : null}
                  </td>
                  <td className="adm-num" data-label="Appointments">
                    {r.bucket.appointments}
                    {r.bucket.cancelled + r.bucket.noShow > 0 ? (
                      <>
                        <br />
                        <span className="adm-note">
                          +{r.bucket.cancelled + r.bucket.noShow} cancelled/no-show
                        </span>
                      </>
                    ) : null}
                  </td>
                  <td className="adm-num" data-label="Online">
                    {r.bucket.bySource.online}
                  </td>
                  <td className="adm-num" data-label="Walk-in">
                    {r.bucket.bySource.walkIn}
                  </td>
                  <td className="adm-num adm-strong" data-label="Revenue">
                    {formatLKR(r.bucket.revenue)}
                    <Bar value={r.bucket.revenue} max={max} />
                    {r.bucket.expected > 0 ? (
                      <>
                        <br />
                        <span className="adm-note">
                          {formatLKR(r.bucket.expected)} still owed
                        </span>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td className="adm-strong" data-label={head}>
                  Total
                </td>
                <td className="adm-num adm-strong" data-label="Appointments">
                  {count}
                </td>
                <td className="adm-num" data-label="Online">
                  {rows.reduce((s, r) => s + r.bucket.bySource.online, 0)}
                </td>
                <td className="adm-num" data-label="Walk-in">
                  {rows.reduce((s, r) => s + r.bucket.bySource.walkIn, 0)}
                </td>
                <td className="adm-num adm-strong" data-label="Revenue">
                  {formatLKR(total)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; date?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const { dateISO: todayISO } = salonNow();

  // Today by default — the page is opened to answer "how is today going".
  const period: Period = isPeriod(sp.period) ? sp.period : "day";
  const anchorISO = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : todayISO;
  // Normalised here as well as inside resolveRange, because the filter row needs
  // the same two dates back to put in its From/To boxes.
  const custom = normaliseCustom(sp.from, sp.to, anchorISO);

  // `r` is the day/week/month/custom view; `legacy` and `audit` keep the two
  // panels that were already here (payment method split, repeat customers, and
  // the pricing check) working over the same range.
  const r = await buildReport(period, anchorISO, custom);
  const [legacy, audit] = await Promise.all([
    reportData(r.fromISO, r.toISO),
    findPriceIssues(),
  ]);

  const t = r.totals;
  const served = t.appointments;
  const share = (v: number) => (served > 0 ? ` · ${Math.round((v / served) * 100)}% of visits` : "");
  const tiles = [
    {
      k: "Total Appointments",
      v: String(served),
      sub: `${t.bySource.online} online · ${t.bySource.walkIn} walk-in`,
    },
    {
      k: "Total Revenue",
      v: formatLKR(t.revenue),
      sub: `${t.paidCount} settled${t.expected > 0 ? ` · ${formatLKR(t.expected)} still owed` : ""}`,
    },
    {
      k: "Online Appointments",
      v: String(t.bySource.online),
      sub: `booked on the website${share(t.bySource.online)}`,
    },
    {
      k: "Walk-in Appointments",
      v: String(t.bySource.walkIn),
      sub: `taken at the counter or by phone${share(t.bySource.walkIn)}`,
    },
    {
      k: "Online Revenue",
      v: formatLKR(t.revenueBySource.online),
      sub: "settled by website customers",
    },
    {
      k: "Walk-in Revenue",
      v: formatLKR(t.revenueBySource.walkIn),
      sub: "settled by counter and phone customers",
    },
    {
      k: "Average per visit",
      v: served > 0 ? formatLKR(Math.round(t.revenue / served)) : "—",
      sub: served > 0 ? `over ${served} appointment${served === 1 ? "" : "s"}` : "nothing booked",
    },
    {
      k: "Cancelled / No-show",
      v: String(t.cancelled + t.noShow),
      sub: `${t.cancelled} cancelled · ${t.noShow} no-show`,
    },
  ];

  // Day by day up to a month, then week by week, then month by month — see
  // trendGrain. The charts and the tables underneath fold the same buckets, so
  // no reading of this page can disagree with another.
  const { grain, points } = trendPoints(r);
  // A day-wise table of a year is 366 rows nobody scrolls. Past two months the
  // weekly and monthly tables below are the readable breakdown, and the chart
  // has already switched to matching buckets.
  const showDayTable = r.dayCount <= 62;

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Reporting &amp; Analytics</h1>
          <p>
            {r.label}
            {r.dayCount > 1 ? ` · ${r.fromISO} → ${r.toISO}` : ""} · online
            reservations and walk-ins together
          </p>
        </div>
      </div>

      <div className="adm-card" style={{ marginBottom: 16 }}>
        <div className="adm-card-body">
          <ReportPeriodFilters
            period={r.period}
            anchor={r.anchorISO}
            prevISO={r.prevISO}
            nextISO={r.nextISO}
            todayISO={todayISO}
            rangeLabel={r.label}
            fromISO={r.fromISO}
            toISO={r.toISO}
            spanDays={r.dayCount}
          />
        </div>
      </div>

      <div className="adm-grid adm-stats adm-stats-wide" style={{ marginBottom: 18 }}>
        {tiles.map((tile) => (
          <div key={tile.k} className="adm-tile">
            <div className="k">{tile.k}</div>
            <div className="v">{tile.v}</div>
            <div className="sub">{tile.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts first, tables after: the picture answers "how did we do" in a
          glance, and the tables are there for the figure behind it. */}
      <TrendChart
        title="Revenue overview"
        note={`Settled revenue ${GRAIN_LABEL[grain]}, stacked by where the booking came from.`}
        points={points}
        grain={grain}
        metric="money"
        shape="area"
      />

      <TrendChart
        title="Appointment overview"
        note={`Appointments ${GRAIN_LABEL[grain]} — the tall columns are the busy ones.`}
        points={points}
        grain={grain}
        metric="count"
        shape="bars"
      />

      <div className="adm-grid adm-cols-2" style={{ marginBottom: 16 }}>
        <SourceDonut
          title="Online vs walk-in customers"
          note="Where this period's appointments came from."
          online={t.bySource.online}
          walkIn={t.bySource.walkIn}
          metric="count"
        />
        <SourceDonut
          title="Online vs walk-in revenue"
          note="Settled money, split the same way."
          online={t.revenueBySource.online}
          walkIn={t.revenueBySource.walkIn}
          metric="money"
        />
      </div>

      {/* Day-wise revenue. Shown for every period, including a single day —
          on "Today" it is one row, and that row IS the day's answer. */}
      {showDayTable ? (
        <BreakdownTable
          title="Day-wise revenue"
          note={
            r.dayCount === 1
              ? undefined
              : "Every day in the range, including the ones nobody came in — a missing row would read as data that failed to load."
          }
          head="Day"
          rows={r.days.map((d) => ({
            key: d.dateISO,
            label: d.label,
            sub: d.dateISO === todayISO ? "today" : undefined,
            bucket: d,
          }))}
          empty="Nothing in this range."
        />
      ) : (
        <p className="adm-note" style={{ marginBottom: 16 }}>
          {r.dayCount} days selected — too many for a day-by-day table. The weekly
          and monthly breakdowns below cover the same range.
        </p>
      )}

      {/* Weekly breakdown — the natural read for a month, and it still tells a
          single week where its Monday and Sunday fall. */}
      {r.dayCount > 1 && (
        <BreakdownTable
          title="Weekly revenue breakdown"
          note="Weeks run Monday to Sunday. A week straddling the edge of the range counts only the days inside it."
          head="Week"
          rows={r.weeks.map((w) => ({
            key: w.fromISO,
            label: w.label,
            sub: `${w.fromISO} → ${w.toISO}`,
            bucket: w,
          }))}
          empty="Nothing in this range."
        />
      )}

      {/* Monthly total. One row on the Monthly view; on a week that crosses the
          1st it is two, which is exactly the question that view raises. */}
      {r.period === "month" || r.months.length > 1 ? (
        <BreakdownTable
          title="Monthly total revenue"
          head="Month"
          rows={r.months.map((m) => ({ key: m.month, label: m.label, bucket: m }))}
          empty="Nothing in this range."
        />
      ) : null}

      <div className="adm-grid adm-cols-2" style={{ marginBottom: 16 }}>
        <div className="adm-card">
          <div className="adm-card-head">
            <h2>Services booked</h2>
            <p>Counted for every appointment; revenue counts the settled ones.</p>
          </div>
          <div className="adm-table-wrap">
            <table className="adm-table adm-cards">
              <thead>
                <tr>
                  <th>Service</th>
                  <th className="adm-num">Bookings</th>
                  <th className="adm-num">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {r.services.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="adm-note">
                      No data.
                    </td>
                  </tr>
                ) : (
                  r.services.map((s) => (
                    <tr key={s.name}>
                      <td data-label="Service">{s.name}</td>
                      <td className="adm-num adm-strong" data-label="Bookings">
                        {s.count}
                      </td>
                      <td className="adm-num" data-label="Revenue">
                        {formatLKR(s.revenue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-card-head">
            <h2>Payment summary</h2>
            {/* Keyed on the date the money was TAKEN, unlike everything above,
                which is keyed on the date of the visit. They differ whenever a
                groom is settled on a later day — worth stating rather than
                letting the two totals silently disagree. */}
            <p>By the day payment was received, so it may differ from revenue above.</p>
          </div>
          <div className="adm-table-wrap">
            <table className="adm-table adm-cards">
              <thead>
                <tr>
                  <th>Method</th>
                  <th className="adm-num">Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(legacy.byMethod).length === 0 ? (
                  <tr>
                    <td colSpan={2} className="adm-note">
                      No payments received in this range.
                    </td>
                  </tr>
                ) : (
                  Object.entries(legacy.byMethod).map(([m, amt]) => (
                    <tr key={m}>
                      <td data-label="Method">{METHOD_LABEL[m] ?? m}</td>
                      <td className="adm-num adm-strong" data-label="Total">
                        {formatLKR(amt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="adm-card" style={{ marginBottom: 16 }}>
        <div className="adm-card-head">
          <h2>Most frequent customers</h2>
          {/* A walk-in recorded without a number is its own row by design (see
              walkInPlaceholderPhone) — so it can never be the customer at the
              top of this table with hundreds of visits that belong to strangers. */}
          <p>Walk-ins recorded without a number show as one-off customers.</p>
        </div>
        <div className="adm-table-wrap">
          <table className="adm-table adm-cards">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th className="adm-num">Visits</th>
              </tr>
            </thead>
            <tbody>
              {legacy.frequentCustomers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="adm-note">
                    No data.
                  </td>
                </tr>
              ) : (
                legacy.frequentCustomers.map((c) => (
                  <tr key={c.phone}>
                    <td className="adm-strong" data-label="Customer">
                      {customerLabel(c)}
                    </td>
                    <td data-label="Phone">{formatPhone(c.phone)}</td>
                    <td className="adm-num" data-label="Visits">
                      {c.visits}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {r.bestDay && (
        <p className="adm-note" style={{ marginBottom: 16 }}>
          Best day in this range: <strong>{r.bestDay.label}</strong> —{" "}
          {formatLKR(r.bestDay.revenue)} from {r.bestDay.appointments} appointment
          {r.bestDay.appointments === 1 ? "" : "s"}.
        </p>
      )}

      {/* Price check — every appointment ever taken, not just the range:
          a wrong price doesn't stop mattering because the month rolled over. */}
      <div className="adm-card">
        <div className="adm-card-head">
          <h2>Price check</h2>
          <p>
            Appointments whose recorded price doesn&apos;t match the current pricing
            rules. Single-service bookings taken before 27 Jul 2026 were quoted the
            standalone duration row&apos;s price <em>on top of</em> the service itself —
            e.g. a Rs. 5,000 colouring recorded as Rs. 10,000. Nothing here is changed
            automatically. A walk-in priced by hand is not an error and is not listed:
            the typed figure is recorded as an adjustment, leaving the calculated
            estimate intact.
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
                          <span className="adm-note">{formatPhone(i.phone)}</span>
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
