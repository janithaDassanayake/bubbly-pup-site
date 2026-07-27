"use client";
// Dynamic (type-to-filter) admin filters. Each control updates the URL's search
// params live — text is debounced, selects/dates apply instantly — so the server
// component re-renders filtered results with no "Search" button.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { ALL_STATUSES, STATUS_LABEL } from "@/lib/status";
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
  q: q0 = "",
  todayISO,
}: {
  date?: string;
  status?: string;
  q?: string;
  todayISO: string;
}) {
  const setUrl = useUrl();
  const [date, setDate] = useState(d0);
  const [status, setStatus] = useState(s0);
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
    setQ("");
    setUrl({ date: "", status: "", q: "" }); // no date param = today, the default view
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
      <input
        type="text"
        value={q}
        onChange={(e) => changeQ(e.target.value)}
        placeholder="Search name / phone / code…"
        style={{ ...inputStyle, minWidth: 220 }}
      />
      {/* Only offer Reset when the view has actually moved off the default (today). */}
      {(date !== todayISO || status || q) && (
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
        placeholder="Search by name, phone or email…"
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
