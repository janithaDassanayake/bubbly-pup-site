"use client";
// Edit form for an existing booking. Mirrors the manual-booking form so the
// salon reads availability the same way in both places, with one difference:
// the availability call passes `exclude=<id>` so this appointment isn't counted
// as a conflict with itself.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAppointment } from "../../../../actions";
import { formatLKR } from "@/lib/format";

type Pkg = { key: string; name: string; durationMin: number; price: number; standalone: boolean };
type AddOn = { key: string; name: string; price: number; group: string; category: string };
type Slot = { value: string; label: string; taken?: boolean; reason?: "booked" | "passed" };

type Appt = {
  id: string;
  code: string;
  packageKey: string;
  packageName: string;
  addOnKeys: string[];
  dateISO: string;
  start: string;
  startLabel: string;
  notes: string;
  priceEstimate: number;
  /** manual adjustment already on the booking, or null when it's priced by the rules */
  priceOverride: number | null;
};

export default function EditAppointmentForm({
  appointment,
  packages,
  addOns,
  includedByPackage,
  todayISO,
}: {
  appointment: Appt;
  packages: Pkg[];
  addOns: AddOn[];
  // package key → add-on keys that package already includes. Marked, never
  // removed: staff can still add a second bath, just not by accident.
  includedByPackage: Record<string, string[]>;
  todayISO: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [packageKey, setPackageKey] = useState(appointment.packageKey);
  const [picked, setPicked] = useState<string[]>(appointment.addOnKeys);
  const [date, setDate] = useState(appointment.dateISO);
  const [slot, setSlot] = useState(appointment.start);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [notes, setNotes] = useState(appointment.notes);
  const [queueUpdate, setQueueUpdate] = useState(true);
  const [error, setError] = useState("");
  // The final price the customer pays. It follows the calculated total until
  // the admin types their own figure — after that it's theirs to control, and
  // `manual` is what stops a package change from wiping out an agreed discount.
  const [manual, setManual] = useState(appointment.priceOverride != null);
  const [finalPriceInput, setFinalPriceInput] = useState(
    String(appointment.priceOverride ?? appointment.priceEstimate)
  );

  const pkg = packages.find((p) => p.key === packageKey);
  const chosenAddOns = addOns.filter((a) => picked.includes(a.key));
  // Standalone rows carry duration for a visit with no package — the services
  // ARE the price, so the row's own price is not added on top.
  const total =
    (pkg?.standalone ? 0 : pkg?.price ?? 0) + chosenAddOns.reduce((s, a) => s + a.price, 0);

  // Blank means "no adjustment" — charge the calculated total.
  const typed = finalPriceInput.trim();
  const entered = typed === "" ? null : Math.round(Number(typed));
  const enteredValid = entered === null || (Number.isFinite(entered) && entered >= 0);
  const finalTotal = entered !== null && enteredValid ? entered : total;
  const adjustedBy = finalTotal - total;
  // What the booking is worth today, so "nothing changed" stays greyed out.
  const wasTotal = appointment.priceOverride ?? appointment.priceEstimate;
  const priceChanged = finalTotal !== wasTotal;
  const movedOrRescoped =
    packageKey !== appointment.packageKey ||
    date !== appointment.dateISO ||
    slot !== appointment.start;

  useEffect(() => {
    if (!packageKey || !date) {
      setSlots(null);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    fetch(
      `/api/availability?date=${date}&packageKey=${encodeURIComponent(
        packageKey
      )}&exclude=${encodeURIComponent(appointment.id)}`
    )
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { slots: Slot[]; grid?: Slot[] }) => {
        if (cancelled) return;
        const list = d.grid?.length ? d.grid : d.slots ?? [];
        setSlots(list);
        // A longer package may no longer fit where the old one did — clear the
        // selection rather than submitting a time the engine will reject.
        setSlot((s) => (s && !list.some((x) => x.value === s && !x.taken) ? "" : s));
      })
      .catch(() => !cancelled && setSlots([]))
      .finally(() => !cancelled && setSlotsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [packageKey, date, appointment.id]);

  // Re-scoping the visit re-prices it, unless the admin has already set the
  // price by hand — then their number stands and the calculated total below it
  // just moves, showing them what the change is worth.
  useEffect(() => {
    if (!manual) setFinalPriceInput(String(total));
  }, [total, manual]);

  const toggleAddOn = (key: string) =>
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!slot) {
      setError("Pick a time slot.");
      return;
    }
    if (!enteredValid) {
      setError("Enter the final price as a whole number of rupees, or leave it blank.");
      return;
    }
    start(async () => {
      const r = await updateAppointment({
        id: appointment.id,
        packageKey,
        addOnKeys: picked,
        date,
        start: slot,
        notes,
        finalPrice: entered,
        queueUpdate,
      }).catch(() => ({ ok: false, error: "Something went wrong. Please try again." }));

      if (!r.ok) {
        setError(r.error ?? "Could not save the changes.");
        return;
      }
      router.push("/admin/appointments");
      router.refresh();
    });
  };

  const grouped = addOns.reduce<Record<string, AddOn[]>>((acc, a) => {
    (acc[a.group] ??= []).push(a);
    return acc;
  }, {});

  return (
    <form onSubmit={submit} className="adm-card">
      <div className="adm-card-body">
        <div className="adm-field">
          <label htmlFor="package">Package / service</label>
          <select
            id="package"
            value={packageKey}
            onChange={(e) => setPackageKey(e.target.value)}
            required
          >
            {packages.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name} — {p.durationMin} min
                {p.standalone ? "" : ` · ${formatLKR(p.price)}`}
              </option>
            ))}
          </select>
          {pkg && pkg.durationMin !== undefined && (
            <p className="adm-note">
              Currently booked as <strong>{appointment.packageName}</strong> at{" "}
              {appointment.startLabel}. Changing the package changes how long the slot blocks the
              diary.
            </p>
          )}
        </div>

        {Object.entries(grouped).map(([group, items]) => (
          <div className="adm-field" key={group}>
            <label>{group}</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {items.map((a) => {
                const included = (includedByPackage[packageKey] ?? []).includes(a.key);
                return (
                  <label
                    key={a.key}
                    className={`adm-chip ${picked.includes(a.key) ? "adm-chip-on" : ""} ${
                      included ? "adm-chip-included" : ""
                    }`}
                    title={
                      included
                        ? "Already included in the chosen package — adding it charges for it a second time"
                        : undefined
                    }
                  >
                    <input
                      type="checkbox"
                      checked={picked.includes(a.key)}
                      onChange={() => toggleAddOn(a.key)}
                      style={{ marginRight: 6 }}
                    />
                    {a.name} · {formatLKR(a.price)}
                    {included && <span className="adm-chip-tag">in package</span>}
                  </label>
                );
              })}
            </div>
          </div>
        ))}

        <div className="adm-field">
          <label htmlFor="date">Date</label>
          <input
            id="date"
            type="date"
            value={date}
            min={todayISO}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        <div className="adm-field">
          <label>Time</label>
          {slotsLoading && <p className="adm-note">Checking availability…</p>}
          {!slotsLoading && slots && slots.length === 0 && (
            <p className="adm-error">No times available on that date for this package.</p>
          )}
          {!slotsLoading && slots && slots.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {slots.map((s) => (
                <button
                  type="button"
                  key={s.value}
                  disabled={s.taken}
                  onClick={() => setSlot(s.value)}
                  className={`adm-btn adm-btn-sm ${slot === s.value ? "adm-btn-primary" : ""}`}
                  title={
                    s.taken
                      ? s.reason === "passed"
                        ? "Already passed"
                        : "Already booked"
                      : undefined
                  }
                  style={s.taken ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="adm-field">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>

        {/* Manual price adjustment. The salon discounts a visit at the desk
            ("Rs. 4,000 package, take Rs. 2,000") and charges for extra work or
            extra time — neither is a different package, so neither belongs in
            the package/services picker. The calculated total stays on screen
            so it's always clear what's being adjusted from. */}
        <div className="adm-field">
          <label htmlFor="final-price">Final price (LKR)</label>
          <input
            id="final-price"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={finalPriceInput}
            onChange={(e) => {
              setManual(true);
              setFinalPriceInput(e.target.value);
            }}
          />
          <p className="adm-note">
            Calculated from the package and services: <strong>{formatLKR(total)}</strong>. Enter a
            different amount to give a discount or to charge for extra work or time — the amount
            here is the appointment total and what&apos;s collected on the payment screen.
          </p>
          {!enteredValid && (
            <p className="adm-error" style={{ margin: "6px 0 0" }}>
              Enter a whole number of rupees (0 or more).
            </p>
          )}
          {enteredValid && adjustedBy !== 0 && (
            <p className="adm-note" style={{ margin: "6px 0 0" }}>
              {adjustedBy < 0
                ? `Discount of ${formatLKR(-adjustedBy)} off the calculated total.`
                : `${formatLKR(adjustedBy)} added to the calculated total.`}{" "}
              <button
                type="button"
                className="adm-btn adm-btn-sm"
                onClick={() => {
                  setManual(false);
                  setFinalPriceInput(String(total));
                }}
              >
                Reset to {formatLKR(total)}
              </button>
            </p>
          )}
        </div>

        <div className="adm-field">
          <label className="adm-chip">
            <input
              type="checkbox"
              checked={queueUpdate}
              onChange={(e) => setQueueUpdate(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Queue a WhatsApp with the new details
          </label>
          <p className="adm-note">
            The customer is holding a message with the old time and package. This queues a
            corrected one on the WhatsApp page for you to send — it is not sent automatically.
          </p>
        </div>

        <div
          style={{
            borderTop: "1px solid rgba(0,0,0,.08)",
            paddingTop: 14,
            marginTop: 6,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <strong>Final total: {formatLKR(finalTotal)}</strong>
            {priceChanged && (
              <p className="adm-note" style={{ margin: 0 }}>
                was {formatLKR(wasTotal)} — this is what the customer pays and what the payment
                screen will ask for
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="adm-btn"
              onClick={() => router.push("/admin/appointments")}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="adm-btn adm-btn-primary"
              disabled={
                pending ||
                !enteredValid ||
                (!movedOrRescoped && !priceChanged && notes === appointment.notes)
              }
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>

        {error && (
          <p className="adm-error" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
