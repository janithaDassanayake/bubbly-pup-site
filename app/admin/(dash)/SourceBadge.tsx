import { AppointmentSource } from "@prisma/client";
import { SOURCE_GLYPH, SOURCE_LABEL, SOURCE_SHORT } from "@/lib/source";

// Where the booking came from, on the row itself. Deliberately its own badge
// rather than a word tucked into the customer cell: the day list mixes both
// kinds now, and "who booked this?" is a question staff ask of the whole
// column at a glance, not of one row at a time.
export default function SourceBadge({
  source,
  full = false,
}: {
  source: AppointmentSource;
  /** Print the long label ("Online Reservation") instead of the short one. */
  full?: boolean;
}) {
  return (
    <span
      className={`adm-src adm-src-${source === "WALK_IN" ? "walkin" : "online"}`}
      title={SOURCE_LABEL[source]}
    >
      <span aria-hidden>{SOURCE_GLYPH[source]}</span>{" "}
      {full ? SOURCE_LABEL[source] : SOURCE_SHORT[source]}
    </span>
  );
}
