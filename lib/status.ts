// Appointment lifecycle (SRS "Appointment Status" + workflow). Single source of
// truth for labels, badge colours and which transitions are allowed from each
// state — used by the admin UI and enforced server-side.
import { AppointmentStatus } from "@prisma/client";

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING_CONFIRMATION: "Pending Confirmation",
  CONFIRMED: "Confirmed",
  NOT_SURE: "Not Sure",
  CANCELLED: "Cancelled",
  NO_SHOW: "No Show",
  ARRIVED: "Arrived",
  GROOMING_STARTED: "Grooming Started",
  GROOM_FINISHED: "Grooming Finished",
  PAID: "Paid",
  COMPLETED: "Completed",
};

// Badge palette (background, text) — pink-brand aligned, semantic where it helps.
export const STATUS_COLOR: Record<AppointmentStatus, { bg: string; fg: string }> = {
  PENDING_CONFIRMATION: { bg: "#fff4e5", fg: "#b26a00" },
  CONFIRMED: { bg: "#e6f4ff", fg: "#0b6bcb" },
  NOT_SURE: { bg: "#f3f0ff", fg: "#6b46c1" },
  CANCELLED: { bg: "#ffecec", fg: "#c0392b" },
  NO_SHOW: { bg: "#f2f2f2", fg: "#666" },
  ARRIVED: { bg: "#e8f7ee", fg: "#1c7c3f" },
  GROOMING_STARTED: { bg: "#ffe6f4", fg: "#db3a8d" },
  GROOM_FINISHED: { bg: "#fdeaf5", fg: "#a12a6b" },
  PAID: { bg: "#e8f7ee", fg: "#1c7c3f" },
  COMPLETED: { bg: "#eafbea", fg: "#2e7d32" },
};

const S = AppointmentStatus;

// Allowed next states. Empty = terminal.
//
// The working flow is deliberately three steps — Confirmed → Grooming Started →
// Paid & Completed — matching the progress trail the admin already reads. ARRIVED
// is never OFFERED as a next step (one tap fewer on a busy day); it survives only
// as a starting status for a walk-in, and such rows still flow on from here.
export const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING_CONFIRMATION: [S.CONFIRMED, S.NOT_SURE, S.CANCELLED, S.NO_SHOW],
  CONFIRMED: [S.GROOMING_STARTED, S.COMPLETED, S.CANCELLED, S.NO_SHOW],
  NOT_SURE: [S.CONFIRMED, S.CANCELLED, S.NO_SHOW],
  ARRIVED: [S.GROOMING_STARTED, S.COMPLETED, S.CANCELLED, S.NO_SHOW],
  // Completing also settles payment, so the final step is a single action.
  // (The photo flow's GROOMING_STARTED → GROOM_FINISHED step is parked; the
  // state is kept so existing rows stay valid and can still be completed.)
  GROOMING_STARTED: [S.COMPLETED],
  GROOM_FINISHED: [S.COMPLETED],
  PAID: [S.COMPLETED],
  CANCELLED: [],
  NO_SHOW: [],
  COMPLETED: [],
};

export const canTransition = (from: AppointmentStatus, to: AppointmentStatus) =>
  TRANSITIONS[from].includes(to);

// Statuses that release the time slot back to availability (SRS §9).
export const RELEASES_SLOT: AppointmentStatus[] = [S.CANCELLED, S.NO_SHOW];

// "Active" appointments still occupy the calendar.
export const ACTIVE_STATUSES: AppointmentStatus[] = Object.values(S).filter(
  (s) => !RELEASES_SLOT.includes(s)
);

export const ALL_STATUSES = Object.values(S);

// An appointment can be re-scoped — different package, add-ons, date or time —
// right up until the money is settled or the visit is over.
//
// Why this matters: a customer books the 2h full groom, then on the day wants
// the 1h basic. Without an edit the only options were cancel-and-rebook (which
// loses the booking code the customer already has in WhatsApp, and the history)
// or leaving the diary wrong — a 1h groom blocking a 2h slot all day.
//
// COMPLETED / PAID are excluded because reports and the payment record have
// already counted that price; CANCELLED / NO_SHOW because their slot is
// released and editing one would silently re-book released time.
export const EDITABLE_STATUSES: AppointmentStatus[] = [
  S.PENDING_CONFIRMATION,
  S.CONFIRMED,
  S.NOT_SURE,
  S.ARRIVED,
  S.GROOMING_STARTED,
  S.GROOM_FINISHED,
];

export const canEditAppointment = (s: AppointmentStatus) => EDITABLE_STATUSES.includes(s);
