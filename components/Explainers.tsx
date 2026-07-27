"use client";

import { useEffect, useRef } from "react";
import { EXPLAINER_VIDEOS } from "@/lib/data";
import { gsap } from "@/lib/gsap";
import styles from "./Explainers.module.css";

// Slider data derived from the explainer videos (single source of truth).
const SLIDES = EXPLAINER_VIDEOS.map((v) => ({
  name: v.title,
  src: v.src,
  tag: v.tag,
}));

export default function Explainers() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const q = (sel: string) => root.querySelector(sel) as HTMLElement;
    const slider = q(".slider");
    const sliderTitle = q(".slider-title");
    const sliderCounter = root.querySelector(
      ".slider-counter p span:first-child"
    ) as HTMLElement | null;
    const sliderItems = root.querySelector(
      ".slider-items"
    ) as HTMLElement | null;
    const sliderDetails = q(".slider-details");
    const sliderDots = q(".slider-dots");

    const sliderContent = SLIDES;
    const totalSlides = sliderContent.length;

    const STEP_DUR = 0.7; // single eased step (s)
    const BROWSE_SPEED = 0.85; // seconds per slide while holding
    const SNAP_DUR = 0.45; // settle when releasing a hold

    const state = { p: 0 }; // floating conveyor position (p === slide centered)
    let isAnimating = false;
    let browsing = false;
    let browseDir: "next" | "prev" | null = null;
    let lastBrowseActive = 0;

    let hoverZone: "next" | "prev" | null = null;
    let pendingTarget: number | null = null;
    const hoverEnabled = window.matchMedia(
      "(hover: hover) and (pointer: fine)"
    ).matches;

    const slides: HTMLElement[] = [];
    let playingVideo: HTMLVideoElement | null = null;

    // ---- continuous position -> screen placement (interpolated) ----
    function positionFor(off: number) {
      const mobile = window.matchMedia("(max-width: 900px)").matches;
      const dist = mobile ? [0, 34, 60, 82] : [0, 23, 38, 52];
      const scl = mobile ? [1, 0.6, 0.45, 0.4] : [1, 0.72, 0.5, 0.4];
      const opc = mobile ? [1, 0.32, 0, 0] : [1, 0.45, 0, 0];

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

    function activeFromValue(v: number) {
      return ((Math.round(v) % totalSlides) + totalSlides) % totalSlides;
    }

    function render() {
      const p = state.p;
      slides.forEach((slide, i) => {
        let off = (((i - p) % totalSlides) + totalSlides) % totalSlides;
        if (off > totalSlides / 2) off -= totalSlides;
        gsap.set(slide, { ...positionFor(off), xPercent: -50, yPercent: -50 });
        const aoff = Math.abs(off);
        slide.classList.toggle("active", aoff < 0.5);
        slide.style.pointerEvents = aoff <= 1.2 ? "auto" : "none";
      });
    }

    function buildSlides() {
      slider.querySelectorAll(".slide-container").forEach((el) => el.remove());
      sliderContent.forEach((content) => {
        const slide = document.createElement("div");
        slide.className = "slide-container";
        slide.innerHTML = `<div class="slide-img"><video src="${content.src}#t=0.5" muted playsinline preload="metadata" loop></video><span class="slide-play">▶</span></div>`;
        slider.appendChild(slide);
        slides.push(slide);
      });
    }

    // ---- playback (center card) ----
    function stopPlaying() {
      if (playingVideo) {
        playingVideo.pause();
        playingVideo.controls = false;
        playingVideo.muted = true;
        playingVideo.closest(".slide-container")?.classList.remove("playing");
        playingVideo = null;
      }
    }

    function playCenter() {
      const a = activeFromValue(state.p);
      const slide = slides[a];
      const video = slide?.querySelector("video") as HTMLVideoElement | null;
      if (!video) return;
      if (playingVideo && playingVideo !== video) stopPlaying();
      video.muted = false;
      video.controls = true;
      slide.classList.add("playing");
      playingVideo = video;
      video.play().catch(() => {
        /* ignore */
      });
    }

    // ---- title ----
    function splitTextIntoSpans(element: HTMLElement) {
      element.innerHTML = element.innerText
        .split("")
        .map(
          (char) => `<span>${char === " " ? "&nbsp;&nbsp;" : char}</span>`
        )
        .join("");
    }

    function createAndAnimateTitle(
      content: (typeof SLIDES)[number],
      direction: "next" | "prev"
    ) {
      const newTitle = document.createElement("h1");
      newTitle.innerText = content.name;
      sliderTitle.appendChild(newTitle);
      splitTextIntoSpans(newTitle);

      const yOffset = direction === "next" ? 60 : -60;
      gsap.set(newTitle.querySelectorAll("span"), { y: yOffset });
      gsap.to(newTitle.querySelectorAll("span"), {
        y: 0,
        duration: 0.9,
        stagger: 0.02,
        ease: "power3.out",
        delay: 0.1,
      });

      const currentTitle = sliderTitle.querySelector("h1:not(:last-child)");
      if (currentTitle) {
        gsap.to(currentTitle.querySelectorAll("span"), {
          y: -yOffset,
          duration: 0.9,
          stagger: 0.02,
          ease: "power3.out",
          delay: 0.1,
          onComplete: () => currentTitle.remove(),
        });
      }
    }

    function setTitleInstant(content: (typeof SLIDES)[number]) {
      const h = document.createElement("h1");
      h.innerText = content.name;
      sliderTitle.innerHTML = "";
      sliderTitle.appendChild(h);
    }

    // ---- details panel ----
    function buildDetailsHTML(content: (typeof SLIDES)[number]) {
      return `
        <div class="d-head">
          <span class="d-venue"><span class="d-dot"></span>${content.tag}</span>
          <p class="d-role"><strong>Pro tip</strong> ${content.name}</p>
        </div>`;
    }

    function updateDetails(
      content: (typeof SLIDES)[number],
      direction: "next" | "prev"
    ) {
      const yOut = direction === "next" ? 24 : -24;
      gsap.to(sliderDetails, {
        opacity: 0,
        y: yOut,
        duration: 0.3,
        ease: "power2.in",
        onComplete: () => {
          sliderDetails.innerHTML = buildDetailsHTML(content);
          gsap.fromTo(
            sliderDetails,
            { opacity: 0, y: -yOut },
            { opacity: 1, y: 0, duration: 0.55, ease: "power3.out" }
          );
        },
      });
    }

    // ---- counter / side list / dots ----
    function updateActiveUI(index1: number) {
      if (sliderCounter) sliderCounter.textContent = String(index1);
      sliderItems
        ?.querySelectorAll("p")
        .forEach((item, i) =>
          item.classList.toggle("activeItem", i === index1 - 1)
        );
      sliderDots
        .querySelectorAll("button")
        .forEach((dot, i) => dot.classList.toggle("active", i === index1 - 1));
    }

    function buildDots() {
      sliderContent.forEach((content, i) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.setAttribute("aria-label", `Go to: ${content.name}`);
        if (i === 0) dot.classList.add("active");
        dot.addEventListener("click", () => {
          if (i !== activeFromValue(state.p) && !isAnimating && !browsing) {
            pendingTarget = i;
            stepTowardTarget();
          }
        });
        sliderDots.appendChild(dot);
      });
    }

    function setActiveLight(index: number) {
      updateActiveUI(index + 1);
      const c = sliderContent[index];
      setTitleInstant(c);
      sliderDetails.innerHTML = buildDetailsHTML(c);
    }

    function setActiveFull(index: number, direction: "next" | "prev") {
      updateActiveUI(index + 1);
      const c = sliderContent[index];
      createAndAnimateTitle(c, direction);
      updateDetails(c, direction);
    }

    // ---- discrete eased step (click / dot) ----
    function step(direction: "next" | "prev") {
      if (isAnimating || browsing) return;
      stopPlaying();
      isAnimating = true;
      const dir = direction === "next" ? 1 : -1;
      const target = state.p + dir;
      setActiveFull(activeFromValue(target), direction);
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
      const active = activeFromValue(state.p);
      if (pendingTarget === active) {
        pendingTarget = null;
        return;
      }
      let diff = pendingTarget - active;
      if (diff > totalSlides / 2) diff -= totalSlides;
      else if (diff < -totalSlides / 2) diff += totalSlides;
      step(diff > 0 ? "next" : "prev");
    }

    // ---- fluid continuous browse (hold on a side) ----
    function browseSync() {
      const a = activeFromValue(state.p);
      if (a !== lastBrowseActive) {
        lastBrowseActive = a;
        setActiveLight(a);
      }
    }

    function startBrowse(direction: "next" | "prev") {
      if (browsing && browseDir === direction) return;
      stopPlaying();
      gsap.killTweensOf(state);
      browsing = true;
      isAnimating = false;
      browseDir = direction;
      pendingTarget = null;
      lastBrowseActive = activeFromValue(state.p);
      const dir = direction === "next" ? 1 : -1;
      const distance = dir * 1000;
      gsap.to(state, {
        p: state.p + distance,
        duration: Math.abs(distance) * BROWSE_SPEED,
        ease: "none",
        onUpdate: () => {
          render();
          browseSync();
        },
      });
    }

    function stopBrowse() {
      if (!browsing) return;
      browsing = false;
      gsap.killTweensOf(state);
      const nearest = Math.round(state.p);
      isAnimating = true;
      gsap.to(state, {
        p: nearest,
        duration: SNAP_DUR,
        ease: "power2.out",
        onUpdate: () => {
          render();
          browseSync();
        },
        onComplete: () => {
          const a = activeFromValue(nearest);
          state.p = a;
          render();
          isAnimating = false;
        },
      });
    }

    // ---- click a card: side card → bring to center; center card → play ----
    function onSliderClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest(".slider-details, .slider-dots")) return;
      if (isAnimating || browsing) return;
      const clicked = target.closest(".slide-container") as HTMLElement | null;
      if (!clicked) return;
      let off =
        (((slides.indexOf(clicked) - state.p) % totalSlides) + totalSlides) %
        totalSlides;
      if (off > totalSlides / 2) off -= totalSlides;
      if (Math.round(off) !== 0) {
        step(off > 0 ? "next" : "prev");
      } else {
        const video = clicked.querySelector("video") as HTMLVideoElement | null;
        if (video && !video.paused) return; // let native controls work
        playCenter();
      }
    }
    slider.addEventListener("click", onSliderClick);

    // ---- hover to browse (desktop / fine pointer only) ----
    function zoneFromEvent(e: MouseEvent): "next" | "prev" | null {
      const t = e.target as HTMLElement;
      if (t.closest(".slider-details, .slider-dots, .slider-items, .slider-counter"))
        return null;
      const rect = slider.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      if (x < 0.3) return "prev";
      if (x > 0.7) return "next";
      return null;
    }

    // show the details bar only while hovering the centered video (center zone)
    function setDetailsOn(on: boolean) {
      root!.classList.toggle(styles.detailsOn, on);
    }

    function onMouseMove(e: MouseEvent) {
      const zone = zoneFromEvent(e);
      if (zone !== hoverZone) {
        hoverZone = zone;
        if (zone) startBrowse(zone);
        else stopBrowse();
      }
      // center zone (no browse) → reveal details for the relevant clip
      setDetailsOn(zone === null && !browsing);
    }
    function onMouseLeave() {
      hoverZone = null;
      stopBrowse();
      setDetailsOn(false);
    }

    if (hoverEnabled) {
      slider.addEventListener("mousemove", onMouseMove);
      slider.addEventListener("mouseleave", onMouseLeave);
    } else {
      // touch / coarse pointers can't hover — keep the details bar visible
      setDetailsOn(true);
    }

    // ---- touch drag to browse (mobile — same conveyor feel as hover) ----
    let tStartX = 0,
      tStartY = 0,
      tStartP = 0;
    let tAxis: "h" | "v" | null = null;
    let tLastX = 0,
      tLastT = 0,
      tVel = 0;
    let dragUnit = 240;

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      stopPlaying();
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
      e.stopPropagation();

      lastBrowseActive = activeFromValue(state.p);
      state.p = tStartP - dx / dragUnit;
      render();
      browseSync();

      const now = e.timeStamp || 0;
      const dt = now - tLastT;
      if (dt > 0) tVel = (t.clientX - tLastX) / dt;
      tLastX = t.clientX;
      tLastT = now;
    }

    function onTouchEnd(e: TouchEvent) {
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
          browseSync();
        },
        onComplete: () => {
          const a = activeFromValue(target);
          state.p = a;
          render();
          isAnimating = false;
          setActiveLight(a);
        },
      });
      e.stopPropagation();
    }

    slider.addEventListener("touchstart", onTouchStart, { passive: true });
    slider.addEventListener("touchmove", onTouchMove, { passive: false });
    slider.addEventListener("touchend", onTouchEnd, { passive: true });

    // ---- side list click ----
    const itemEls = sliderItems
      ? Array.from(sliderItems.querySelectorAll("p"))
      : [];
    const itemHandlers = itemEls.map((item, index) => {
      const h = () => {
        if (index !== activeFromValue(state.p) && !isAnimating && !browsing) {
          pendingTarget = index;
          stepTowardTarget();
        }
      };
      item.addEventListener("click", h);
      return h;
    });

    // ---- resize ----
    let resizeTimer: ReturnType<typeof setTimeout>;
    function onResize() {
      if (browsing || isAnimating) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(render, 100);
    }
    window.addEventListener("resize", onResize);

    let lastW = 0,
      lastH = 0;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      const w = Math.round(cr.width),
        h = Math.round(cr.height);
      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      if (!browsing && !isAnimating) render();
    });
    ro.observe(slider);

    // pause a playing clip when the section scrolls out of view (up or down)
    const visObserver = new IntersectionObserver(
      ([e]) => {
        if (e.intersectionRatio < 0.5) stopPlaying();
      },
      { threshold: [0, 0.5, 1] }
    );
    visObserver.observe(slider);

    // ---- init ----
    buildSlides();
    buildDots();
    render();
    requestAnimationFrame(() => {
      if (!browsing && !isAnimating) render();
    });
    const settleTimer = setTimeout(() => {
      if (!browsing && !isAnimating) render();
    }, 250);

    const initialTitle = sliderTitle.querySelector("h1");
    if (initialTitle) {
      splitTextIntoSpans(initialTitle as HTMLElement);
      gsap.fromTo(
        initialTitle.querySelectorAll("span"),
        { y: 60 },
        { y: 0, duration: 1, stagger: 0.02, ease: "power3.out" }
      );
    }

    sliderDetails.innerHTML = buildDetailsHTML(sliderContent[0]);
    gsap.from(sliderDetails, {
      opacity: 0,
      y: 20,
      duration: 1,
      delay: 0.3,
      ease: "power3.out",
    });

    updateActiveUI(1);

    return () => {
      stopPlaying();
      visObserver.disconnect();
      gsap.killTweensOf(state);
      clearTimeout(resizeTimer);
      clearTimeout(settleTimer);
      ro.disconnect();
      slider.removeEventListener("click", onSliderClick);
      if (hoverEnabled) {
        slider.removeEventListener("mousemove", onMouseMove);
        slider.removeEventListener("mouseleave", onMouseLeave);
      }
      slider.removeEventListener("touchstart", onTouchStart);
      slider.removeEventListener("touchmove", onTouchMove);
      slider.removeEventListener("touchend", onTouchEnd);
      itemEls.forEach((item, i) =>
        item.removeEventListener("click", itemHandlers[i])
      );
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <section id="learn" className={`section-pad ${styles.wrap}`}>
      <div className="container">
        <div className="center">
          <span className="eyebrow">💡 Good to Know</span>
          <h2 className="section-title">Grooming problems &amp; pro tips</h2>
          <p className="section-sub">
            Quick, honest explainers on common grooming problems. Hover the sides
            to browse, click a clip to bring it center, then tap to play.
          </p>
        </div>
      </div>

      <div ref={rootRef} className={styles.stage}>
        <div className="slider">
          <div className="hover-hint left" aria-hidden="true">
            &#8249;
          </div>
          <div className="hover-hint right" aria-hidden="true">
            &#8250;
          </div>

          <div className="slider-title">
            <h1>{SLIDES[0].name}</h1>
          </div>

          <div className="slider-details-wrap">
            <div className="slider-details" />
          </div>

          <div className="slider-counter">
            <p>
              <span>1</span>
              <span>/</span>
              <span>{SLIDES.length}</span>
            </p>
          </div>

          <div className="slider-dots" />
        </div>
      </div>
    </section>
  );
}
