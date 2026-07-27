"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { SITE } from "@/lib/data";
import { gsap } from "@/lib/gsap";
import styles from "./Hero.module.css";

export default function Hero() {
  const [pos, setPos] = useState(50); // rendered slider position (%), eased
  const [groomed, setGroomed] = useState(false); // mobile tap-to-groom toggle
  const posRef = useRef(50);
  const targetRef = useRef(50); // where the pointer wants the slider
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const setTargetFromClientX = useCallback((clientX: number) => {
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    targetRef.current = Math.max(2, Math.min(98, pct));
  }, []);

  // smooth eased follow: the rendered position glides toward the target
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const cur = posRef.current;
      const t = targetRef.current;
      const next = cur + (t - cur) * 0.18; // easing factor → buttery glide
      const v = Math.abs(t - next) < 0.04 ? t : next;
      if (v !== cur) {
        posRef.current = v;
        setPos(v);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // cinematic staggered entrance — image scales/fades in, then the text rises
  useEffect(() => {
    const content = contentRef.current;
    const canvas = canvasRef.current;
    if (!content) return;
    const items = Array.from(content.children) as HTMLElement[];

    gsap.set(items, { opacity: 0, y: 28 });
    if (canvas) gsap.set(canvas, { opacity: 0, scale: 1.06 });

    const tl = gsap.timeline({ paused: true });
    if (canvas)
      tl.to(canvas, { opacity: 1, scale: 1, duration: 0.9, ease: "power3.out" });
    tl.to(
      items,
      { opacity: 1, y: 0, duration: 0.6, stagger: 0.12, ease: "power3.out" },
      "-=0.5"
    );

    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          tl.play();
          obs.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    obs.observe(content);

    return () => {
      obs.disconnect();
      tl.kill();
      gsap.set([...items, canvas].filter(Boolean), { clearProps: "all" });
    };
  }, []);

  // axis-aware pointer dragging — works for mouse and touch; a vertical
  // touch gesture is released so the page can still scroll.
  const drag = useRef<{
    id: number;
    axis: "h" | "v" | null;
    x: number;
    y: number;
    active: boolean;
  } | null>(null);

  const beginDrag = (e: React.PointerEvent, immediate: boolean) => {
    drag.current = {
      id: e.pointerId,
      axis: immediate || e.pointerType === "mouse" ? "h" : null,
      x: e.clientX,
      y: e.clientY,
      active: immediate || e.pointerType === "mouse",
    };
    if (drag.current.active) setTargetFromClientX(e.clientX);
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      if (!d.active) {
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dx) >= Math.abs(dy)) {
          d.active = true;
          d.axis = "h";
          canvasRef.current?.setPointerCapture?.(d.id);
        } else {
          drag.current = null; // vertical swipe → let the page scroll
          return;
        }
      }
      e.preventDefault();
      setTargetFromClientX(e.clientX);
    };
    const up = (e: PointerEvent) => {
      if (drag.current?.id === e.pointerId) drag.current = null;
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [setTargetFromClientX]);

  return (
    <section
      id="top"
      className={styles.hero}
      onPointerDown={(e) => {
        // don't start a drag when tapping a link/button (CTAs, the handle)
        if ((e.target as HTMLElement).closest("a, button")) return;
        // mobile uses tap-to-groom, not the drag slider
        if (window.matchMedia("(max-width: 720px)").matches) return;
        beginDrag(e, false);
      }}
    >
      {/* image + slider canvas */}
      <div ref={canvasRef} className={styles.canvas}>
        {/* BEFORE — base */}
        <div className={styles.layer}>
          <Image
            src="/media/before.png"
            alt="Dog before grooming"
            fill
            priority
            sizes="100vw"
            className={`${styles.media} ${styles.mediaDesktop}`}
          />
          <Image
            src="/media/mobile-before.png"
            alt="Dog before grooming"
            fill
            priority
            sizes="100vw"
            className={`${styles.media} ${styles.mediaMobile}`}
          />
        </div>

        {/* AFTER — desktop: slider reveal; mobile: tap-to-groom crossfade */}
        <div
          className={`${styles.layer} ${styles.afterLayer} ${
            groomed ? styles.groomed : ""
          }`}
          style={{
            WebkitMaskImage: `linear-gradient(to right, #000 calc(${pos}% - 3.5%), transparent calc(${pos}% + 1.5%))`,
            maskImage: `linear-gradient(to right, #000 calc(${pos}% - 3.5%), transparent calc(${pos}% + 1.5%))`,
          }}
        >
          <Image
            src="/media/after.png"
            alt="Dog after grooming at Bubbly Pup Pet Grooming"
            fill
            priority
            sizes="100vw"
            className={`${styles.media} ${styles.mediaDesktop}`}
          />
          <Image
            src="/media/mobile-after.png"
            alt="Dog after grooming at Bubbly Pup Pet Grooming"
            fill
            priority
            sizes="100vw"
            className={`${styles.media} ${styles.mediaMobile}`}
          />
        </div>

        <div className={styles.scrim} />
        <div className={styles.grain} />

        {/* slider divider + handle */}
        <div className={styles.divider} style={{ left: `${pos}%` }}>
          <button
            className={styles.handle}
            aria-label="Drag to reveal before and after"
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture?.(e.pointerId);
              beginDrag(e, true);
            }}
          >
            <span>‹</span>
            <span>›</span>
          </button>
        </div>

        <a href="#pricing" className={styles.scrollCue} aria-label="Scroll down">
          <span />
        </a>
      </div>

      <div ref={contentRef} className={`container ${styles.content}`}>
        <span className="eyebrow">🐶 {SITE.city} · Loved by 1000+ pets</span>
        <h1 className={styles.title}>
          Grooming that makes
          <br />
          tails <span className="gradient-text">wag with joy</span>
        </h1>
        <p className={styles.lead}>
          {SITE.name} pampers your pup with gentle, professional care — spa
          baths, stylish haircuts &amp; full grooming, finished with a bubbly
          burst of fresh &amp; fluffy.
        </p>

        <div className={styles.groomWrap}>
          <button
            type="button"
            className={styles.groomBtn}
            onClick={() => setGroomed((g) => !g)}
            aria-pressed={groomed}
            aria-label={groomed ? "Undo grooming" : "Tap to groom"}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
              <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
              <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
              <path d="M2 12a10 10 0 0 1 18-6" />
              <path d="M2 16h.01" />
              <path d="M21.8 16c.2-2 .131-5.354 0-6" />
              <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
              <path d="M8.65 22c.21-.66.45-1.32.57-2" />
              <path d="M9 6.8a6 6 0 0 1 9 5.2c0 .47 0 1.17-.02 2" />
            </svg>
          </button>
          <span className={styles.groomHint}>
            {groomed ? "Groomed ✨" : "Tap to groom"}
          </span>
        </div>

        <div className={styles.actions}>
          <a href="#booking" className="btn btn-primary">
            Make a Reservation
          </a>
          <a href="#pricing" className="btn btn-ghost">
            See Prices
          </a>
        </div>

        <div className={styles.trust}>
          <div className={styles.avatars}>
            <span>🐩</span>
            <span>🐕</span>
            <span>🐕‍🦺</span>
            <span>🐶</span>
          </div>
          <p>
            <strong>Happy pups &amp; proud parents</strong>
            <br />
            Slide the handle across to reveal the glow-up ✨
          </p>
        </div>
      </div>
    </section>
  );
}
