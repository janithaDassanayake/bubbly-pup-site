"use client";
// Closed days, chosen from a calendar instead of typed.
//
// Typing "2026-12-25, 2027-01-01" into a textarea invited typos that silently
// dropped a holiday (the server regex discards anything malformed) — and a
// dropped holiday means the salon takes bookings on a day it's shut. A date
// input can't produce an invalid date, and each day shows as a chip you can
// remove.
//
// Values submit as repeated hidden `holidays` fields, which `formData.getAll`
// on the server already handles.
import { useState } from "react";

const label = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

const isPast = (iso: string, todayISO: string) => iso < todayISO;

export default function HolidayPicker({
  initial,
  todayISO,
}: {
  initial: string[];
  todayISO: string;
}) {
  // Sorted so the next closure is always at the top.
  const [days, setDays] = useState<string[]>(() => [...new Set(initial)].sort());
  const [pick, setPick] = useState("");
  const [msg, setMsg] = useState("");

  const add = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pick)) return;
    if (days.includes(pick)) {
      setMsg("That day is already closed.");
      setPick("");
      return;
    }
    setDays((d) => [...d, pick].sort());
    setPick("");
    setMsg("");
  };

  const remove = (iso: string) => {
    setDays((d) => d.filter((x) => x !== iso));
    setMsg("");
  };

  const upcoming = days.filter((d) => !isPast(d, todayISO));
  const past = days.filter((d) => isPast(d, todayISO));

  return (
    <div className="adm-field">
      <label htmlFor="holiday-pick">Closed days (holidays)</label>

      {/* What actually gets submitted. */}
      {days.map((d) => (
        <input key={d} type="hidden" name="holidays" value={d} />
      ))}

      <div className="adm-holiday-add">
        <input
          id="holiday-pick"
          type="date"
          value={pick}
          min={todayISO}
          onChange={(e) => {
            setPick(e.target.value);
            setMsg("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault(); // don't submit the whole settings form
              add();
            }
          }}
        />
        <button type="button" className="adm-btn adm-btn-sm" onClick={add} disabled={!pick}>
          + Add closed day
        </button>
      </div>

      {days.length === 0 ? (
        <span className="adm-note">No closed days set — the salon takes bookings on every working day.</span>
      ) : (
        <div className="adm-holidays">
          {upcoming.map((d) => (
            <span key={d} className="adm-holiday">
              📅 {label(d)}
              <button type="button" onClick={() => remove(d)} aria-label={`Remove ${d}`}>
                ×
              </button>
            </span>
          ))}
          {past.map((d) => (
            <span key={d} className="adm-holiday adm-holiday-past">
              {label(d)}
              <button type="button" onClick={() => remove(d)} aria-label={`Remove ${d}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <span className="adm-note">
          Greyed dates have already passed — safe to remove.
        </span>
      )}
      {msg && <span className="adm-note" style={{ color: "#c0392b" }}>{msg}</span>}
      <span className="adm-note">Bookings are blocked on these days.</span>
    </div>
  );
}
