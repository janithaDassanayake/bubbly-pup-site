"use client";

import { useState } from "react";
import {
  SITE,
  priceToNumber,
  formatLKR,
  tierOptionName,
  type PriceRow,
  type PricePackage,
  type AddOn,
} from "@/lib/data";
import Reveal from "./Reveal";
import CardSlider from "./CardSlider";
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
}: {
  items: AddOn[];
  variant: "light" | "dark";
  cta: string;
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
      <ul className={styles.pickList}>
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

// Everything the package covers, at a glance — never behind a scrollbar.
//
// The packages are lopsided (11 services down to 5), and one fixed layout can't
// serve both: two columns leave a short package looking half-empty, one column
// makes a long one overflow. So the list picks its own shape — a long list goes
// two-up and compact, a short one runs full width with roomier type — and the
// panel then stretches to fill whatever height the card has left, so the space
// is *used* rather than left as a gap above the price.
const TWO_COLUMN_FROM = 7;

function IncludedList({ rows }: { rows: PriceRow[] }) {
  const twoCol = rows.length >= TWO_COLUMN_FROM;
  return (
    <div className={styles.included}>
      <div className={styles.includedHead}>
        <span>What&apos;s included</span>
        <span className={styles.includedCount}>{rows.length} services</span>
      </div>
      <ul
        className={`${styles.includedGrid} ${
          twoCol ? styles.twoCol : styles.oneCol
        }`}
      >
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

// Rendered as a slide in the conveyor, so no scroll-reveal wrapper: `Reveal`
// keeps a card at opacity 0 until it intersects the viewport, and the side cards
// of a carousel never do — they'd stay invisible until rotated in.
function PackageCard({ p }: { p: PricePackage }) {
  // A tiered package is booked as one of its tiers, never as "the package" —
  // so one is always selected, and the button follows the selection.
  const [tierIdx, setTierIdx] = useState(0);
  const tier = p.tiers?.[tierIdx];
  const optionName = tier ? tierOptionName(p.name, tier.label) : p.name;

  return (
    <div
      className={`${styles.card} ${styles.slideCard} ${
        p.popular ? styles.popular : ""
      }`}
    >
      {p.popular && <span className={styles.badge}>Best value ✨</span>}

      <div className={styles.cardHead}>
        <span className={styles.emoji}>{p.emoji}</span>
        <h3>{p.name}</h3>
      </div>

      <IncludedList rows={p.rows} />

      {/* Price sits at the bottom, right above the button it justifies. It's a
          single row rather than the old two-line block — that shape is what
          used to push the button off a laptop screen. */}
      <div className={styles.footer}>
        {p.tiers ? (
          <div
            className={styles.tiers}
            role="radiogroup"
            aria-label={`${p.name} — coat condition`}
          >
            {p.tiers.map((t, i) => {
              const on = i === tierIdx;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`${styles.tier} ${on ? styles.tierOn : ""}`}
                  onClick={() => setTierIdx(i)}
                >
                  <span className={styles.tierBox}>{on ? "✓" : ""}</span>
                  <span className={styles.tierLabel}>{t.label}</span>
                  <span className={styles.tierPrices}>
                    <s className={styles.was}>{t.original}</s>
                    <strong className={styles.offer}>{t.offer}</strong>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className={styles.offerRow}>
            <span className={styles.offerLabel}>Offer price</span>
            <span className={styles.offerPrices}>
              {p.original && <s className={styles.was}>{p.original}</s>}
              <strong className={styles.offerBig}>{p.offer}</strong>
            </span>
          </div>
        )}

        {p.note && <p className={styles.note}>{p.note}</p>}

        <button
          className={`btn ${p.popular ? "btn-primary" : "btn-ghost"} ${
            styles.cta
          }`}
          onClick={() => book(optionName)}
        >
          {tier ? `Book — ${tier.label.toLowerCase()}` : "Book this package"}
        </button>
      </div>
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
  // One card per package, carried by the same conveyor as the explainer clips.
  const slides = packages.map((p) => ({
    key: p.id,
    label: `Show ${p.name}`,
    node: <PackageCard p={p} />,
  }));

  return (
    <section id="pricing" className={`section-pad ${styles.section}`}>
      <div className="container">
        <div className={`center ${styles.sectionHead}`}>
          <span className="eyebrow">💰 Price List</span>
          <h2 className="section-title">Pamper packages &amp; pricing</h2>
          <p className="section-sub">
            Clear, all-in package pricing — no surprises. Swipe or hover to
            browse every plan, and grab the <strong>offer price</strong> for
            your pup or kitty.
          </p>
        </div>
      </div>

      {/* Full-bleed: the conveyor needs the whole width to fan the cards out. */}
      <CardSlider items={slides} ariaLabel="Grooming packages and pricing" />

      <div className="container">
        {/* À-la-carte pickers stay out of the carousel — ticking checkboxes on a
            card that browses under the pointer would be miserable. */}
        {/* One shell, two skins — identical structure so the pair reads as a
            set, with the colour doing the only distinguishing work. */}
        <div className={styles.extras}>
          <Reveal className={styles.pickCard}>
            <div className={styles.pickHead}>
              <span className={styles.emoji}>🌸</span>
              <div>
                <h3>Spa Treatments</h3>
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
                <h3>Trims, Cuts &amp; Colour</h3>
                <p className={styles.pickSub}>
                  Book on their own, or add to any visit.
                </p>
              </div>
            </div>
            <SelectableServices
              items={extras}
              variant="dark"
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
