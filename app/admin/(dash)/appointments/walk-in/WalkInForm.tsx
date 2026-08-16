"use client";
// Walk-in intake. Written to be finished at a counter with a wet dog under one
// arm: numbered steps so a half-filled form shows where you stopped, tap targets
// sized for a thumb, and the price set as a headline rather than one more input
// in a row. Everything the reservation form asks for and a walk-in can't answer
// — a slot from the six-slot grid, a breed, a WhatsApp number — is gone or
// optional.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PaymentMethod, PetSpecies } from "@prisma/client";
import { createWalkIn } from "../../../actions";
import { formatLKR } from "@/lib/format";
import { petIcon } from "@/lib/pet";

type Pkg = { key: string; name: string; price: number; standalone: boolean };
type AddOn = { key: string; name: string; price: number; group: string; category: string };

const SPECIES: PetSpecies[] = ["DOG", "CAT"];

// Same glyphs the Paid & Completed popup already uses (ActionButtons.tsx) — two
// payment pickers in one portal must not label the same thing differently.
const METHODS: { value: PaymentMethod; label: string; glyph: string }[] = [
  { value: "CASH", label: "Cash", glyph: "💵" },
  { value: "CARD", label: "Card", glyph: "💳" },
  { value: "BANK_TRANSFER", label: "Bank transfer", glyph: "🏦" },
];

// One numbered step. The label rail sits left at desk width and stacks on a
// phone — see .adm-wi-step in admin.css.
function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="adm-wi-step">
      <div className="adm-wi-head">
        <span className="adm-wi-num" aria-hidden>
          {n}
        </span>
        <div>
          <h3>{title}</h3>
          <p>{hint}</p>
        </div>
      </div>
      <div className="adm-wi-body">{children}</div>
    </section>
  );
}

export default function WalkInForm({
  packages,
  addOns,
  includedByPackage,
  todayISO,
  nowHHMM,
}: {
  packages: Pkg[];
  addOns: AddOn[];
  includedByPackage: Record<string, string[]>;
  todayISO: string;
  /** The salon's clock, not the browser's — the same source the slots use. */
  nowHHMM: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [petName, setPetName] = useState("");
  const [petSpecies, setPetSpecies] = useState<PetSpecies>("DOG");

  const [date, setDate] = useState(todayISO);
  const [time, setTime] = useState(nowHHMM);

  const [packageKey, setPackageKey] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  // The price is the one field staff must be able to overrule — the whole point
  // of a walk-in is that the number was agreed out loud. So it follows the
  // catalogue only until somebody types in it, and then it stops moving.
  const [price, setPrice] = useState("");
  const [priceTouched, setPriceTouched] = useState(false);

  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [settleNow, setSettleNow] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [error, setError] = useState("");

  const isDog = petSpecies === "DOG";

  const pkg = packages.find((p) => p.key === packageKey);
  const chosenAddOns = addOns.filter((a) => picked.includes(a.key));
  const addOnTotal = chosenAddOns.reduce((s, a) => s + a.price, 0);
  // Mirrors the server (and lib/price-audit.ts): a standalone row carries the
  // duration for a visit with no package, so its own price only counts when
  // nothing else was chosen.
  const catalogueTotal = pkg ? (pkg.standalone ? addOnTotal || pkg.price : pkg.price + addOnTotal) : 0;

  // Keep the box in step with the catalogue until it's edited by hand.
  const retotal = (next: number) => {
    if (!priceTouched) setPrice(next > 0 ? String(next) : "");
  };

  const changePackage = (key: string) => {
    setPackageKey(key);
    const p = packages.find((x) => x.key === key);
    retotal(p ? (p.standalone ? addOnTotal || p.price : p.price + addOnTotal) : 0);
  };

  const toggleAddOn = (key: string) => {
    const next = picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key];
    setPicked(next);
    const sum = addOns.filter((a) => next.includes(a.key)).reduce((s, a) => s + a.price, 0);
    retotal(pkg ? (pkg.standalone ? sum || pkg.price : pkg.price + sum) : 0);
  };

  const finalPrice = Number(price);
  const priceOk = price.trim() !== "" && Number.isFinite(finalPrice) && finalPrice >= 0;
  const adjusted = priceOk && pkg ? finalPrice - catalogueTotal : 0;
  // Everything the server needs. Drives the summary AND the button label, so the
  // two can never disagree about whether the form is finished.
  const ready = Boolean(petName.trim() && pkg && date && time && priceOk);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!priceOk) return setError("Enter the final price for this visit.");
    start(async () => {
      try {
        const r = await createWalkIn({
          petName,
          petSpecies,
          date,
          start: time,
          packageKey,
          addOnKeys: picked,
          finalPrice,
          ownerPhone: phone.trim() || undefined,
          notes,
          settleNow,
          paymentMethod: settleNow ? method : undefined,
        });
        if (!r.ok) return setError(r.error ?? "Couldn't add the walk-in.");
        router.push(`/admin/appointments?date=${date}`);
      } catch {
        setError("Couldn't reach the server. Check your connection and try again.");
      }
    });
  };

  return (
    <form className="adm-card" onSubmit={submit}>
      <div className="adm-wi-hero">
        <span className="glyph" aria-hidden>
          🚶
        </span>
        <div>
          <h2>Add walk-in customer</h2>
          <p>A customer the salon took itself — at the counter or over the phone.</p>
        </div>
      </div>

      <Step n={1} title="Pet" hint="Who is on the table.">
        <div className="adm-field">
          <span>Dog or cat? *</span>
          <div className="adm-chips">
            {SPECIES.map((s) => (
              <button
                type="button"
                key={s}
                className={`adm-chip adm-chip-lg ${petSpecies === s ? "adm-chip-on" : ""}`}
                onClick={() => setPetSpecies(s)}
                aria-pressed={petSpecies === s}
              >
                {petIcon(s)} {s === "DOG" ? "Dog" : "Cat"}
              </button>
            ))}
          </div>
        </div>
        {/* No breed field: a walk-in is in front of the groomer, who can see the
            coat, and the desk shouldn't be held up naming it. The website still
            collects one for a reservation, where the groom is planned ahead. */}
        <label className="adm-field">
          <span>{isDog ? "Dog" : "Cat"}&apos;s name *</span>
          <input
            type="text"
            placeholder="e.g. Coco"
            value={petName}
            onChange={(e) => setPetName(e.target.value)}
            required
            autoFocus
          />
        </label>
      </Step>

      <Step n={2} title="When" hint="Any time — walk-ins aren't limited to the six online slots.">
        <div className="adm-grid-2">
          <label className="adm-field">
            <span>Date *</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="adm-field">
            <span>Appointment time *</span>
            {/* Free-form on purpose — the pet came in when it came in. The
                website's reservation grid is untouched by this. */}
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </label>
        </div>
      </Step>

      <Step n={3} title="Service" hint="What the pet is in for. Extras add to the price.">
        <label className="adm-field">
          <span>Service *</span>
          <select value={packageKey} onChange={(e) => changePackage(e.target.value)} required>
            <option value="">Choose…</option>
            {packages.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
                {p.price > 0 ? ` · ${formatLKR(p.price)}` : ""}
              </option>
            ))}
          </select>
        </label>

        {addOns.length > 0 && (
          <div className="adm-field">
            <span>Extras</span>
            <div className="adm-chips">
              {addOns.map((a) => {
                const on = picked.includes(a.key);
                const included = (includedByPackage[packageKey] ?? []).includes(a.key);
                return (
                  <button
                    type="button"
                    key={a.key}
                    className={`adm-chip adm-chip-lg ${on ? "adm-chip-on" : ""} ${
                      included ? "adm-chip-included" : ""
                    }`}
                    onClick={() => toggleAddOn(a.key)}
                    aria-pressed={on}
                    title={
                      included
                        ? "Already included in the chosen service — adding it charges for it a second time"
                        : undefined
                    }
                  >
                    {on ? "✓" : "+"} {a.name} · {formatLKR(a.price)}
                    {included && <span className="adm-chip-tag">included</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Step>

      <Step n={4} title="Price" hint="What the customer is actually charged — change it freely.">
        <div className="adm-field adm-wi-price">
          <span>Final price *</span>
          <div className="adm-wi-price-wrap">
            <span className="cur" aria-hidden>
              Rs.
            </span>
            <input
              type="number"
              min={0}
              step={50}
              inputMode="numeric"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                setPriceTouched(true);
              }}
              aria-label="Final price in rupees"
              required
            />
          </div>
          {/* The catalogue figure stays visible next to whatever was typed — a
              discount is a decision, and the desk should see both numbers. */}
          {pkg && (
            <small className="adm-note">
              Price list says {formatLKR(catalogueTotal)}
              {priceTouched && priceOk && adjusted !== 0 ? (
                <>
                  {" · "}
                  <strong>
                    {adjusted < 0 ? "discount" : "extra"} {formatLKR(Math.abs(adjusted))}
                  </strong>{" "}
                  <button
                    type="button"
                    className="adm-linkbtn"
                    onClick={() => {
                      setPriceTouched(false);
                      setPrice(catalogueTotal > 0 ? String(catalogueTotal) : "");
                    }}
                  >
                    reset
                  </button>
                </>
              ) : null}
            </small>
          )}
        </div>

        <label className="adm-check">
          <input
            type="checkbox"
            checked={settleNow}
            onChange={(e) => setSettleNow(e.target.checked)}
          />
          <span>Paid in full now — close the visit</span>
        </label>
        {/* Chips, not a dropdown: three mutually exclusive options that fit on one
            row, matching the Dog/Cat pair above and the Paid & Completed popup.
            A select hides two of the three until it is opened, for no gain. */}
        {settleNow ? (
          <div className="adm-field">
            <span>Paid by</span>
            <div className="adm-chips">
              {METHODS.map((m) => (
                <button
                  type="button"
                  key={m.value}
                  className={`adm-chip adm-chip-lg ${method === m.value ? "adm-chip-on" : ""}`}
                  onClick={() => setMethod(m.value)}
                  aria-pressed={method === m.value}
                >
                  <span aria-hidden>{m.glyph}</span> {m.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          // Unpaid walk-ins are not missing from the reports — they are counted
          // as expected, and settle through the normal button on the list.
          <p className="adm-note" style={{ margin: 0 }}>
            Left unpaid — settle it later with <strong>Paid &amp; Completed</strong> on the
            appointments list.
          </p>
        )}

        {/* Reads the decision back rather than the inputs, so a mistyped price or
            a service nobody picked is visible BEFORE the button is pressed. */}
        <div className={`adm-wi-sum ${ready ? "ready" : ""}`}>
          {ready ? (
            <>
              <div className="amt">Charging {formatLKR(finalPrice)}</div>
              <div className="line">
                {petIcon(petSpecies)} {petName.trim()} · {pkg!.name}
                {chosenAddOns.length > 0 ? ` + ${chosenAddOns.map((a) => a.name).join(", ")}` : ""}
                <br />
                {date === todayISO ? "today" : date} at {time} ·{" "}
                {settleNow
                  ? `settled now · ${METHODS.find((m) => m.value === method)?.label}`
                  : "to be settled"}
                {adjusted !== 0
                  ? ` · ${adjusted < 0 ? "discount" : "extra"} ${formatLKR(Math.abs(adjusted))}`
                  : ""}
              </div>
            </>
          ) : (
            <div className="line">
              Fill in the pet&apos;s name, a service and a price — the whole visit is
              summarised here before you save it.
            </div>
          )}
        </div>
      </Step>

      <Step
        n={5}
        title="Contact"
        hint="Optional. With a number the visit joins that customer's history and can be messaged."
      >
        <div className="adm-grid-2">
          <label className="adm-field">
            <span>WhatsApp number</span>
            <input
              type="tel"
              inputMode="tel"
              placeholder="Leave blank if not given"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label className="adm-field">
            <span>Notes</span>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
      </Step>

      {error && (
        <div style={{ padding: "0 22px" }}>
          <p className="adm-form-error">{error}</p>
        </div>
      )}

      <div className="adm-wi-foot">
        <Link href="/admin/appointments" className="adm-btn">
          Cancel
        </Link>
        <button type="submit" className="adm-btn adm-btn-primary" disabled={pending}>
          {pending ? "Saving…" : ready ? `Add walk-in · ${formatLKR(finalPrice)}` : "Add walk-in"}
        </button>
      </div>
    </form>
  );
}
