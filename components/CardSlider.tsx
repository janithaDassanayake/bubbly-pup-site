"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { gsap } from "@/lib/gsap";
import styles from "./CardSlider.module.css";

// The conveyor effect from the explainer clips slider (`Explainers.tsx`),
// generalised to carry ARBITRARY React content instead of videos: one card sits
// centred and full size, its neighbours fan out behind it, scaled and faded.
//
// Why a second implementation rather than sharing one: the explainer slider is
// welded to video playback (play glyph, sound, pause-on-scroll) and builds its
// slides as raw HTML strings. Package cards need live React inside them — a
// working "Book this package" button — so the slides are rendered by React and
// this engine only positions them. The *motion* is deliberately identical: same
// interpolated conveyor, same hover-to-browse, same snap.
//
// Interaction, all three pointer types:
//   • desktop — hover the left/right third to browse continuously, click a side
//     card to bring it to the centre, use the centred card normally
//   • touch — drag horizontally with velocity-based snap; vertical drags still
//     scroll the page
//   • keyboard — the dots are real buttons; ← / → move one card

export type SliderItem = {
  key: string;
  label: string; // accessible name for the dot ("Show Cat Grooming")
  node: ReactNode;
};

const STEP_DUR = 0.7; // one eased step (s)
const BROWSE_SPEED = 1.05; // s per card while holding — slower than the video
const SNAP_DUR = 0.45; //   slider: these cards carry text to read

export default function CardSlider({
  items,
  ariaLabel,
}: {
  items: SliderItem[];
  ariaLabel: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);
  // Set by the engine so the dots (rendered by React) can drive it.
  const goToRef = useRef<((index: number) => void) | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const found = root.querySelector(`.${styles.slider}`);
    if (!(found instanceof HTMLElement)) return;
    const slider: HTMLElement = found; // non-null for the closures below

    const slides = Array.from(
      slider.querySelectorAll<HTMLElement>("[data-slide]")
    );
    const total = slides.length;
    if (!total) return;

    const state = { p: 0 }; // float conveyor position; p === that card centred
    let isAnimating = false;
    let browsing = false;
    let browseDir: "next" | "prev" | null = null;
    let lastActive = 0;
    let hoverZone: "next" | "prev" | null = null;
    let pendingTarget: number | null = null;

    const hoverEnabled = window.matchMedia(
      "(hover: hover) and (pointer: fine)"
    ).matches;

    // ---- continuous position → screen placement (interpolated) ----
    // Cards are far wider than the 9:16 clips, so they need to sit further out
    // and stay larger — otherwise neighbours swamp the centre card.
    function positionFor(off: number) {
      const mobile = window.matchMedia("(max-width: 900px)").matches;
      const dist = mobile ? [0, 62, 96, 120] : [0, 35, 60, 78];
      const scl = mobile ? [1, 0.72, 0.52, 0.44] : [1, 0.82, 0.62, 0.5];
      const opc = mobile ? [1, 0.28, 0, 0] : [1, 0.5, 0.1, 0];

      const a = Math.min(Math.abs(off), 3);
      const f = Math.floor(a);
      const g = Math.min(f + 1, 3);
      const t = a - f;
      const lerp = (arr: number[]) => arr[f] + (arr[g] - arr[f]) * t;
      const sign = off < 0 ? -1 : 1;

      return {
        left: 50 + sign * lerp(dist) + "%",
        scale: lerp(scl),
        opacity: lerp(opc),
        zIndex: Math.round(6 - a),
      };
    }

    const activeFromValue = (v: number) =>
      ((Math.round(v) % total) + total) % total;

    function render() {
      const p = state.p;
      slides.forEach((slide, i) => {
        let off = (((i - p) % total) + total) % total;
        if (off > total / 2) off -= total;
        gsap.set(slide, { ...positionFor(off), xPercent: -50, yPercent: -50 });
        const aoff = Math.abs(off);
        const isCentre = aoff < 0.5;
        slide.classList.toggle(styles.active, isCentre);
        // Reachable enough to click into the centre, but never so far back that
        // an invisible card swallows a click meant for the page.
        slide.style.pointerEvents = aoff <= 1.2 ? "auto" : "none";
        // `inert` goes on the CARD, not on the slide: an off-centre card must be
        // unreachable by Tab and its buttons unclickable, but the slide *itself*
        // still has to receive the click that brings it to the centre. Inert
        // content isn't hit-tested, so that click lands on the slide behind it —
        // put inert on the slide and click-to-centre would stop working.
        const card = slide.firstElementChild;
        if (card) {
          card.toggleAttribute("inert", !isCentre);
          card.setAttribute("aria-hidden", isCentre ? "false" : "true");
        }
      });
    }

    function syncActive() {
      const a = activeFromValue(state.p);
      if (a !== lastActive) {
        lastActive = a;
        setActive(a);
      }
    }

    // ---- discrete eased step (click / dot / arrow key) ----
    function step(direction: "next" | "prev") {
      if (isAnimating || browsing) return;
      isAnimating = true;
      const target = state.p + (direction === "next" ? 1 : -1);
      lastActive = activeFromValue(target);
      setActive(lastActive);
      gsap.killTweensOf(state);
      gsap.to(state, {
        p: target,
        duration: STEP_DUR,
        ease: "power3.inOut",
        onUpdate: render,
        onComplete: () => {
          state.p = activeFromValue(target);
          render();
          isAnimating = false;
          if (pendingTarget !== null) {
            if (pendingTarget === activeFromValue(state.p)) pendingTarget = null;
            else stepTowardTarget();
          }
        },
      });
    }

    function stepTowardTarget() {
      if (isAnimating || browsing || pendingTarget === null) return;
      const a = activeFromValue(state.p);
      if (pendingTarget === a) {
        pendingTarget = null;
        return;
      }
      let diff = pendingTarget - a;
      if (diff > total / 2) diff -= total;
      else if (diff < -total / 2) diff += total;
      step(diff > 0 ? "next" : "prev");
    }

    goToRef.current = (index: number) => {
      if (index === activeFromValue(state.p) || isAnimating || browsing) return;
      pendingTarget = index;
      stepTowardTarget();
    };

    // ---- fluid continuous browse (hold on a side) ----
    function startBrowse(direction: "next" | "prev") {
      if (browsing && browseDir === direction) return;
      gsap.killTweensOf(state);
      browsing = true;
      isAnimating = false;
      browseDir = direction;
      pendingTarget = null;
      lastActive = activeFromValue(state.p);
      const distance = (direction === "next" ? 1 : -1) * 1000;
      gsap.to(state, {
        p: state.p + distance,
        duration: Math.abs(distance) * BROWSE_SPEED,
        ease: "none",
        onUpdate: () => {
          render();
          syncActive();
        },
      });
    }

    function stopBrowse() {
      if (!browsing) return;
      browsing = false;
      browseDir = null;
      gsap.killTweensOf(state);
      const nearest = Math.round(state.p);
      isAnimating = true;
      gsap.to(state, {
        p: nearest,
        duration: SNAP_DUR,
        ease: "power2.out",
        onUpdate: () => {
          render();
          syncActive();
        },
        onComplete: () => {
          state.p = activeFromValue(nearest);
          render();
          isAnimating = false;
          syncActive();
        },
      });
    }

    // ---- click a side card → bring it to the centre ----
    // The centred card is left alone so its own buttons keep working.
    function onClick(e: MouseEvent) {
      const clicked = (e.target as HTMLElement).closest(
        "[data-slide]"
      ) as HTMLElement | null;
      if (!clicked) return;
      let off = (((slides.indexOf(clicked) - state.p) % total) + total) % total;
      if (off > total / 2) off -= total;
      if (Math.round(off) === 0) return; // centred — let the card handle it
      // Stop here so the card's own onClick (Book this package) can't fire from
      // a card the customer was only pointing at.
      e.preventDefault();
      e.stopPropagation();
      if (!isAnimating && !browsing) step(off > 0 ? "next" : "prev");
    }
    slider.addEventListener("click", onClick);

    // ---- hover to browse (fine pointers only) ----
    function zoneFrom(e: MouseEvent): "next" | "prev" | null {
      if ((e.target as HTMLElement).closest("[data-no-browse]")) return null;
      const rect = slider.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      if (x < 0.3) return "prev";
      if (x > 0.7) return "next";
      return null;
    }
    function onMouseMove(e: MouseEvent) {
      const zone = zoneFrom(e);
      if (zone === hoverZone) return;
      hoverZone = zone;
      if (zone) startBrowse(zone);
      else stopBrowse();
    }
    function onMouseLeave() {
      hoverZone = null;
      stopBrowse();
    }
    if (hoverEnabled) {
      slider.addEventListener("mousemove", onMouseMove);
      slider.addEventListener("mouseleave", onMouseLeave);
    }

    // ---- touch drag (mobile) ----
    let tStartX = 0,
      tStartY = 0,
      tStartP = 0,
      tLastX = 0,
      tLastT = 0,
      tVel = 0;
    let tAxis: "h" | "v" | null = null;
    let dragUnit = 240;

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      gsap.killTweensOf(state);
      browsing = false;
      isAnimating = false;
      pendingTarget = null;
      const t = e.touches[0];
      tStartX = tLastX = t.clientX;
      tStartY = t.clientY;
      tStartP = state.p;
      tAxis = null;
      tVel = 0;
      tLastT = e.timeStamp || 0;
      dragUnit = Math.max(150, slider.getBoundingClientRect().width / 3);
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - tStartX;
      const dy = t.clientY - tStartY;
      if (tAxis === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        tAxis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      }
      if (tAxis !== "h") return; // vertical → let the page scroll
      e.preventDefault();
      state.p = tStartP - dx / dragUnit;
      render();
      syncActive();
      const now = e.timeStamp || 0;
      const dt = now - tLastT;
      if (dt > 0) tVel = (t.clientX - tLastX) / dt;
      tLastX = t.clientX;
      tLastT = now;
    }

    function onTouchEnd() {
      if (tAxis !== "h") {
        tAxis = null;
        return;
      }
      tAxis = null;
      let target = Math.round(state.p);
      if (Math.abs(tVel) > 0.45) target = Math.round(state.p) - Math.sign(tVel);
      isAnimating = true;
      gsap.killTweensOf(state);
      gsap.to(state, {
        p: target,
        duration: SNAP_DUR,
        ease: "power2.out",
        onUpdate: () => {
          render();
          syncActive();
        },
        onComplete: () => {
          state.p = activeFromValue(target);
          render();
          isAnimating = false;
          syncActive();
        },
      });
    }

    slider.addEventListener("touchstart", onTouchStart, { passive: true });
    slider.addEventListener("touchmove", onTouchMove, { passive: false });
    slider.addEventListener("touchend", onTouchEnd, { passive: true });

    // ---- keyboard ----
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") step("prev");
      else if (e.key === "ArrowRight") step("next");
      else return;
      e.preventDefault();
    }
    root.addEventListener("keydown", onKeyDown);

    // ---- resize ----
    let resizeTimer: ReturnType<typeof setTimeout>;
    function onResize() {
      if (browsing || isAnimating) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(render, 100);
    }
    window.addEventListener("resize", onResize);

    let lastW = 0;
    let lastH = 0;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      const w = Math.round(cr.width);
      const h = Math.round(cr.height);
      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      if (!browsing && !isAnimating) render();
    });
    ro.observe(slider);

    // ---- init ----
    render();
    // Fonts and images settle after first paint; re-place once they have.
    requestAnimationFrame(() => {
      if (!browsing && !isAnimating) render();
    });
    const settle = setTimeout(() => {
      if (!browsing && !isAnimating) render();
    }, 250);

    return () => {
      goToRef.current = null;
      gsap.killTweensOf(state);
      clearTimeout(resizeTimer);
      clearTimeout(settle);
      ro.disconnect();
      slider.removeEventListener("click", onClick);
      if (hoverEnabled) {
        slider.removeEventListener("mousemove", onMouseMove);
        slider.removeEventListener("mouseleave", onMouseLeave);
      }
      slider.removeEventListener("touchstart", onTouchStart);
      slider.removeEventListener("touchmove", onTouchMove);
      slider.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [items.length]);

  return (
    <div
      ref={rootRef}
      className={styles.stage}
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      tabIndex={-1}
    >
      <div className={styles.slider}>
        <span className={`${styles.hint} ${styles.hintLeft}`} aria-hidden="true">
          &#8249;
        </span>
        <span className={`${styles.hint} ${styles.hintRight}`} aria-hidden="true">
          &#8250;
        </span>

        {items.map((it) => (
          <div key={it.key} data-slide="" className={styles.slide}>
            {it.node}
          </div>
        ))}
      </div>

      <div className={styles.counter} data-no-browse="">
        <span>{active + 1}</span>
        <span>/</span>
        <span>{items.length}</span>
      </div>

      <div className={styles.dots} data-no-browse="">
        {items.map((it, i) => (
          <button
            key={it.key}
            type="button"
            className={`${styles.dot} ${i === active ? styles.dotOn : ""}`}
            aria-label={it.label}
            aria-current={i === active}
            onClick={() => goToRef.current?.(i)}
          />
        ))}
      </div>
    </div>
  );
}
