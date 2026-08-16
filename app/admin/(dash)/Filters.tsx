"use client";
// Dynamic (type-to-filter) admin filters. Each control updates the URL's search
// params live — text is debounced, selects/dates apply instantly — so the server
// component re-renders filtered results with no "Search" button.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { ALL_STATUSES, STATUS_LABEL } from "@/lib/status";
import { ALL_SOURCES, SOURCE_LABEL } from "@/lib/source";
import { addDaysISO } from "@/lib/time";

const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 9,
  border: "1px solid var(--adm-line)",
};

function useUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (patch: Record<string, string>) => {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
}

// `date` here is the RESOLVED selection: an ISO date, or "all" for every date.
// The page defaults it to today, so clearing the input must mean "all" — dropping
// the param would just snap back to today and the salon could never see history.
export function AppointmentFilters({
  date: d0 = "",
  status: s0 = "",
  source: src0 = "",
  q: q0 = "",
  todayISO,
}: {
  date?: string;
  status?: string;
  source?: string;
  q?: string;
  todayISO: string;
}) {
  const setUrl = useUrl();
  const [date, setDate] = useState(d0);
  const [status, setStatus] = useState(s0);
  const [source, setSource] = useState(src0);
  const [q, setQ] = useState(q0);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const changeQ = (v: string) => {
    setQ(v);
    clearTimeout(t.current);
    t.current = setTimeout(() => setUrl({ q: v.trim() }), 300);
  };
  const goDate = (v: string) => {
    setDate(v);
    setUrl({ date: v });
  };
  const reset = () => {
    setDate(todayISO);
    setStatus("");
    setSource("");
    setQ("");
    // No date param = today, the default view.
    setUrl({ date: "", status: "", source: "", q: "" });
  };
  const allDates = date === "all";

  return (
    <div className="adm-filters" style={{ gap: 10 }}>
      <input
        type="date"
        value={allDates ? "" : date}
        onChange={(e) => goDate(e.target.value || "all")}
        style={inputStyle}
        aria-label="Show one date"
      />
      <button
        type="button"
        className={`adm-chip ${date === todayISO ? "active" : ""}`}
        onClick={() => goDate(todayISO)}
      >
        Today
      </button>
      <button
        type="button"
        className={`adm-chip ${allDates ? "active" : ""}`}
        onClick={() => goDate("all")}
      >
        All dates
      </button>
      <select
        value={status}
        onChange={(e) => { setStatus(e.target.value); setUrl({ status: e.target.value }); }}
        style={inputStyle}
      >
        <option value="">All statuses</option>
        {ALL_STATUSES.map((s) => (
          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
        ))}
      </select>
      {/* The day list mixes online reservations and walk-ins, so it has to be
          able to show one kind at a time — "how many walked in today?" is a
          question the salon asks of this page, not only of the reports. */}
      <select
        value={source}
        onChange={(e) => { setSource(e.target.value); setUrl({ source: e.target.value }); }}
        style={inputStyle}
        aria-label="Booking source"
      >
        <option value="">Online + walk-in</option>
        {ALL_SOURCES.map((s) => (
          <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
        ))}
      </select>
      <input
        type="text"
        value={q}
        onChange={(e) => changeQ(e.target.value)}
        placeholder="Search pet / phone / code…"
        style={{ ...inputStyle, minWidth: 220 }}
      />
      {/* Only offer Reset when the view has actually moved off the default (today). */}
      {(date !== todayISO || status || source || q) && (
        <button type="button" className="adm-btn" onClick={reset}>Reset</button>
      )}
    </div>
  );
}

// Slot-map controls: the date being viewed (with one-tap day stepping — the
// salon browses day by day far more often than it picks a date) plus an optional
// "does this service fit?" overlay.
export function SlotFilters({
  date,
  pkg: p0 = "",
  packages,
  todayISO,
}: {
  date: string;
  pkg?: string;
  packages: { key: string; name: string; durationMin: number }[];
  todayISO: string;
}) {
  const setUrl = useUrl();
  const [pkg, setPkg] = useState(p0);
  const go = (d: string) => setUrl({ date: d });

  return (
    <div className="adm-filters" style={{ gap: 10 }}>
      <div className="adm-daynav">
        <button type="button" className="adm-btn" onClick={() => go(addDaysISO(date, -1))} aria-label="Previous day">
          ‹
        </button>
        <input type="date" value={date} onChange={(e) => e.target.value && go(e.target.value)} style={inputStyle} />
        <button type="button" className="adm-btn" onClick={() => go(addDaysISO(date, 1))} aria-label="Next day">
          ›
        </button>
      </div>
      <button
        type="button"
        className="adm-btn"
        onClick={() => go(todayISO)}
        disabled={date === todayISO}
      >
        Today
      </button>
      <select
        value={pkg}
        onChange={(e) => { setPkg(e.target.value); setUrl({ pkg: e.target.value }); }}
        style={inputStyle}
        aria-label="Check where a service fits"
      >
        <option value="">Show every slot</option>
        {packages.map((p) => (
          <option key={p.key} value={p.key}>
            Room for: {p.name} ({p.durationMin} min)
          </option>
        ))}
      </select>
    </div>
  );
}

export function CustomerSearch({ q: q0 = "" }: { q?: string }) {
  const setUrl = useUrl();
  const [q, setQ] = useState(q0);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const change = (v: string) => {
    setQ(v);
    clearTimeout(t.current);
    t.current = setTimeout(() => setUrl({ q: v.trim() }), 300);
  };
  return (
    <div className="adm-filters">
      <input
        type="text"
        value={q}
        onChange={(e) => change(e.target.value)}
        placeholder="Search by phone, pet or email…"
        style={{ ...inputStyle, padding: "8px 11px", minWidth: 260 }}
      />
      {q && (
        <button type="button" className="adm-btn" onClick={() => change("")}>Clear</button>
      )}
    </div>
  );
}

// Live date range (used by Pending custom range + Reports). `extra` keeps a fixed
// param such as range=custom on every update.
export function LiveDateRange({
  from: f0 = "",
  to: t0 = "",
  extra = {},
  labelFrom = "From",
  labelTo = "to",
}: {
  from?: string;
  to?: string;
  extra?: Record<string, string>;
  labelFrom?: string;
  labelTo?: string;
}) {
  const setUrl = useUrl();
  const [from, setFrom] = useState(f0);
  const [to, setTo] = useState(t0);
  return (
    <div className="adm-filters" style={{ marginTop: 12 }}>
      <span className="adm-note">{labelFrom}</span>
      <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setUrl({ ...extra, from: e.target.value }); }} style={inputStyle} />
      <span className="adm-note">{labelTo}</span>
      <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setUrl({ ...extra, to: e.target.value }); }} style={inputStyle} />
    </div>
  );
}

// Reports: which period is being looked at, and which one.
//
// Two rows, because they answer two different questions. The chips pick the
// SHAPE of the period — today, this week, this month, or two dates of the
// admin's own — and always jump to the current one, which is what their labels
// promise. The ‹ date › row then walks that same shape backwards and forwards
// through history, one day/week/month/span at a time.
//
// One plain date input drives day, week and month, on purpose. `<input
// type="week">` and `<input type="month">` exist, but Firefox renders both as
// bare text boxes — the salon would be typing "2026-W33" by hand on half the
// browsers it might open this on. A date everyone can pick, snapped to its week
// or month by lib/reporting.ts, asks the same question with none of that.
export function ReportPeriodFilters({
  period,
  anchor,
  prevISO,
  nextISO,
  todayISO,
  rangeLabel,
  fromISO,
  toISO,
  spanDays,
}: {
  period: string;
  anchor: string;
  prevISO: string;
  nextISO: string;
  todayISO: string;
  rangeLabel: string;
  /** The resolved range — also the starting value of the custom From/To pair. */
  fromISO: string;
  toISO: string;
  /** Length of the current custom range, so ‹ › can step by exactly that. */
  spanDays: number;
}) {
  const setUrl = useUrl();
  const [date, setDate] = useState(anchor);
  const [from, setFrom] = useState(fromISO);
  const [to, setTo] = useState(toISO);
  const custom = period === "custom";

  const go = (patch: Record<string, string>) => {
    if (patch.date) setDate(patch.date);
    setUrl(patch);
  };
  // Stepping a custom range keeps its length: "the previous 10 days" is one tap
  // rather than two dates retyped.
  const goCustom = (startISO: string) => {
    const endISO = addDaysISO(startISO, Math.max(1, spanDays) - 1);
    setFrom(startISO);
    setTo(endISO);
    setUrl({ period: "custom", date: "", from: startISO, to: endISO });
  };

  const PERIODS: { value: string; label: string }[] = [
    { value: "day", label: "Today" },
    { value: "week", label: "This week" },
    { value: "month", label: "This month" },
    { value: "custom", label: "Custom range" },
  ];
  const pick =
    { day: "Date", week: "Any day in the week", month: "Any day in the month" }[period] ?? "Date";

  return (
    <>
      <div className="adm-filters" style={{ gap: 10 }}>
        <div className="adm-chips" style={{ margin: 0 }}>
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`adm-chip ${period === p.value ? "adm-chip-on" : ""}`}
              // A chip means what it says: it lands on the CURRENT day / week /
              // month, not on whichever one the ‹ › buttons wandered off to.
              onClick={() =>
                p.value === "custom"
                  ? goCustom(from || todayISO)
                  : go({ period: p.value, date: todayISO, from: "", to: "" })
              }
              aria-pressed={period === p.value}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="adm-daynav">
          <button
            type="button"
            className="adm-btn"
            onClick={() => (custom ? goCustom(prevISO) : go({ date: prevISO }))}
            aria-label={custom ? "Previous range" : `Previous ${period}`}
          >
            ‹
          </button>
          {custom ? (
            <span className="adm-note" style={{ padding: "0 4px" }}>
              {spanDays} day{spanDays === 1 ? "" : "s"}
            </span>
          ) : (
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && go({ date: e.target.value })}
              style={inputStyle}
              aria-label={pick}
            />
          )}
          <button
            type="button"
            className="adm-btn"
            onClick={() => (custom ? goCustom(nextISO) : go({ date: nextISO }))}
            aria-label={custom ? "Next range" : `Next ${period}`}
          >
            ›
          </button>
        </div>

        {!custom && (
          <button
            type="button"
            className="adm-btn"
            onClick={() => go({ date: todayISO })}
            disabled={date === todayISO}
          >
            Today
          </button>
        )}
        <span className="adm-note">
          Showing <strong>{rangeLabel}</strong>
        </span>
      </div>

      {/* Applied on a button, not on every keystroke like the other filters on
          this page: a range is two fields, and re-querying between them means
          the admin watches the whole report redraw for a From with last year's
          To still in the box. */}
      {custom && (
        <div className="adm-filters" style={{ gap: 10, marginTop: 12 }}>
          {/* Label and input in one <label> so a phone wraps the PAIR, never a
              lonely "To" at the end of a line with its box on the next. */}
          <label className="adm-daterange">
            <span className="adm-note">From</span>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label className="adm-daterange">
            <span className="adm-note">To</span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              style={inputStyle}
            />
          </label>
          <button
            type="button"
            className="adm-btn adm-btn-primary"
            onClick={() => setUrl({ period: "custom", date: "", from, to })}
            disabled={!from && !to}
          >
            Apply
          </button>
          {(from !== fromISO || to !== toISO) && (
            <span className="adm-note">Not applied yet — press Apply.</span>
          )}
        </div>
      )}
    </>
  );
}
