"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SITE,
  BOOKING_OPTIONS,
  SINGLE_SERVICE,
  ADD_ONS,
  addOnsFor,
  isServiceOnlyOption,
  servicesForPet,
  priceToNumber,
  formatLKR,
  type AddOn,
} from "@/lib/data";
import { packageKeyForOption } from "@/lib/booking-map";
import { isValidPhone, phoneProblem } from "@/lib/phone";
import { reservationRequestBody } from "@/lib/booking-message";
import { DOG_BREEDS } from "@/lib/breeds";
import BookingCalendar from "./BookingCalendar";
import styles from "./Booking.module.css";

// `taken` slots are still shown — greyed out and struck through — so the
// customer sees the salon is busy at that hour rather than the time simply
// disappearing from the list.
type Slot = { value: string; label: string; taken?: boolean; reason?: "booked" | "passed" };

// The breed list we carry is dog breeds, and a cat groom isn't priced or planned
// by breed — so Cat hides the field entirely and drops it from validation. "" is
// the unanswered state: neither the breed field nor the pet wording below it can
// be right until the customer has told us which animal is coming.
type PetType = "" | "Dog" | "Cat";

// The form spells the answer "Dog"/"Cat" because that is what it shows and what
// the WhatsApp message quotes; a service is tagged in lowercase (lib/data.ts).
const speciesOf = (t: PetType) => (t === "Dog" ? "dog" : t === "Cat" ? "cat" : "") as
  | "dog"
  | "cat"
  | "";

const PET_TYPES = [
  { value: "Dog", label: "Dog", emoji: "🐶" },
  { value: "Cat", label: "Cat", emoji: "🐱" },
] as const;

type Form = {
  packageId: string;
  addOns: string[]; // selected add-on ids
  date: string;
  slot: string;
  ownerPhone: string;
  petType: PetType;
  petName: string;
  breed: string; // dogs only — always "" while Cat is selected
  aggressive: "" | "Yes" | "No";
  notes: string;
};

const EMPTY: Form = {
  packageId: "",
  addOns: [],
  date: "",
  slot: "",
  ownerPhone: "",
  petType: "",
  petName: "",
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

  // One reservation per number per day. Held as state rather than checked at
  // submit time because submit is too late: this form opens WhatsApp inside the
  // click gesture, so by the time an answer came back the customer would already
  // have told us they booked. Known before the tap, the button is simply off.
  const [alreadyBooked, setAlreadyBooked] = useState<{ timeLabel: string; message: string } | null>(
    null
  );

  // Add-ons popup: the package awaiting confirmation + its ticked add-ons.
  const [modalPkg, setModalPkg] = useState<string | null>(null);
  const [modalAddOns, setModalAddOns] = useState<string[]>([]);

  // Answering "Yes" to the aggression question opens a notice the customer must
  // explicitly accept. "Yes" is only recorded once they do, so the booking can
  // never carry an aggressive pet without recorded consent.
  const [showAggressive, setShowAggressive] = useState(false);
  const [aggressiveAck, setAggressiveAck] = useState(false);
  const [ackChecked, setAckChecked] = useState(false);

  // Resolve the marketing option → backend catalog key (drives availability + save).
  const packageKey = useMemo(
    () => (form.packageId ? packageKeyForOption(form.packageId, form.addOns) : null),
    [form.packageId, form.addOns]
  );

  // A validation message describes the form as it was when Submit was pressed,
  // so it must not outlive the fix. Without this the customer picks the very
  // date they were just asked for and "Please fill in date to continue." is
  // still sitting there — which reads as "I did that and it still won't take it",
  // and the usual next move is to press Submit again to find out why.
  //
  // Cleared on ANY field change rather than only the field named in the message:
  // the message names the FIRST thing missing, so filling in something else is
  // just as likely to have made it stale.
  const clearNotices = () => {
    if (success) setSuccess("");
    if (error) setError("");
  };

  const update = (key: keyof Form, value: string) => {
    clearNotices();
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

  // Ask as soon as the day and the number are both known -- and re-ask whenever
  // either changes, because moving the date is exactly how a customer blocked on
  // one day becomes free to book another. Debounced: the number is typed a digit
  // at a time, and every keystroke is not a question worth asking.
  useEffect(() => {
    const phone = form.ownerPhone.trim();
    if (!form.date || !isValidPhone(phone)) {
      setAlreadyBooked(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      const q = `/api/bookings/existing?date=${form.date}&phone=${encodeURIComponent(phone)}`;
      fetch(q)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: { booked: boolean; timeLabel?: string; message?: string }) => {
          if (cancelled) return;
          setAlreadyBooked(
            d.booked && d.timeLabel && d.message
              ? { timeLabel: d.timeLabel, message: d.message }
              : null
          );
        })
        // A check we could not run must not block a booking -- the POST still
        // enforces the rule, so failing open costs a confusing message at worst,
        // while failing closed would refuse a customer who has done nothing.
        .catch(() => !cancelled && setAlreadyBooked(null));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [form.date, form.ownerPhone]);

  // Confirm the popup: apply package + chosen add-ons, then go to the form.
  const confirmModal = (addOns: string[]) => {
    clearNotices();
    setForm((f) => ({ ...f, packageId: modalPkg ?? "", addOns }));
    setModalPkg(null);
    requestAnimationFrame(scrollToForm);
  };

  const toggleModalAddOn = (id: string) =>
    setModalAddOns((a) =>
      a.includes(id) ? a.filter((x) => x !== id) : [...a, id]
    );

  const toggleFormAddOn = (id: string) => {
    clearNotices();
    setForm((f) => ({
      ...f,
      addOns: f.addOns.includes(id)
        ? f.addOns.filter((x) => x !== id)
        : [...f.addOns, id],
    }));
  };

  // Changing the package prunes add-ons that no longer apply (no overlap).
  const changePackage = (name: string) => {
    clearNotices();
    const allowed = new Set(servicesFor(name).map((a) => a.id));
    setForm((f) => ({
      ...f,
      packageId: name,
      addOns: f.addOns.filter((id) => allowed.has(id)),
    }));
  };

  // Switching away from Dog drops any breed already chosen. Keeping it would
  // send a Labrador along with a cat booking — and the field is gone from the
  // form by then, so nobody could spot it or correct it. It also drops any
  // service the new pet cannot have: the price list sells "Cat Full Trim" with
  // no pet in the conversation, so a customer can arrive here with one already
  // ticked and only then tell us it is a dog.
  const changePetType = (type: Exclude<PetType, "">) => {
    clearNotices();
    const forPet = new Set(servicesForPet(services, speciesOf(type)).map((a) => a.id));
    setForm((f) => ({
      ...f,
      petType: type,
      breed: type === "Dog" ? f.breed : "",
      addOns: f.addOns.filter((id) => forPet.has(id)),
    }));
    setModalAddOns((ids) => ids.filter((id) => forPet.has(id)));
  };

  const isDog = form.petType === "Dog";
  // Every label that would otherwise say "dog" follows the choice — "your dog's
  // name" is the wrong question to ask someone booking a cat.
  const petNoun = form.petType === "Cat" ? "cat" : form.petType === "Dog" ? "dog" : "pet";
  const PetNoun = petNoun[0].toUpperCase() + petNoun.slice(1);

  const isSingle = form.packageId === SINGLE_SERVICE;
  // Single service → every à-la-carte service; a package → its filtered add-ons.
  // Either way the chosen pet has the last word — a dog is never offered a Cat
  // Full Trim, a cat is never offered the dog hygiene trim.
  const offered = servicesForPet(
    isSingle ? services : form.packageId ? servicesFor(form.packageId) : [],
    speciesOf(form.petType)
  );

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
      ownerPhone: form.ownerPhone,
      petType: form.petType,
      petName: form.petName,
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

    // "Spa & Treatments" and "Single service" have no package price of their own —
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
      ["ownerPhone", "your phone number"],
      ["petType", "whether you're bringing a dog or a cat"],
      ["petName", `your ${petNoun}'s name`],
      // Dogs only. A cat booking has no breed field on screen, so requiring one
      // would block the customer on something they cannot fill in.
      ...(isDog ? ([["breed", "your dog's breed"]] as [keyof Form, string][]) : []),
      ["aggressive", `whether your ${petNoun} is aggressive`],
    ];
    const missing = required.find(([k]) => !String(form[k]).trim());
    if (missing) {
      setError(`Please fill in ${missing[1]} to continue.`);
      return;
    }

    // Already holding a slot that day? Stop before the WhatsApp hand-off — once
    // that opens, the customer has told us they booked and nothing said
    // afterwards can take it back.
    if (alreadyBooked) {
      setError(alreadyBooked.message);
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
          owner: { phone: form.ownerPhone.trim() },
          pet: {
            name: form.petName.trim(),
            species: isDog ? "DOG" : "CAT",
            breed: form.breed || undefined, // cats are saved without one
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
            Book your pet&apos;s pampering in seconds
          </h2>
          <p className={styles.sub}>
            Fill in the details and we&apos;ll whisk your reservation straight to
            our WhatsApp. We&apos;ll confirm your slot in no time. 🐾💨
          </p>

          <ul className={styles.perks}>
            <li>✅ Instant booking via WhatsApp</li>
            <li>✅ Pay after service</li>
            {/* Was "6 free add-ons included" — see VALUE_PROPS in lib/data.ts
                for why that claim doesn't survive a read of the price cards. */}
            <li>✅ Bath, brushing, nails &amp; perfume included</li>
          </ul>

          <div className={styles.contactCard}>
            <span className={styles.waIcon}>💬</span>
            <div>
              <small>Prefer to chat first?</small>
              <a
                href={`https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(
                  "Hi Bubbly Pup Pet Grooming! I'd like to ask about grooming for my pet 🐾"
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
          {/* First question in the form: it decides whether a breed is asked for
              at all, and the wording of every pet field below. */}
          <div className={styles.field}>
            <label id="petTypeLabel">Pet Type *</label>
            <div
              className={styles.petTypes}
              role="group"
              aria-labelledby="petTypeLabel"
            >
              {PET_TYPES.map((p) => {
                const on = form.petType === p.value;
                return (
                  <button
                    type="button"
                    key={p.value}
                    className={`${styles.petCard} ${on ? styles.petCardOn : ""}`}
                    onClick={() => changePetType(p.value)}
                    aria-pressed={on}
                  >
                    <span className={styles.petEmoji} aria-hidden="true">
                      {p.emoji}
                    </span>
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

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
            {/* Without this, someone who only wants a nail trim picks the
                cheapest package and pays for a groom they didn't ask for —
                the "no package" option is the one that isn't self-evident. */}
            {!isServiceOnlyOption(form.packageId) && (
              <small className={styles.fieldNote}>
                💡 Not taking a package? Choose <strong>{SINGLE_SERVICE}</strong>{" "}
                — then pick just the service(s) you want.
              </small>
            )}
          </div>

          {/* Date sits directly above the slot grid, so "date → times" still
              reads top to bottom. Full width: the month needs seven columns,
              and a half-row squeezed them to something untappable on a phone. */}
          <div className={styles.fieldWide}>
            <div className={styles.field}>
              <label>Appointment Date *</label>
              <BookingCalendar
                value={form.date}
                onChange={(d) => update("date", d)}
                todayISO={today}
                packageKey={packageKey}
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
                                : "This time is already booked — please pick another"
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

          {/* The WhatsApp number is the only contact detail asked for — it's the
              one the salon replies on, and it identifies a repeat customer. */}
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

          {/* Two columns only while the breed field is there to fill the second
              one — alone, the name field would sit in a half-width orphan. */}
          <div className={isDog ? styles.row : undefined}>
            <div className={styles.field}>
              <label htmlFor="petName">{PetNoun}&apos;s Name *</label>
              <input
                id="petName"
                type="text"
                placeholder="e.g. Coco"
                value={form.petName}
                onChange={(e) => update("petName", e.target.value)}
              />
            </div>
            {/* Dogs only — see PetType. Hidden AND unvalidated for a cat. */}
            {isDog && (
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
            )}
          </div>

          {/* Full width on its own — the row above is a two-column grid, and a
              third child would drop into a half-width orphan column. */}
          <div className={styles.field}>
            <label>Is your {petNoun} aggressive? *</label>
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

          {/* The block, said before there is anything to tap. It carries its own
              way out — a WhatsApp link that already names the day and time we
              hold — because "contact us" with no link is a dead end on a phone. */}
          {alreadyBooked && (
            <div className={styles.alreadyBooked} role="status">
              <strong>You already have a reservation on this date.</strong>
              <p>
                We have you down for <strong>{alreadyBooked.timeLabel}</strong>. We take one
                appointment per phone number per day — to move or change it, just message
                us.
              </p>
              <a
                className={styles.alreadyBookedWa}
                href={`https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(
                  `Hi Bubbly Pup! I already have a booking on ${form.date} at ${alreadyBooked.timeLabel} and I would like to change it 🐾`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                💬 Message us to change it
              </a>
            </div>
          )}

          <button
            type="submit"
            className={`btn btn-whatsapp ${styles.submit}`}
            disabled={submitting || !!alreadyBooked}
          >
            <span className={styles.waGlyph}>💬</span>
            {submitting
              ? "Booking…"
              : alreadyBooked
              ? "You already have a booking this day"
              : "Send Reservation to WhatsApp"}
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
              {servicesForPet(servicesFor(modalPkg), speciesOf(form.petType)).map((a) => {
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
                Important Notice – Aggressive {PetNoun}
              </h3>
            </div>
            <div className={styles.consentBody}>
              <p>
                Grooming an aggressive or highly anxious {petNoun} can be challenging and may
                not always be possible to complete safely. Our groomers will always do their
                best to provide the requested grooming service while prioritizing the safety
                and well-being of your {petNoun} and our staff.
              </p>
              <p>
                If your {petNoun} shows severe aggression, attempts to bite, or becomes too
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
                  aggressive {petNoun} and agree to proceed with the appointment.
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
