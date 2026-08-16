// Where a booking came from — the one place the wording and the colours live.
//
// Two ways in, and the salon needs to tell them apart at a glance on the day
// list: a slot the customer reserved on the website, and one the salon entered
// itself. They behave differently downstream (an online reservation has a
// WhatsApp thread and a booking code the customer is holding; a walk-in may not
// even have a number), so the distinction is stored, not guessed.
import { AppointmentSource } from "@prisma/client";

export const SOURCE_LABEL: Record<AppointmentSource, string> = {
  ONLINE: "Online Reservation",
  WALK_IN: "Walk-In",
};

// Room is tight in a table cell and on a phone card — the long label is the
// title attribute, this is what's printed.
export const SOURCE_SHORT: Record<AppointmentSource, string> = {
  ONLINE: "Online",
  WALK_IN: "Walk-in",
};

export const SOURCE_GLYPH: Record<AppointmentSource, string> = {
  ONLINE: "🌐",
  WALK_IN: "🚶",
};

export const ALL_SOURCES: AppointmentSource[] = ["ONLINE", "WALK_IN"];

export const isSource = (v: string | undefined | null): v is AppointmentSource =>
  v === "ONLINE" || v === "WALK_IN";
