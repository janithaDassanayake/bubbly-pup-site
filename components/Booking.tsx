"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SITE,
  BOOKING_OPTIONS,
  SINGLE_SERVICE,
  ADD_ONS,
  addOnsFor,
  isServiceOnlyOption,
  priceToNumber,
  formatLKR,
  type AddOn,
} from "@/lib/data";
import { packageKeyForOption } from "@/lib/booking-map";
import { phoneProblem } from "@/lib/phone";
import { reservationRequestBody } from "@/lib/booking-message";
import { DOG_BREEDS } from "@/lib/breeds";
import styles from "./Booking.module.css";

// `taken` slots are still shown — greyed out and struck through — so the
// customer sees the salon is busy at that hour rather than the time simply
// disappearing from the list.
type Slot = { value: string; label: string; taken?: boolean; reason?: "booked" | "passed" };


type Form = {
  packageId: string;
  addOns: string[]; // selected add-on ids
  date: string;
  slot: string;
  ownerName: string;
  ownerPhone: string;
  dogName: string;
  dogAge: string;
  breed: string;
  aggressive: "" | "Yes" | "No";
  notes: string;
};

const EMPTY: Form = {
  packageId: "",
  addOns: [],
  date: "",
  slot: "",
  ownerName: "",
  ownerPhone: "",
  dogName: "",
  dogAge: "",
  breed: "",
  aggressive: "",
  notes: "",
};

export default function Booking({
  todayISO,
  options = BOOKING_OPTIONS,
  services = ADD_ONS,
}: {
  todayISO: string;
  // Bookable options and à-la-carte services with database prices, so the form
  // quotes what Settings says — and never offers a package the API would
  // refuse. Falls back to the compiled catalog (lib/pricing.ts does the same).
  options?: string[];
  services?: AddOn[];
}) {
  // The overlap rules (which add-ons a package already covers) stay in the
  // catalog; only the prices and what's active come from the database.
  const servicesFor = (packageName: string) => {
    const allowed = new Set(addOnsFor(packageName).map((a) => a.id));
    return services.filter((s) => allowed.has(s.id));
  };

  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Real availability fetched from the backend for the chosen package + date.
  // null = not yet loaded (fall back to static slots); [] = none available.
  const [apiSlots, setApiSlots] = useState<Slot[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Add-ons popup: the package awaiting confirmation + its ticked add-ons.
  const [modalPkg, setModalPkg] = useState<string | null>(null);
  const [modalAddOns, setModalAddOns] = useState<string[]>([]);

  // Answering "Yes" to the aggression question opens a notice the customer must
  // explicitly accept. "Yes" is only recorded once they do, so the booking can
  // never carry an aggressive dog without recorded consent.
  const [showAggressive, setShowAggressive] = useState(false);
  const [aggressiveAck, setAggressiveAck] = useState(false);
  const [ackChecked, setAckChecked] = useState(false);

  // Resolve the marketing option → backend catalog key (drives availability + save).
  const packageKey = useMemo(
    () => (form.packageId ? packageKeyForOption(form.packageId, form.addOns) : null),
    [form.packageId, form.addOns]
  );

  const update = (key: keyof Form, value: string) => {
    if (success) setSuccess("");
    setForm((f) => ({ ...f, [key]: value }));
  };

  const scrollToForm = () =>
    document.getElementById("booking")?.scrollIntoView({ behavior: "smooth" });

  // bp:book fires two ways:
  //  • string  → a package card → open the add-ons popup for it
  //  • {addOns} → services picked à la carte → go straight to the form
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string | { addOns: string[] }>).detail;
      if (typeof detail === "string") {
        if (!detail) return;
        setModalAddOns([]);
        setModalPkg(detail);
      } else if (detail && Array.isArray(detail.addOns)) {
        setForm((f) => ({
          ...f,
          packageId: SINGLE_SERVICE,
          addOns: detail.addOns,
        }));
        requestAnimationFrame(scrollToForm);
      }
    };
    window.addEventListener("bp:book", handler as EventListener);
    return () => window.removeEventListener("bp:book", handler as EventListener);
  }, []);

  // Load real, conflict-free time slots whenever the package + date are known.
  useEffect(() => {
    if (!packageKey || !form.date) {
      setApiSlots(null);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    fetch(`/api/availability?date=${form.date}&packageKey=${encodeURIComponent(packageKey)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { slots: Slot[]; grid?: Slot[] }) => {
        if (cancelled) return;
        // Prefer the full grid (free + taken); fall back to free-only.
        const list = data.grid?.length ? data.grid : data.slots ?? [];
        setApiSlots(list);
        // Drop a previously-picked slot if it's no longer BOOKABLE — someone may
        // have taken it while this form sat open.
        setForm((f) =>
          f.slot && !list.some((s) => s.value === f.slot && !s.taken) ? { ...f, slot: "" } : f
        );
      })
      .catch(() => !cancelled && setApiSlots(null)) // fall back to static slots
      .finally(() => !cancelled && setSlotsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [packageKey, form.date]);

  // Confirm the popup: apply package + chosen add-ons, then go to the form.
  const confirmModal = (addOns: string[]) => {
    setForm((f) => ({ ...f, packageId: modalPkg ?? "", addOns }));
    setModalPkg(null);
    requestAnimationFrame(scrollToForm);
  };

  const toggleModalAddOn = (id: string) =>
    setModalAddOns((a) =>
      a.includes(id) ? a.filter((x) => x !== id) : [...a, id]
    );

  const toggleFormAddOn = (id: string) =>
    setForm((f) => ({
      ...f,
      addOns: f.addOns.includes(id)
        ? f.addOns.filter((x) => x !== id)
        : [...f.addOns, id],
    }));

  // Changing the package prunes add-ons that no longer apply (no overlap).
  const changePackage = (name: string) => {
    if (success) setSuccess("");
    const allowed = new Set(servicesFor(name).map((a) => a.id));
    setForm((f) => ({
      ...f,
      packageId: name,
      addOns: f.addOns.filter((id) => allowed.has(id)),
    }));
  };

  const isSingle = form.packageId === SINGLE_SERVICE;
  // Single service → every à-la-carte service; a package → its filtered add-ons.
  const offered = isSingle
    ? services
    : form.packageId
    ? servicesFor(form.packageId)
    : [];

  // Human label for the chosen slot (API slots store HH:MM but display 12-hour).
  const slotLabel = apiSlots?.find((s) => s.value === form.slot)?.label ?? form.slot;
  const freeCount = (apiSlots ?? []).filter((s) => !s.taken).length;

  // Wording and layout live in `lib/booking-message.ts` so the message can be
  // rendered and reviewed without a browser; this only gathers the form state.
  const buildMessage = (code?: string) =>
    reservationRequestBody({
      code,
      isSingle,
      packageLabel: form.packageId,
      addOns: services.filter((a) => form.addOns.includes(a.id)),
      dateISO: form.date,
      slotLabel,
      ownerName: form.ownerName,
      ownerPhone: form.ownerPhone,
      dogName: form.dogName,
      dogAge: form.dogAge,
      breed: form.breed,
      aggressive: form.aggressive,
      notes: form.notes,
    });

  // Clears every field, selected services/add-ons, date, slot and the fetched
  // (reserved) availability — ready for a fresh booking.
  const resetForm = () => {
    setForm(EMPTY);
    setApiSlots(null);
    setModalPkg(null);
    setModalAddOns([]);
    setShowAggressive(false);
    setAggressiveAck(false);
    setAckChecked(false);
    setSubmitting(false);
  };

  // "No" is recorded straight away; "Yes" has to go through the consent notice.
  const chooseAggressive = (opt: "Yes" | "No") => {
    if (opt === "No") {
      update("aggressive", "No");
      setAggressiveAck(false);
      setAckChecked(false);
      return;
    }
    if (aggressiveAck) {
      update("aggressive", "Yes"); // already consented — don't nag on re-select
      return;
    }
    setAckChecked(false);
    setShowAggressive(true);
  };

  const acceptAggressive = () => {
    if (!ackChecked) return;
    update("aggressive", "Yes");
    setAggressiveAck(true);
    setShowAggressive(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // "Spa Treatments" and "Single service" have no package price of their own —
    // the services chosen ARE the booking, so one is required or there's nothing
    // to quote.
    if (isServiceOnlyOption(form.packageId) && form.addOns.length === 0) {
      setError("Please pick at least one service to continue.");
      return;
    }

    const required: [keyof Form, string][] = [
      ["packageId", "package"],
      ["date", "date"],
      ["slot", "time slot"],
      ["ownerName", "your name"],
      ["ownerPhone", "your phone number"],
      ["dogName", "your dog's name"],
      ["dogAge", "your dog's age"],
      ["breed", "your dog's breed"],
      ["aggressive", "whether your dog is aggressive"],
    ];
    const missing = required.find(([k]) => !String(form[k]).trim());
    if (missing) {
      setError(`Please fill in ${missing[1]} to continue.`);
      return;
    }

    // Every update we send goes to this number and nowhere else — catch a typo
    // here, while the customer is still on the page to fix it.
    const badPhone = phoneProblem(form.ownerPhone);
    if (badPhone) {
      setError(badPhone);
      return;
    }

    // Backstop for the consent gate — the notice normally can't be bypassed, but
    // the booking must never go through without it.
    if (form.aggressive === "Yes" && !aggressiveAck) {
      setAckChecked(false);
      setShowAggressive(true);
      setError("Please read and accept the aggressive-dog grooming conditions to continue.");
      return;
    }

    // Generate the booking code on the client so the WhatsApp message's admin link
    // and the saved appointment share the same reference. Only when we'll persist.
    const canPersist = !!packageKey && !!form.date && /^\d{2}:\d{2}$/.test(form.slot);
    // Refuse rather than pretend. Without this the customer saw "Reservation
    // sent!", WhatsApp opened, and the appointment never reached the salon.
    if (!canPersist) {
      setError("Please choose your package, date and time slot again — that time is no longer valid.");
      return;
    }
    const rand =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, "")
        : Math.random().toString(36).slice(2);
    const code = canPersist ? `BP-${rand.slice(0, 6).toUpperCase()}` : undefined;

    // Record the booking in the background — the server-side overlap check still
    // runs; we don't block the WhatsApp hand-off on it. Fire-and-forget.
    if (canPersist) {
      const petNotes = [
        // Record that the owner accepted the conditions — that's the point of the gate.
        `Aggressive: ${form.aggressive}${
          form.aggressive === "Yes" && aggressiveAck ? " (owner accepted grooming conditions)" : ""
        }`,
        form.notes.trim(),
      ]
        .filter(Boolean)
        .join(". ");
      fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          packageKey,
          addOnKeys: form.addOns,
          date: form.date,
          start: form.slot,
          owner: { name: form.ownerName.trim(), phone: form.ownerPhone.trim() },
          pet: {
            name: form.dogName.trim(),
            breed: form.breed,
            age: form.dogAge.trim(),
            gender: "UNKNOWN",
            notes: petNotes,
          },
          notes: form.notes.trim() || undefined,
        }),
      })
        .then(async (res) => {
          if (res.ok) return;
          // The slot was taken (409) or the request was rejected. WhatsApp has
          // already opened, so the salon will still see the request — but say so
          // rather than leaving the customer believing it's booked.
          const data = await res.json().catch(() => null);
          setSuccess("");
          setError(
            data?.error
              ? `${data.error} Please pick another time — your WhatsApp message was still sent to us.`
              : "We couldn't hold that slot. Please pick another time — your WhatsApp message was still sent to us."
          );
        })
        .catch(() => {
          setSuccess("");
          setError(
            "We couldn't reach our system, but your WhatsApp message was sent — we'll confirm your slot by reply."
          );
        });
    }

    const text = encodeURIComponent(buildMessage(code));
    const done = () => {
      resetForm();
      setSuccess(
        "🎉 Reservation sent! We've opened WhatsApp for you — just tap send. We'll confirm your slot shortly. 🐾"
      );
    };
    const isMobile =
      typeof navigator !== "undefined" &&
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

    if (isMobile) {
      // Open the WhatsApp APP directly (skips the wa.me web page that would be left
      // behind as a blank tab). This does NOT navigate our page — it stays & resets.
      window.location.href = `whatsapp://send?phone=${SITE.whatsapp}&text=${text}`;
      done();
    } else {
      // Desktop → the WhatsApp Web chat directly (no wa.me "Continue to Chat"
      // landing page). Opens in a new tab; this page stays intact & resets.
      const url = `https://web.whatsapp.com/send?phone=${SITE.whatsapp}&text=${text}`;
      const win = window.open(url, "_blank");
      if (win) done();
      else window.location.href = url;
    }
  };

  // min date = today
  // `todayISO` comes from the server's salon clock (Asia/Colombo) — the exact
  // date the booking API validates against. Computing it here with `new Date()`
  // would be wrong twice over: during SSR it's the server's UTC date (yesterday,
  // late at night in Sri Lanka), and it wouldn't match after hydration.
  const today = todayISO;

  return (
    <section id="booking" className={`section-pad ${styles.wrap}`}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.intro}>
          <span className="eyebrow" style={{ background: "rgba(255,255,255,.18)", color: "#fff" }}>
            📅 Make a Reservation
          </span>
          <h2 className={styles.title}>
            Book your pup&apos;s pampering in seconds
          </h2>
          <p className={styles.sub}>
            Fill in the details and we&apos;ll whisk your reservation straight to
            our WhatsApp. We&apos;ll confirm your slot in no time. 🐶💨
          </p>

          <ul className={styles.perks}>
            <li>✅ Instant booking via WhatsApp</li>
            <li>✅ Pay after service</li>
            <li>✅ 6 free add-ons included</li>
          </ul>

          <div className={styles.contactCard}>
            <span className={styles.waIcon}>💬</span>
            <div>
              <small>Prefer to chat first?</small>
              <a
                href={`https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(
                  "Hi Bubbly Pup Pet Grooming! I'd like to ask about grooming for my dog 🐾"
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {SITE.whatsappDisplay}
              </a>
            </div>
          </div>
        </div>

        <form className={styles.card} onSubmit={handleSubmit}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="package">Package *</label>
              <select
                id="package"
                value={form.packageId}
                onChange={(e) => changePackage(e.target.value)}
              >
                <option value="">Choose a package</option>
                {options.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            {/* Date sits beside the package, directly above the slot grid, so
                the "date → times" order still reads top to bottom and neither
                half of the row is left empty. */}
            <div className={styles.field}>
              <label htmlFor="date">Appointment Date *</label>
              <input
                id="date"
                type="date"
                min={today}
                value={form.date}
                onChange={(e) => update("date", e.target.value)}
              />
            </div>
          </div>

          {/* Full width — the slot grid needs the room to breathe. */}
          <div className={styles.fieldWide}>
            <div className={styles.field}>
              <label>Time Slot *</label>
              {/* A grid of real buttons rather than a <select>: browsers won't let
                  you style <option>, so a booked time could only be shown with
                  ugly strike-through characters. Here a taken slot can look
                  properly greyed and crossed — and it's a nicer thing to tap. */}
              {!form.packageId || !form.date ? (
                <p className={styles.slotHint}>
                  {!form.packageId ? "Choose a package first." : "Pick a date to see available times."}
                </p>
              ) : slotsLoading ? (
                <p className={styles.slotHint}>Loading available times…</p>
              ) : apiSlots === null ? (
                <p className={styles.slotHint}>Couldn&apos;t load times — check your connection.</p>
              ) : apiSlots.length === 0 ? (
                <p className={styles.slotHint}>We&apos;re closed on this date — please try another day.</p>
              ) : (
                <>
                  <div className={styles.slotGrid} role="group" aria-label="Available time slots">
                    {apiSlots.map((s) => {
                      const selected = form.slot === s.value;
                      return (
                        <button
                          key={s.value}
                          type="button"
                          className={`${styles.slot} ${selected ? styles.slotOn : ""} ${
                            s.taken ? styles.slotTaken : ""
                          }`}
                          disabled={s.taken}
                          aria-pressed={selected}
                          title={
                            s.taken
                              ? s.reason === "passed"
                                ? "This time has already passed"
                                : "Already booked"
                              : undefined
                          }
                          onClick={() => update("slot", s.value)}
                        >
                          <span className={styles.slotTime}>{s.label}</span>
                          {s.taken && (
                            <span className={styles.slotTag}>
                              {s.reason === "passed" ? "Passed" : "Booked"}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {freeCount === 0 && (
                    <p className={styles.slotHint}>
                      Fully booked on this date — please pick another day.
                    </p>
                  )}
                </>
              )}
              {form.date && apiSlots !== null && apiSlots.length > 0 && (
                <small style={{ color: "#db3a8d", fontSize: ".72rem", fontWeight: 600 }}>
                  ✓ Live availability — {freeCount} of {apiSlots.length} times free
                </small>
              )}
            </div>
          </div>

          {form.packageId && offered.length > 0 && (
            <div className={styles.field}>
              <label>
                {isSingle
                  ? "Choose your service(s) *"
                  : "Add extras? (optional)"}
              </label>
              <div className={styles.addons}>
                {offered.map((a) => {
                  const on = form.addOns.includes(a.id);
                  return (
                    <button
                      type="button"
                      key={a.id}
                      className={`${styles.addonChip} ${
                        on ? styles.addonOn : ""
                      }`}
                      onClick={() => toggleFormAddOn(a.id)}
                      aria-pressed={on}
                    >
                      <span className={styles.addonCheck}>{on ? "✓" : "+"}</span>
                      <span className={styles.addonLabel}>{a.label}</span>
                      <span className={styles.addonPrice}>{a.price}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Owner's name and number belong together — one person, one row. */}
          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="ownerName">Your Name *</label>
              <input
                id="ownerName"
                type="text"
                placeholder="e.g. Sahan"
                value={form.ownerName}
                onChange={(e) => update("ownerName", e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="ownerPhone">Your WhatsApp Number *</label>
              <input
                id="ownerPhone"
                type="tel"
                inputMode="tel"
                placeholder="e.g. 071 234 5678"
                value={form.ownerPhone}
                onChange={(e) => update("ownerPhone", e.target.value)}
              />
              <small style={{ color: "#9c2566", fontSize: ".75rem", fontWeight: 500 }}>
                💬 The number you actually chat on — we&apos;ll send updates here.
              </small>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="dogName">Dog&apos;s Name *</label>
              <input
                id="dogName"
                type="text"
                placeholder="e.g. Coco"
                value={form.dogName}
                onChange={(e) => update("dogName", e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="dogAge">Dog&apos;s Age *</label>
              <input
                id="dogAge"
                type="text"
                placeholder="e.g. 2 years"
                value={form.dogAge}
                onChange={(e) => update("dogAge", e.target.value)}
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="breed">Dog&apos;s Breed *</label>
              <select
                id="breed"
                value={form.breed}
                onChange={(e) => update("breed", e.target.value)}
              >
                <option value="">Select breed</option>
                {DOG_BREEDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label>Is your dog aggressive? *</label>
              <div className={styles.toggle}>
                {(["No", "Yes"] as const).map((opt) => (
                  <button
                    type="button"
                    key={opt}
                    className={`${styles.toggleBtn} ${
                      form.aggressive === opt ? styles.toggleOn : ""
                    }`}
                    onClick={() => chooseAggressive(opt)}
                  >
                    {opt === "No" ? "😊 No" : "⚠️ Yes"}
                  </button>
                ))}
              </div>
              {form.aggressive === "Yes" && aggressiveAck && (
                <small style={{ color: "#1c7c3f", fontSize: ".72rem", fontWeight: 600 }}>
                  ✓ Grooming conditions accepted
                </small>
              )}
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="notes">Anything else? (optional)</label>
            <textarea
              id="notes"
              rows={3}
              placeholder="Special requests, allergies, behaviour notes…"
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}
          {success && (
            <p
              style={{
                background: "#e8f7ee",
                color: "#1c7c3f",
                borderRadius: 12,
                padding: "12px 14px",
                fontSize: ".9rem",
                fontWeight: 600,
                margin: 0,
              }}
            >
              {success}
            </p>
          )}

          <button
            type="submit"
            className={`btn btn-whatsapp ${styles.submit}`}
            disabled={submitting}
          >
            <span className={styles.waGlyph}>💬</span>
            {submitting ? "Booking…" : "Send Reservation to WhatsApp"}
          </button>
          <p className={styles.fineprint}>
            Opens WhatsApp to {SITE.whatsappDisplay} with your details
            pre-filled. No payment needed to book.
          </p>
        </form>
      </div>

      {/* Add-ons popup — opens when a package card's "Book this package" is clicked */}
      {modalPkg && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Add extras to your booking"
          onClick={() => setModalPkg(null)}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Add some extras?</h3>
            <p className={styles.modalSub}>{modalPkg}</p>
            <div className={styles.modalList}>
              {servicesFor(modalPkg).map((a) => {
                const on = modalAddOns.includes(a.id);
                return (
                  <button
                    type="button"
                    key={a.id}
                    className={`${styles.addonChip} ${on ? styles.addonOn : ""}`}
                    onClick={() => toggleModalAddOn(a.id)}
                    aria-pressed={on}
                  >
                    <span className={styles.addonCheck}>{on ? "✓" : "+"}</span>
                    <span className={styles.addonLabel}>{a.label}</span>
                    <span className={styles.addonPrice}>{a.price}</span>
                  </button>
                );
              })}
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => confirmModal([])}
              >
                Skip
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => confirmModal(modalAddOns)}
              >
                Continue →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Aggressive-dog notice. Dismissing it without accepting leaves the answer
          unset, so "Yes" is only ever recorded alongside consent. */}
      {showAggressive && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="aggressive-title"
          onClick={() => setShowAggressive(false)}
        >
          <div
            className={`${styles.modal} ${styles.consentModal}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.consentHead}>
              <span className={styles.consentIcon} aria-hidden="true">
                ⚠️
              </span>
              <h3 className={styles.consentTitle} id="aggressive-title">
                Important Notice – Aggressive Dog
              </h3>
            </div>
            <div className={styles.consentBody}>
              <p>
                Grooming an aggressive or highly anxious dog can be challenging and may not
                always be possible to complete safely. Our groomers will always do their best
                to provide the requested grooming service while prioritizing the safety and
                well-being of your dog and our staff.
              </p>
              <p>
                If your dog shows severe aggression, attempts to bite, or becomes too
                distressed during grooming, we may need to pause, modify, or stop the grooming
                session. In such cases, some requested grooming services may not be completed.
              </p>
            </div>

            <div className={styles.consentFoot}>
              <label className={styles.consentCheck}>
                <input
                  type="checkbox"
                  checked={ackChecked}
                  onChange={(e) => setAckChecked(e.target.checked)}
                />
                <span>
                  I understand and accept the above conditions regarding grooming an
                  aggressive dog and agree to proceed with the appointment.
                </span>
              </label>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowAggressive(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={acceptAggressive}
                  disabled={!ackChecked}
                  aria-disabled={!ackChecked}
                >
                  Agree &amp; continue →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
