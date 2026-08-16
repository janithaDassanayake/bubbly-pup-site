// The Reports page charts.
//
// Server components with no chart library and no client JavaScript. Three
// reasons, in order of how much they matter here:
//
//  1. The numbers are already computed on the server by lib/reporting.ts.
//     Shipping them to the browser only to have a library draw the same bars is
//     work the salon's phone does not need to do.
//  2. Every chart below is geometry a browser can lay out on its own — stacked
//     columns are flexbox, a trend is one SVG path, a donut is two dashed arcs.
//  3. The hover layer is `:hover` in CSS (see admin.css), so it costs nothing
//     and can't break. Its readout sits in a FIXED corner of the plot rather
//     than following the column: a tooltip anchored to a 12px-wide column is
//     clipped by the card on the first and last one, and no amount of CSS knows
//     how wide the tooltip turned out to be.
//
// Colour carries one meaning across every chart on the page: pink is ONLINE,
// blue is WALK-IN, everywhere, always. The pair is validated for colour-vision
// deficiency (worst-case ΔE 12.0 protan / 32.5 tritan against a white surface,
// well over the ≥8 target), and every chart also names both series in a legend
// and in the tables underneath — identity is never carried by colour alone.
import type { Bucket, Grain, TrendPoint } from "@/lib/reporting";
import { formatLKR } from "@/lib/format";

type Metric = "money" | "count";

const pick = (b: Bucket, metric: Metric) =>
  metric === "money"
    ? { online: b.revenueBySource.online, walkIn: b.revenueBySource.walkIn }
    : { online: b.bySource.online, walkIn: b.bySource.walkIn };

const fullValue = (v: number, metric: Metric) =>
  metric === "money" ? formatLKR(v) : String(v);

/** Axis ticks only. "Rs." on all five would be four repetitions of the unit. */
function compact(v: number, metric: Metric): string {
  if (metric === "count") return String(Math.round(v));
  if (v >= 1_000_000) return `${+(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${+(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(v));
}

/**
 * A round number to top the axis at, and the four steps below it.
 *
 * The rungs are close together on purpose. A coarse ladder (1 · 2 · 5 · 10) tops
 * a peak of 10 appointments out at 20 and draws the whole month in the bottom
 * half of the plot; 3 and 4 exist so the tallest column nearly fills it.
 *
 * Every rung must land on a whole number, because both axes are counted in
 * whole things — an axis reading 0 · 2.5 · 5 · 7.5 · 10 appointments offers to
 * measure half a dog, and rupees are not billed in halves either.
 */
function axisTicks(max: number, metric: Metric): { ceiling: number; ticks: number[] } {
  const divisions = 4;
  const raw = Math.max(max, 1) / divisions;
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(raw, 1)))));
  const ladder = metric === "count" ? [1, 2, 3, 4, 5, 10] : [1, 1.5, 2, 2.5, 3, 4, 5, 10];
  const step =
    (ladder.find((m) => m * mag >= raw && Number.isInteger(m * mag)) ?? 10) * mag;
  const ceiling = step * divisions;
  return {
    ceiling,
    // Top first: the axis column is read top-to-bottom.
    ticks: Array.from({ length: divisions + 1 }, (_, i) => ceiling - i * step),
  };
}

// Shown on both trend charts and both donuts, so it is one component.
function Legend() {
  return (
    <ul className="rep-legend">
      <li>
        <span className="rep-key rep-key-online" aria-hidden />
        Online
      </li>
      <li>
        <span className="rep-key rep-key-walkin" aria-hidden />
        Walk-in
      </li>
    </ul>
  );
}

/** The readout that appears in the plot's top corner while a column is hovered. */
function Readout({ p, metric }: { p: TrendPoint; metric: Metric }) {
  const v = pick(p.bucket, metric);
  return (
    <div className="rep-readout" role="presentation">
      <strong>{p.label}</strong>
      <span>
        <i className="rep-key rep-key-online" aria-hidden />
        Online <b>{fullValue(v.online, metric)}</b>
      </span>
      <span>
        <i className="rep-key rep-key-walkin" aria-hidden />
        Walk-in <b>{fullValue(v.walkIn, metric)}</b>
      </span>
      <span className="rep-readout-total">
        Total <b>{fullValue(v.online + v.walkIn, metric)}</b>
      </span>
    </div>
  );
}

/**
 * Revenue or appointments across the range, split by where the booking came
 * from. Stacked, never side-by-side: the question the salon asks first is "how
 * did that day go", and a stack answers it with the height of one column.
 *
 * Two shapes, one dataset. An area reads a long stretch of days as a shape and
 * is what `reporting.md` asks for; columns read a short one as separate days.
 * Below three points an area has nothing to slope between, so it falls back.
 */
export function TrendChart({
  title,
  note,
  points,
  grain,
  metric,
  shape = "bars",
}: {
  title: string;
  note: string;
  points: TrendPoint[];
  grain: Grain;
  metric: Metric;
  shape?: "bars" | "area";
}) {
  const n = points.length;
  const totals = points.map((p) => {
    const v = pick(p.bucket, metric);
    return v.online + v.walkIn;
  });
  const peak = Math.max(0, ...totals);
  const { ceiling, ticks } = axisTicks(peak, metric);
  const asArea = shape === "area" && n >= 3;

  // With 31 columns there is room for about eight dates. Always label the first
  // and the last, then every `stride`-th in between — a half-labelled axis whose
  // ends are missing reads as a chart that starts nowhere.
  const stride = Math.max(1, Math.ceil(n / 8));
  const labelled = (i: number) => i === 0 || i === n - 1 || i % stride === 0;

  const grandTotal = totals.reduce((s, v) => s + v, 0);

  return (
    <div className="adm-card rep-card">
      <div className="adm-card-head">
        <div>
          <h2>{title}</h2>
          <p>{note}</p>
        </div>
        <Legend />
      </div>
      <div className="adm-card-body">
        {peak <= 0 ? (
          <div className="adm-empty">
            <div className="big">📊</div>
            Nothing to chart — no {metric === "money" ? "settled revenue" : "appointments"} in
            this period.
          </div>
        ) : (
          <>
            <div
              className="rep-chart"
              role="img"
              aria-label={`${title}, ${grain} by ${grain}. Total ${fullValue(grandTotal, metric)}. The figures are listed in the tables below.`}
            >
              <div className="rep-axis" aria-hidden>
                {ticks.map((t) => (
                  <span key={t}>{compact(t, metric)}</span>
                ))}
              </div>

              <div className="rep-plot">
                <div className="rep-grid" aria-hidden>
                  {ticks.map((t) => (
                    <i key={t} />
                  ))}
                </div>

                {asArea && <AreaBands points={points} metric={metric} ceiling={ceiling} />}

                {/* One hit column per point, drawn over the plot whichever shape
                    is underneath. In `bars` mode it also holds the bars. */}
                <div className="rep-cols">
                  {points.map((p, i) => {
                    const v = pick(p.bucket, metric);
                    const total = v.online + v.walkIn;
                    return (
                      <div className="rep-col" key={p.key}>
                        {!asArea && total > 0 && (
                          <span className="rep-stack">
                            {v.walkIn > 0 && (
                              <span
                                className="rep-seg rep-seg-walkin rep-seg-top"
                                style={{ height: `${(v.walkIn / ceiling) * 100}%` }}
                              />
                            )}
                            {v.online > 0 && (
                              <span
                                className={`rep-seg rep-seg-online${v.walkIn > 0 ? "" : " rep-seg-top"}`}
                                style={{ height: `${(v.online / ceiling) * 100}%` }}
                              />
                            )}
                          </span>
                        )}
                        <Readout p={p} metric={metric} />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Inside the chart grid, not below it — that is what keeps every
                  label under the column it names as the plot resizes. */}
              <div className="rep-xaxis" aria-hidden>
                {points.map((p, i) => (
                  <span key={p.key}>{labelled(i) ? p.short : ""}</span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The stacked area itself.
 *
 * Drawn in a 0–100 box stretched to the plot (`preserveAspectRatio="none"`), so
 * it is responsive without a resize listener. Every stroke is
 * `non-scaling-stroke`, which is what stops that stretch from turning a 2px line
 * into a 6px one on a wide screen — the whole trick only works with it.
 */
function AreaBands({
  points,
  metric,
  ceiling,
}: {
  points: TrendPoint[];
  metric: Metric;
  ceiling: number;
}) {
  const n = points.length;
  // Point i sits at the CENTRE of hover column i, not at i/(n-1). The columns
  // are what the reader hovers and what the x labels are centred under, so an
  // area drawn edge-to-edge would sit up to half a column off its own labels —
  // 7% of the width on a week view. The two half-columns left over at the ends
  // are then filled by repeating the first and last value out to the edge, so
  // the band still reaches both sides.
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: number) => 100 - (v / ceiling) * 100;

  const online = points.map((p) => pick(p.bucket, metric).online);
  const stacked = points.map((p) => {
    const v = pick(p.bucket, metric);
    return v.online + v.walkIn;
  });

  const at = (vals: number[]) => [
    `0,${y(vals[0]).toFixed(3)}`,
    ...vals.map((v, i) => `${x(i).toFixed(3)},${y(v).toFixed(3)}`),
    `100,${y(vals[n - 1]).toFixed(3)}`,
  ];
  const onlineTop = at(online);
  const stackTop = at(stacked);

  return (
    <svg className="rep-area" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      {/* Walk-in sits on top of online, so its band is the gap between the two
          boundaries — filled first, then online paints over its own baseline. */}
      <path
        className="rep-fill-walkin"
        d={`M ${onlineTop.join(" L ")} L ${[...stackTop].reverse().join(" L ")} Z`}
      />
      <path className="rep-fill-online" d={`M 0,100 L ${onlineTop.join(" L ")} L 100,100 Z`} />
      {/* The 2px surface gap between the two fills, per the stacked-mark spec. */}
      <polyline className="rep-sep" points={onlineTop.join(" ")} />
      <polyline className="rep-line" points={stackTop.join(" ")} />
    </svg>
  );
}

/**
 * Online vs walk-in as a share of one whole — the one question a donut answers
 * better than a bar, because "what fraction" is the question being asked.
 *
 * The centre carries the total, and each side is directly labelled with its
 * value and share, so the ring is a picture of numbers that are also written
 * down. A reader who can't separate the two colours loses nothing.
 */
export function SourceDonut({
  title,
  note,
  online,
  walkIn,
  metric,
}: {
  title: string;
  note: string;
  online: number;
  walkIn: number;
  metric: Metric;
}) {
  const total = online + walkIn;
  const share = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  const R = 52;
  const C = 2 * Math.PI * R;
  const onlineLen = total > 0 ? (online / total) * C : 0;
  // A 3-unit notch at each join is the surface gap. With one side at zero there
  // is no join, and cutting a notch into a full ring would invent a boundary
  // where there isn't one.
  const split = online > 0 && walkIn > 0;
  const gap = split ? 3 : 0;

  return (
    <div className="adm-card rep-card">
      <div className="adm-card-head">
        <div>
          <h2>{title}</h2>
          <p>{note}</p>
        </div>
        <Legend />
      </div>
      <div className="adm-card-body">
        {total <= 0 ? (
          <div className="adm-empty">
            <div className="big">🍩</div>
            Nothing recorded in this period.
          </div>
        ) : (
          <div className="rep-split">
            <div className="rep-donut">
              <svg viewBox="0 0 140 140" role="img" aria-label={`${title}: online ${fullValue(online, metric)}, walk-in ${fullValue(walkIn, metric)}`}>
                <g transform="rotate(-90 70 70)" fill="none" strokeWidth={18}>
                  <circle className="rep-track" cx={70} cy={70} r={R} strokeWidth={18} />
                  {online > 0 && (
                    <circle
                      className="rep-arc-online"
                      cx={70}
                      cy={70}
                      r={R}
                      strokeDasharray={`${Math.max(0, onlineLen - gap)} ${C - Math.max(0, onlineLen - gap)}`}
                    />
                  )}
                  {walkIn > 0 && (
                    <circle
                      className="rep-arc-walkin"
                      cx={70}
                      cy={70}
                      r={R}
                      strokeDasharray={`${Math.max(0, C - onlineLen - gap)} ${onlineLen + gap}`}
                      strokeDashoffset={-onlineLen}
                    />
                  )}
                </g>
              </svg>
              <div className="rep-donut-mid">
                <span className="v">{fullValue(total, metric)}</span>
                <span className="k">total</span>
              </div>
            </div>

            <dl className="rep-keys">
              <div>
                <dt>
                  <span className="rep-key rep-key-online" aria-hidden />
                  Online
                </dt>
                <dd>
                  <strong>{fullValue(online, metric)}</strong>
                  <span className="adm-note">{share(online)}% of the total</span>
                </dd>
              </div>
              <div>
                <dt>
                  <span className="rep-key rep-key-walkin" aria-hidden />
                  Walk-in
                </dt>
                <dd>
                  <strong>{fullValue(walkIn, metric)}</strong>
                  <span className="adm-note">{share(walkIn)}% of the total</span>
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
