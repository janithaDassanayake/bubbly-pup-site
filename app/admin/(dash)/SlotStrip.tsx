import { to12h } from "@/lib/booking-engine";

export type StripCell = {
  startMin: number;
  endMin: number;
  booked: unknown[];
  /** every place taken for this step */
  full: boolean;
  past: boolean;
  current: boolean;
};

// The whole day as one bar. THREE states, not two: the salon grooms more than
// one pet at a time, so a step holding one pet is still sellable. Painting it
// the same colour as a full step would hide capacity and cost bookings.
//   green  = empty
//   amber  = part taken, still room
//   pink   = full
//   grey   = time has passed
export default function SlotStrip({
  cells,
  capacity = 1,
}: {
  cells: StripCell[];
  capacity?: number;
}) {
  if (cells.length === 0) return null;
  return (
    <div className="adm-slotbar" aria-hidden="true">
      {cells.map((c) => {
        const state = c.full
          ? "booked"
          : c.booked.length
          ? "partial"
          : c.past
          ? "past"
          : "free";
        const label =
          state === "booked"
            ? "Full"
            : state === "partial"
            ? `${c.booked.length} of ${capacity} taken`
            : state === "past"
            ? "Gone"
            : "Free";
        return (
          <span
            key={c.startMin}
            className={`adm-sb adm-sb-${state}${c.current ? " adm-sb-now" : ""}`}
            title={`${to12h(c.startMin)}–${to12h(c.endMin)} · ${label}`}
          />
        );
      })}
    </div>
  );
}

// Colour key, kept next to the bar so nothing needs guessing. `partial` is
// hidden when the salon only takes one pet at a time — there'd be no such state.
export function SlotLegend({
  gone = true,
  partial = true,
}: {
  gone?: boolean;
  partial?: boolean;
}) {
  return (
    <div className="adm-legend">
      <span>
        <i className="adm-sb-free" /> Free
      </span>
      {partial && (
        <span>
          <i className="adm-sb-partial" /> Room for 1 more
        </span>
      )}
      <span>
        <i className="adm-sb-booked" /> Full
      </span>
      {gone && (
        <span>
          <i className="adm-sb-past" /> Time passed
        </span>
      )}
    </div>
  );
}
