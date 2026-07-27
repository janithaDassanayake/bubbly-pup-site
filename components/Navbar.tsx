"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { SITE } from "@/lib/data";
import styles from "./Navbar.module.css";

const LINKS = [
  { href: "#pricing", label: "Pricing" },
  { href: "#process", label: "How We Groom" },
  { href: "#learn", label: "Good to Know" },
  { href: "#reviews", label: "Reviews" },
];

// sections with a dark background under the nav line — frac = how far down
// the section stays dark (hero is fully dark; the reel fades to light)
const DARK_SECTIONS = [{ sel: "#top", frac: 1 }];

export default function Navbar() {
  const [lightText, setLightText] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const NAV_LINE = 44; // y-position of the nav, in px
    const TOP_ZONE = 80; // hover this close to the top edge to reveal the nav
    const coarse = window.matchMedia(
      "(hover: none), (pointer: coarse)"
    ).matches;
    let atTop = true; // page is scrolled near the very top
    let nearTop = false; // cursor is hovering the top edge
    let scrollUpReveal = false; // touch: last gesture was an upward scroll
    let lastY = window.scrollY;

    const apply = () => setHidden(!(atTop || nearTop || scrollUpReveal));

    const onScroll = () => {
      const y = window.scrollY;
      atTop = y < 120;

      // on touch devices there's no hover — reveal when scrolling up, hide on down
      if (coarse) {
        if (y < lastY - 4) scrollUpReveal = true;
        else if (y > lastY + 4) scrollUpReveal = false;
      }
      lastY = y;

      // adapt text color to the section behind the nav
      let onDark = false;
      for (const { sel, frac } of DARK_SECTIONS) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.top <= NAV_LINE && r.top + r.height * frac >= NAV_LINE) {
          onDark = true;
          break;
        }
      }
      setLightText(onDark);
      apply();
    };

    const onMove = (e: MouseEvent) => {
      nearTop = e.clientY <= TOP_ZONE;
      apply();
    };

    // touch fallback: tapping near the top edge reveals it
    const onTouch = (e: TouchEvent) => {
      nearTop = (e.touches[0]?.clientY ?? 999) <= TOP_ZONE;
      apply();
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("touchstart", onTouch, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchstart", onTouch);
    };
  }, []);

  // never hide while the mobile menu is open
  const isHidden = hidden && !open;

  return (
    <header
      className={`${styles.nav} ${lightText ? styles.light : styles.dark} ${
        isHidden ? styles.hidden : ""
      }`}
    >
      <div className={`container ${styles.inner}`}>
        <a href="#top" className={styles.brand} onClick={() => setOpen(false)}>
          <Image
            src="/media/logo-transparent.png"
            alt={SITE.name}
            width={300}
            height={200}
            priority
            className={styles.logoImg}
          />
        </a>

        <nav className={`${styles.links} ${open ? styles.linksOpen : ""}`}>
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
          <a
            href="#booking"
            className={`btn btn-primary ${styles.navCta}`}
            onClick={() => setOpen(false)}
          >
            Book Now
          </a>
        </nav>

        <button
          className={styles.burger}
          aria-label="Toggle menu"
          onClick={() => setOpen((v) => !v)}
        >
          <span className={open ? styles.x1 : ""} />
          <span className={open ? styles.x2 : ""} />
          <span className={open ? styles.x3 : ""} />
        </button>
      </div>
    </header>
  );
}
