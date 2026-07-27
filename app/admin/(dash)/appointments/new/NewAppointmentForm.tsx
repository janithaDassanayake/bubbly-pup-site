"use client";
// Manual booking form. Mirrors the customer flow deliberately — package, then
// date, then the slots free on that date — so the salon sees exactly the
// availability a customer would, and can't create a double booking.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AppointmentStatus, PetGender } from "@prisma/client";
import { createAppointment, findCustomerByPhone } from "../../../actions";
import { formatLKR } from "@/lib/format";

type Pkg = { key: string; name: string; durationMin: number; price: number; standalone: boolean };
type AddOn = { key: string; name: string; price: number; group: string };
type Slot = { value: string; label: string; taken?: boolean; reason?: "booked" | "passed" };
type Pet = { id: string; name: string; breed: string | null; age: string | null };

const NEW_PET = "__new__";

export default function NewAppointmentForm({
  packages,
  addOns,
  todayISO,
}: {
  packages: Pkg[];
  addOns: AddOn[];
  todayISO: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [packageKey, setPackageKey] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [knownPets, setKnownPets] = useState<Pet[]>([]);
  const [foundExisting, setFoundExisting] = useState(false);

  const [petId, setPetId] = useState(NEW_PET);
  const [petName, setPetName] = useState("");
  const [petBreed, setPetBreed] = useState("");
  const [petAge, setPetAge] = useState("");
  const [petGender, setPetGender] = useState<PetGender>("UNKNOWN");

  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<AppointmentStatus>("CONFIRMED");
  const [queueConfirmation, setQueueConfirmation] = useState(true);
  const [error, setError] = useState("");

  const pkg = packages.find((p) => p.key === packageKey);
  const total = (pkg?.price ?? 0) + addOns.filter((a) => picked.includes(a.key)).reduce((s, a) => s + a.price, 0);

  // Real availability for the chosen package + date — the same endpoint the
  // public booking form uses, so both see one source of truth.
  useEffect(() => {
    if (!packageKey || !date) {
      setSlots(null);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    fetch(`/api/availability?date=${date}&packageKey=${encodeURIComponent(packageKey)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { slots: Slot[]; grid?: Slot[] }) => {
        if (cancelled) return;
        // Show the whole day with taken times marked, so the salon can see at a
        // glance when they're busy instead of a mysteriously short list.
        const list = d.grid?.length ? d.grid : d.slots ?? [];
        setSlots(list);
        setSlot((s) => (s && !list.some((x) => x.value === s && !x.taken) ? "" : s));
      })
      .catch(() => !cancelled && setSlots([]))
      .finally(() => !cancelled && setSlotsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [packageKey, date]);

  // Repeat customer? Pull their name and pets so nothing is retyped or duplicated.
  const lookup = () => {
    if (phone.trim().length < 6) return;
    start(async () => {
      // A failed lookup is a convenience feature, not worth crashing the form.
      const r = await findCustomerByPhone(phone).catch(() => ({ ok: false, customer: undefined }));
      if (r.customer) {
        setName(r.customer.name);
        setEmail(r.customer.email ?? "");
        setKnownPets(r.customer.pets);
        setFoundExisting(true);
        if (r.customer.pets.length) setPetId(r.customer.pets[0].id);
      } else {
        setKnownPets([]);
        setFoundExisting(false);
        setPetId(NEW_PET);
      }
    });
  };

  const toggleAddOn = (key: string) =>
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      try {
        const r = await createAppointment({
          packageKey,
          addOnKeys: picked,
          date,
          start: slot,
          ownerName: name,
          ownerPhone: phone,
          ownerEmail: email,
          petId: petId === NEW_PET ? undefined : petId,
          petName: petId === NEW_PET ? petName : undefined,
          petBreed: petId === NEW_PET ? petBreed : undefined,
          petAge: petId === NEW_PET ? petAge : undefined,
          petGender: petId === NEW_PET ? petGender : undefined,
          notes,
          status,
          queueConfirmation,
        });
        if (!r.ok) return setError(r.error ?? "Couldn't create the appointment.");
        router.push(`/admin/appointments?q=${r.code}`);
      } catch {
        setError("Couldn't reach the server. Check your connection and try again.");
      }
    });
  };

  return (
    <form className="adm-card" onSubmit={submit}>
      <div className="adm-card-body adm-form">
        <h2 className="adm-form-h">1 · Service</h2>
        <div className="adm-grid-2">
          <label className="adm-field">
            <span>Package or service *</span>
            <select value={packageKey} onChange={(e) => setPackageKey(e.target.value)} required>
              <option value="">Choose…</option>
              {packages.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name} · {p.durationMin} min · {formatLKR(p.price)}
                </option>
              ))}
            </select>
          </label>
          <label className="adm-field">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as AppointmentStatus)}>
              <option value="CONFIRMED">Confirmed (booked by phone)</option>
              <option value="PENDING_CONFIRMATION">Pending confirmation</option>
              <option value="ARRIVED">Arrived (walk-in, here now)</option>
            </select>
          </label>
        </div>

        {addOns.length > 0 && (
          <div className="adm-field">
            <span>Add-ons</span>
            <div className="adm-chips">
              {addOns.map((a) => {
                const on = picked.includes(a.key);
                return (
                  <button
                    type="button"
                    key={a.key}
                    className={`adm-chip ${on ? "adm-chip-on" : ""}`}
                    onClick={() => toggleAddOn(a.key)}
                    aria-pressed={on}
                  >
                    {on ? "✓" : "+"} {a.name} · {formatLKR(a.price)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <h2 className="adm-form-h">2 · When</h2>
        <div className="adm-grid-2">
          <label className="adm-field">
            <span>Date *</span>
            <input
              type="date"
              min={todayISO}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label className="adm-field">
            <span>Time slot *</span>
            <select
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
              disabled={!packageKey || !date || slotsLoading}
              required
            >
              <option value="">
                {!packageKey
                  ? "Pick a service first"
                  : !date
                  ? "Pick a date first"
                  : slotsLoading
                  ? "Loading…"
                  : slots && slots.length === 0
                  ? "Closed on this date"
                  : slots && slots.every((s) => s.taken)
                  ? "Fully booked — try another date"
                  : "Pick a time"}
              </option>
              {(slots ?? []).map((s) => (
                <option key={s.value} value={s.value} disabled={s.taken}>
                  {s.taken ? `${s.label} — ${s.reason === "passed" ? "too late" : "BOOKED"}` : s.label}
                </option>
              ))}
            </select>
            {slots !== null && slots.length > 0 && (
              <small className="adm-note">
                {slots.filter((s) => !s.taken).length} of {slots.length} times free
              </small>
            )}
          </label>
        </div>

        <h2 className="adm-form-h">3 · Customer</h2>
        <div className="adm-grid-2">
          <label className="adm-field">
            <span>WhatsApp number *</span>
            <input
              type="tel"
              inputMode="tel"
              placeholder="e.g. 071 234 5678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={lookup}
              required
            />
            {foundExisting && <small className="adm-note">✓ Existing customer — details filled in</small>}
          </label>
          <label className="adm-field">
            <span>Customer name *</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        </div>

        <h2 className="adm-form-h">4 · Pet</h2>
        {knownPets.length > 0 && (
          <label className="adm-field">
            <span>Which pet?</span>
            <select value={petId} onChange={(e) => setPetId(e.target.value)}>
              {knownPets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.breed ? ` · ${p.breed}` : ""}
                </option>
              ))}
              <option value={NEW_PET}>+ Add a new pet</option>
            </select>
          </label>
        )}

        {petId === NEW_PET && (
          <>
            <div className="adm-grid-2">
              <label className="adm-field">
                <span>Pet name *</span>
                <input
                  type="text"
                  placeholder="e.g. Coco"
                  value={petName}
                  onChange={(e) => setPetName(e.target.value)}
                  required
                />
              </label>
              <label className="adm-field">
                <span>Breed</span>
                <input type="text" value={petBreed} onChange={(e) => setPetBreed(e.target.value)} />
              </label>
            </div>
            <div className="adm-grid-2">
              <label className="adm-field">
                <span>Age</span>
                <input
                  type="text"
                  placeholder="e.g. 2 years"
                  value={petAge}
                  onChange={(e) => setPetAge(e.target.value)}
                />
              </label>
              <label className="adm-field">
                <span>Gender</span>
                <select value={petGender} onChange={(e) => setPetGender(e.target.value as PetGender)}>
                  <option value="UNKNOWN">Not specified</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </label>
            </div>
          </>
        )}

        <label className="adm-field">
          <span>Notes</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        <label className="adm-check">
          <input
            type="checkbox"
            checked={queueConfirmation}
            onChange={(e) => setQueueConfirmation(e.target.checked)}
          />
          <span>Queue a booking-confirmation WhatsApp (send it with one tap afterwards)</span>
        </label>

        {pkg && (
          <p className="adm-total">
            {pkg.durationMin} min · estimated <strong>{formatLKR(total)}</strong>
          </p>
        )}

        {error && <p className="adm-form-error">{error}</p>}

        <div className="adm-btn-row">
          <button type="submit" className="adm-btn adm-btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Create appointment"}
          </button>
        </div>
      </div>
    </form>
  );
}
