"use client";

import { useState } from "react";
import {
  SITE,
  priceToNumber,
  formatLKR,
  tierOptionName,
  type PriceRow,
  type PriceTier,
  type PricePackage,
  type AddOn,
} from "@/lib/data";
import Reveal from "./Reveal";
import styles from "./PriceList.module.css";

function waLink(pkg: string) {
  return `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(
    `Hi Bubbly Pup! 🐾 I'd like to book the "${pkg}" for my pet.`
  )}`;
}

// Open the booking add-ons popup for this package (Booking.tsx listens).
function book(name: string) {
  window.dispatchEvent(new CustomEvent("bp:book", { detail: name }));
}

// Send a set of individually-picked services straight to the booking form.
function bookServices(ids: string[]) {
  window.dispatchEvent(new CustomEvent("bp:book", { detail: { addOns: ids } }));
}

// Checkbox picker with a live total + book button (spa card & extras band).
function SelectableServices({
  items,
  variant,
  cta,
  columns = 1,
}: {
  items: AddOn[];
  variant: "light" | "dark";
  cta: string;
  // Two columns only where the card is wide enough to hold them — the
  // trims/cuts/colour card owns two thirds of the row, so its nine services
  // read as five short rows instead of nine long ones.
  columns?: 1 | 2;
}) {
  const [sel, setSel] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const total = items
    .filter((i) => sel.includes(i.id))
    .reduce((s, i) => s + priceToNumber(i.price), 0);

  return (
    <div
      className={`${styles.picker} ${
        variant === "dark" ? styles.pickerDark : ""
      }`}
    >
      <ul
        className={`${styles.pickList} ${
          columns === 2 ? styles.pickListTwo : ""
        }`}
      >
        {items.map((i) => {
          const on = sel.includes(i.id);
          const [, name, qualifier] =
            i.label.match(/^(.*?)\s*\(([^)]+)\)\s*$/) ?? [null, i.label, null];
          return (
            <li key={i.id}>
              <button
                type="button"
                className={`${styles.pickRow} ${on ? styles.pickOn : ""}`}
                onClick={() => toggle(i.id)}
                aria-pressed={on}
              >
                <span className={styles.pickBox}>{on ? "✓" : ""}</span>
                <span className={styles.pickText}>
                  <span className={styles.pickLabel}>{name}</span>
                  {/* "(without knots)" carries the price difference between two
                      otherwise identical services — as a second line it reads as
                      the variant it is, instead of wrapping the row to 4 lines. */}
                  {qualifier && (
                    <span className={styles.pickNote}>{qualifier}</span>
                  )}
                </span>
                <span className={styles.pickPrice}>{i.price}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Total and button share one bar pinned to the bottom of the card, so
          both cards end on the same line however many services they list. */}
      <div className={styles.pickFoot}>
        <div className={styles.pickTotal}>
          <span className={styles.pickTotalLabel}>
            {sel.length === 0
              ? "Nothing picked yet"
              : `${sel.length} selected`}
          </span>
          <strong>{formatLKR(total)}</strong>
        </div>
        <button
          type="button"
          className={`btn ${
            variant === "dark" ? styles.addonCta : "btn-primary"
          } ${styles.pickBtn}`}
          onClick={() => bookServices(sel)}
          disabled={sel.length === 0}
        >
          {cta}
        </button>
      </div>
    </div>
  );
}

// Everything the package covers, at a glance — below the divider, exactly like
// the plan cards this section is modelled on.
//
// ONE column, always. The old two-column shape existed because a carousel slide
// was ~700px wide with a fixed height; in a four-up comparison grid a card is
// ~290px, where two columns would leave ~130px per name and wrap "Hair Trimming
// (Sanitary Areas Only)" onto four lines. A single ticked column is also what
// makes the four cards comparable — the same service sits at the same eye level
// across the row.
function IncludedList({ rows }: { rows: PriceRow[] }) {
  return (
    <div className={styles.included}>
      <div className={styles.includedHead}>
        <span>What&apos;s included</span>
        <span className={styles.includedCount}>{rows.length} services</span>
      </div>
      <ul className={styles.includedGrid}>
        {rows.map((r) => (
          <li key={r.service} className={styles.includedItem}>
            <span className={styles.tick} aria-hidden="true">
              ✓
            </span>
            <span>{r.service}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// One variant of a two-tier package (with / without knots), wearing the exact
// same panel as a single-price package so it lines up with them. It is a button
// because picking it is what decides which tier the card books — `aria-pressed`
// rather than a radio, since the two panels live in different grid rows and a
// radiogroup needs one container around its radios.
function TierPanel({
  tier,
  on,
  onSelect,
}: {
  tier: PriceTier;
  on: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={`${tier.label} — ${tier.offer}`}
      className={`${styles.offerRow} ${styles.offerPick} ${
        on ? styles.offerPickOn : ""
      }`}
      onClick={onSelect}
    >
      <span className={styles.offerLabel}>{tier.label}</span>
      <span className={styles.offerPrices}>
        <s className={styles.was}>{tier.original}</s>
        <strong className={styles.offerBig}>{tier.offer}</strong>
      </span>
    </button>
  );
}

// A plan card: badge slot, name, price, CTA, then the divider and the ticked
// list of what you get. Price and button sit ABOVE the list so all four buttons
// land on the same line — comparing plans is the whole job of this section, and
// nobody should have to scroll past 11 services to reach the number they came
// to compare.
function PackageCard({ p }: { p: PricePackage }) {
  // A tiered package is booked as one of its tiers, never as "the package" —
  // so one is always selected, and the button follows the selection.
  const [tierIdx, setTierIdx] = useState(0);
  const tier = p.tiers?.[tierIdx];
  const optionName = tier ? tierOptionName(p.name, tier.label) : p.name;

  return (
    <div className={`${styles.card} ${p.popular ? styles.popular : ""}`}>
      {/* Always rendered, even when empty: it holds the badge's height so the
          four package names stay on one line across the row. */}
      <div className={styles.badgeRow}>
        {p.popular && <span className={styles.badge}>Best value ✨</span>}
      </div>

      <div className={styles.cardHead}>
        <span className={styles.emoji}>{p.emoji}</span>
        <h3 className={p.capsTitle ? styles.capsTitle : undefined}>{p.name}</h3>
        {/* What the package is NOT, right under its name — by the time the
            customer reaches the note above the button they've already decided.
            Rendered on EVERY card, empty or not: the element reserves its line
            (see .tagline's min-height), which is what keeps all four price
            boxes on one baseline instead of two of them riding 20px higher. */}
        <p className={styles.tagline}>{p.tagline}</p>
      </div>

      {/* From here down every block is a DIRECT child of the card, because the
          card is a subgrid: each block sits in a row track shared by all four
          cards, which is what puts the prices, the buttons and the "what's
          included" dividers each on one line. Wrapping them in a container
          would collapse them into a single track and lose that. */}
      {/* THE price row — one shape, one size, on all four cards. A two-tier
          package puts its FIRST variant here, so "without knots" is read on the
          same line as every other package's price, and its second variant in
          the notes row below. Both are pickable; the button books whichever is
          selected. */}
      {p.tiers ? (
        <TierPanel
          tier={p.tiers[0]}
          on={tierIdx === 0}
          onSelect={() => setTierIdx(0)}
        />
      ) : (
        <div className={styles.offerRow}>
          <span className={styles.offerLabel}>Offer price</span>
          <span className={styles.offerPrices}>
            {p.original && <s className={styles.was}>{p.original}</s>}
            <strong className={styles.offerBig}>{p.offer}</strong>
          </span>
        </div>
      )}

      {/* Its own row, and rendered even when this package has nothing to say:
          the track is as tall as its tallest occupant, so the buttons below
          start on the same line whether a card carries a second price, a
          warning, a note or nothing at all. Exclusions stay ABOVE the button —
          reading them afterwards is reading them too late. */}
      <div className={styles.priceNotes}>
        {p.tiers?.slice(1).map((t, i) => (
          <TierPanel
            key={t.key}
            tier={t}
            on={tierIdx === i + 1}
            onSelect={() => setTierIdx(i + 1)}
          />
        ))}
        {p.warning && <p className={styles.warning}>{p.warning}</p>}
        {p.note && <p className={styles.note}>{p.note}</p>}
      </div>

      {/* Every card's button is the same filled pink. The highlighted package is
          already marked by its badge, its tint and its border — a second, weaker
          button style on the other three made them read as lesser options
          rather than as alternatives. */}
      <button
        className={`btn btn-primary ${styles.cta}`}
        onClick={() => book(optionName)}
      >
        {tier ? `Book — ${tier.label.toLowerCase()}` : "Book this package"}
      </button>

      <IncludedList rows={p.rows} />
    </div>
  );
}

// Prices arrive from the database (see lib/pricing.ts) so Settings → Package
// pricing is what the customer reads. Everything else on a card — emoji, the
// included list, notes, the badge — comes from lib/data.ts.
export default function PriceList({
  packages,
  spa,
  extras,
}: {
  packages: PricePackage[];
  spa: AddOn[];
  extras: AddOn[];
}) {
  return (
    <section id="pricing" className={`section-pad ${styles.section}`}>
      <div className="container">
        <div className={`center ${styles.sectionHead}`}>
          <span className="eyebrow">💰 Price List</span>
          <h2 className="section-title">Pamper packages &amp; pricing</h2>
          <p className="section-sub">
            Clear, all-in package pricing — no surprises. Compare every plan
            side by side and grab the <strong>offer price</strong> for your pup
            or kitty.
          </p>
        </div>
      </div>

      {/* All four packages in one view. They used to ride a hover/drag conveyor,
          which meant only one was ever readable and the rest moved under the
          pointer — the opposite of what a price list is for. */}
      <div className={styles.gridWrap}>
        <div className={styles.grid}>
          {packages.map((p, i) => (
            <Reveal key={p.id} className={styles.cell} delay={i * 80}>
              <PackageCard p={p} />
            </Reveal>
          ))}
        </div>
      </div>

      {/* Same wrapper as the package grid above, so the pickers line up with
          the cards instead of sitting in a narrower, inset column. */}
      <div className={styles.gridWrap}>
        {/* Signpost to the pickers below. The packages used to end here with no
            hint that spa treatments and trims/cuts/colour could be added, so a
            customer who wanted one had no reason to keep scrolling. */}
        <p className={styles.moreBelow}>
          ✨ Spa &amp; Treatments and Individual Grooming Services are available
          too — scroll down to add any of them to your visit.
          <span aria-hidden="true"> ↓</span>
        </p>

        {/* À-la-carte pickers stay out of the package grid — they're a different
            job: build your own visit rather than pick a plan. */}
        {/* One shell, two skins — identical structure so the pair reads as a
            set, with the colour doing the only distinguishing work. */}
        <div className={styles.extras}>
          <Reveal className={styles.pickCard}>
            <div className={styles.pickHead}>
              <span className={styles.emoji}>🌸</span>
              <div>
                <h3>Spa &amp; Treatments</h3>
                <p className={styles.pickSub}>
                  Pamper extras — pick one or all three.
                </p>
              </div>
            </div>
            <SelectableServices
              items={spa}
              variant="light"
              cta="Book selected treatments"
            />
          </Reveal>

          <Reveal className={`${styles.pickCard} ${styles.pickCardDark}`}>
            <div className={styles.pickHead}>
              <span className={styles.emoji}>🎨</span>
              <div>
                <h3 className={styles.capsHead}>Individual Grooming Services</h3>
                <p className={styles.pickSub}>
                  Book on their own, or add to any visit.
                </p>
              </div>
            </div>
            <SelectableServices
              items={extras}
              variant="dark"
              columns={2}
              cta="Book selected add-ons"
            />
          </Reveal>
        </div>

        <p className={styles.foot}>
          Prices in Sri Lankan Rupees (LKR). Final quote may vary with your
          pet&apos;s size, coat and condition —{" "}
          <a
            href={waLink("a custom quote")}
            target="_blank"
            rel="noopener noreferrer"
          >
            message us for a custom quote
          </a>
          .
        </p>
      </div>
    </section>
  );
}
