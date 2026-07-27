"use client";

import { PACKAGES, FREE_SERVICES } from "@/lib/data";
import Reveal from "./Reveal";
import styles from "./Packages.module.css";

export default function Packages() {
  const pick = (id: string) => {
    const el = document.getElementById("booking");
    const select = document.getElementById(
      "package"
    ) as HTMLSelectElement | null;
    if (select) select.value = id;
    el?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section id="packages" className="section-pad">
      <div className="container">
        <div className="center">
          <span className="eyebrow">🛁 Our Services</span>
          <h2 className="section-title">Grooming packages for every pup</h2>
          <p className="section-sub">
            Pick the perfect pampering plan. Every package comes loaded with{" "}
            <strong>6 free add-on services</strong> — because your best friend
            deserves the full treatment.
          </p>
        </div>

        <div className={styles.grid}>
          {PACKAGES.map((p, i) => (
            <Reveal
              key={p.id}
              className={`${styles.card} ${p.popular ? styles.popular : ""}`}
              delay={(i % 3) * 80}
            >
              {p.popular && <span className={styles.tag}>Most loved</span>}
              <span className={styles.emoji}>{p.emoji}</span>
              <h3>{p.name}</h3>
              <p className={styles.blurb}>{p.blurb}</p>
              <ul className={styles.includes}>
                {p.includes.map((inc) => (
                  <li key={inc}>
                    <span className={styles.check}>✓</span>
                    {inc}
                  </li>
                ))}
              </ul>
              <button
                className={`btn ${p.popular ? "btn-primary" : "btn-ghost"} ${
                  styles.cta
                }`}
                onClick={() => pick(p.id)}
              >
                Book Now
              </button>
            </Reveal>
          ))}

          {/* Free services highlight card */}
          <Reveal className={`${styles.card} ${styles.freeCard}`}>
            <span className={styles.emoji}>🎁</span>
            <h3>Free with every package</h3>
            <p className={styles.blurb}>
              No hidden extras — these little luxuries are always on the house.
            </p>
            <ul className={styles.freeGrid}>
              {FREE_SERVICES.map((f) => (
                <li key={f.label}>
                  <span>{f.emoji}</span>
                  {f.label}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
