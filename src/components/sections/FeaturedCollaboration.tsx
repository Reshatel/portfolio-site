"use client";

import { useCallback, useRef, type CSSProperties } from "react";
import Image from "next/image";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/lib/gsap";
import { useThreadSegment, type Band } from "@/components/thread/SiteThread";
import { docRect, flightRoute, staticRect, type Rect } from "@/components/thread/geometry";
import { COLLAB } from "@/components/collab/collab";
import MagneticLink from "@/components/ui/MagneticLink";

/* ------------------------------------------------------------------ */
/*  The perforated top edge — this section's way in                    */
/*                                                                     */
/*  About arrives behind a slanted wipe, Education as a sheet torn off  */
/*  along a deckled edge. This one arrives as the STUB OF A BOARDING    */
/*  PASS: the previous stock carries on for thirty pixels, a line of    */
/*  punched holes runs across it, and the new paper begins below the    */
/*  perforation. The holes are real gaps in the new sheet, so what      */
/*  shows through them is the old one — which is why the strip above    */
/*  the tear is painted rather than left to the page.                   */
/*                                                                     */
/*  Written at a FIXED pixel scale for the same reason Education's tear */
/*  is: a perforation stretched to the viewport would have three times  */
/*  as many holes per inch at 390px as at 1440. It is a 26px tile       */
/*  repeated to 3200, and the wrapper clips whatever the window does    */
/*  not need.                                                           */
/*                                                                     */
/*  The dashes between the holes are separate SUBPATHS of one path, so  */
/*  DrawSVG walks them one by one and the perforation inks itself       */
/*  across the page as the section comes up — a dasharray of my own     */
/*  would have been overwritten by the plugin's.                        */
/* ------------------------------------------------------------------ */
const PERF_W = 3200;
const PERF_H = 34;
/** Where the punched line runs, and the pitch and radius of the holes. */
const PERF_Y = 15;
const PERF_PITCH = 26;
const PERF_R = 5.5;

function perforation() {
  let fill = `M 0 ${PERF_Y}`;
  let ink = "";
  for (let c = PERF_PITCH / 2; c < PERF_W; c += PERF_PITCH) {
    // A bite out of the new sheet: sweep 0 dips the arc downward, into the
    // paper, so the stock above shows through the hole.
    fill += ` L ${(c - PERF_R).toFixed(1)} ${PERF_Y} A ${PERF_R} ${PERF_R} 0 0 0 ${(c + PERF_R).toFixed(1)} ${PERF_Y}`;
    // The dash living in the gap after this hole.
    const a = c + PERF_R + 3.5;
    const b = c + PERF_PITCH - PERF_R - 3.5;
    if (b > a) ink += ` M ${a.toFixed(1)} ${PERF_Y} L ${b.toFixed(1)} ${PERF_Y}`;
  }
  fill += ` L ${PERF_W} ${PERF_Y} L ${PERF_W} ${PERF_H} L 0 ${PERF_H} Z`;
  return { fill, ink: ink.trim() };
}
const PERF = perforation();

/* ------------------------------------------------------------------ */
/*  The chart the route is drawn on                                    */
/*                                                                     */
/*  Stack rules its paper with dots, Projects with a cross-rule,        */
/*  Education with a diagonal weave. A fourth grid would just be a      */
/*  fourth grid, so this section is not ruled at all: it is a chart —   */
/*  range rings, a compass rose and a course arc. Same hand, and the    */
/*  one kind of paper this case study could be printed on.              */
/* ------------------------------------------------------------------ */
function roseTicks() {
  const out: { d: string; heavy: boolean }[] = [];
  for (let a = 0; a < 360; a += 6) {
    const rad = ((a - 90) * Math.PI) / 180;
    const heavy = a % 30 === 0;
    const r0 = heavy ? 74 : 84;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    out.push({
      d: `M ${(100 + c * r0).toFixed(1)} ${(100 + s * r0).toFixed(1)} L ${(100 + c * 92).toFixed(1)} ${(100 + s * 92).toFixed(1)}`,
      heavy,
    });
  }
  return out;
}
const ROSE_TICKS = roseTicks();

export default function FeaturedCollaboration() {
  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const eyebrowRef = useRef<HTMLParagraphElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const leadRef = useRef<HTMLParagraphElement>(null);
  const perfRef = useRef<SVGPathElement>(null);
  const threadPathRef = useRef<SVGPathElement>(null);
  const planeRef = useRef<HTMLSpanElement>(null);

  /* Filled by the measuring pass that builds the route and read on the scrub
     frame, so both live in refs: a frame cannot afford a layout read. */
  const bandsRef = useRef<Band[]>([]);
  const rectRef = useRef<Rect | null>(null);
  /** Last pen position and the heading it implies, for the aircraft. */
  const flightRef = useRef({ x: NaN, y: NaN, angle: 180, on: false });

  const legEls = useCallback(
    () => [...(sectionRef.current?.querySelectorAll<HTMLElement>("[data-leg]") ?? [])],
    [],
  );

  /* ------------------------------------------------------------------ */
  /*  The thread through this section                                    */
  /*                                                                     */
  /*  The pen arrives on the RIGHT rail out of Education and the copy is  */
  /*  on the left, so the first thing this section does is cross the      */
  /*  page — and that crossing is the section's whole idea: the thread    */
  /*  becomes the route on a chart, flying a leg between each waypoint.   */
  /*                                                                     */
  /*  As everywhere, not one coordinate of the path lives in this file.   */
  /*  The section hands over the three things only it knows — where the   */
  /*  waypoint markers are, where the copy ends, and which box is the     */
  /*  call to action — and `flightRoute()` owns the rest.                 */
  /* ------------------------------------------------------------------ */
  const thread = useThreadSegment({
    id: "collaboration",
    order: 60,
    ref: sectionRef,
    pathRef: threadPathRef,
    range: { end: 0.5 },
    /* One long crossing in, one underline at the bottom, one crossing out:
       this segment has more sideways travel than Education and less than
       Projects, and this keeps all three of them reading as gestures without
       letting them own the section's scroll. */
    pace: { horizontal: 0.3 },
    bands: () => bandsRef.current,
    /* The route never turns back on itself — it works straight down the page
       — so the reading is simply how far it has got, as in Experience. */
    bandMode: "reach",
    onBand: (i) => {
      const section = sectionRef.current;
      if (!section) return;
      /* Three booleans rather than one number, so the CSS below can say
         "drafted" and "built" instead of listing every stage index it also
         applies at. The window builds itself out of these. */
      section.toggleAttribute("data-drafted", i >= 0);
      section.toggleAttribute("data-built", i >= 1);
      section.toggleAttribute("data-live", i >= 2);
      legEls().forEach((li, k) => li.toggleAttribute("data-reached", k <= i));
    },
    /* The aircraft rides the pen itself — not a tween timed to look as if it
       does. `onPen` is called every frame for every segment, so this is also
       correct while the pen is somewhere else on the page: it reports this
       segment's own start or end, both of which are outside the visible band
       below, and the aircraft is simply parked. */
    onPen: (x, y) => {
      const el = planeRef.current;
      const rect = rectRef.current;
      if (!el || !rect) return;
      const f = flightRef.current;
      const inside = y > rect.y + 6 && y < rect.y + rect.height - 6;
      if (inside !== f.on) {
        f.on = inside;
        el.toggleAttribute("data-flying", inside);
      }
      if (!inside) return;
      const dx = x - f.x;
      const dy = y - f.y;
      if (!Number.isNaN(f.x) && Math.hypot(dx, dy) > 0.6) {
        // Heading from travel, eased toward rather than snapped to: the pen's
        // own hand-drawn quiver would otherwise twitch the nose every frame.
        const target = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
        const delta = ((target - f.angle + 540) % 360) - 180;
        f.angle += delta * 0.18;
      }
      f.x = x;
      f.y = y;
      // Transform only: nothing here may reflow the page, or the measuring
      // pass would start chasing its own tail.
      el.style.transform = `translate3d(${(x - rect.x).toFixed(1)}px, ${(y - rect.y).toFixed(1)}px, 0) rotate(${f.angle.toFixed(1)}deg)`;
    },
    build: ({ rect, entry, viewportWidth }) => {
      rectRef.current = rect;
      const legs = legEls();
      const fixEls = legs.map((li) => li.querySelector<HTMLElement>("[data-fix]"));
      const ctaEl = sectionRef.current?.querySelector<HTMLElement>("[data-cta]");
      const frameEl = sectionRef.current?.querySelector<HTMLElement>(".fc-frame");
      if (!legs.length || fixEls.some((f) => !f)) {
        bandsRef.current = [];
        return flightRoute({ rect, entry, viewportWidth, fixes: [] });
      }
      bandsRef.current = legs.map((li) => {
        const r = docRect(li);
        return { top: r.y, bottom: r.y + r.height };
      });

      /* How far the window drops at each waypoint. Measured here, in the pass
         that already measures everything else — never on a scrub frame — and
         written as custom properties the CSS transitions between, so the move
         itself costs nothing and the boxes the route is built from never
         change: a transform on `.fc-side` stays out of `staticRect`. */
      const section = sectionRef.current;
      if (section) {
        const fixTops = fixEls.map((f) => staticRect(f as HTMLElement).y);
        const side = section.querySelector<HTMLElement>(".fc-side");
        const room =
          side && side.offsetHeight
            ? rect.y + rect.height - (staticRect(side).y + side.offsetHeight) - 64
            : Infinity;
        fixTops.forEach((y, i) => {
          if (!i) return;
          // The last stop sits a little lower than its waypoint: the window
          // finishes its build there, and it should not be done with half the
          // section still to scroll.
          const want = y - fixTops[0] + (i === fixTops.length - 1 ? 96 : 0);
          section.style.setProperty(`--step-${i + 1}`, `${Math.round(Math.min(want, room))}px`);
        });
      }
      return flightRoute({
        rect,
        entry,
        viewportWidth,
        fixes: fixEls.map((f) => docRect(f as HTMLElement)),
        header: headerRef.current ? docRect(headerRef.current) : undefined,
        cta: ctaEl ? docRect(ctaEl) : undefined,
        /* Stacked on a narrow screen, the window ends up directly under the
           waypoints; the route is told about it rather than told about a
           breakpoint. Measured by LAYOUT, not by paint: the panel is sticky,
           and where it is stuck depends on where the reader is standing. */
        obstacles: frameEl ? [staticRect(frameEl)] : [],
      });
    },
  });

  /* --- Content motion ------------------------------------------------ */
  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          motion: "(prefers-reduced-motion: no-preference)",
          reduced: "(prefers-reduced-motion: reduce)",
        },
        (ctx) => {
          const { reduced } = ctx.conditions as { motion: boolean; reduced: boolean };
          const section = sectionRef.current;
          if (!section) return;

          const chart = gsap.utils.toArray<SVGPathElement>(
            section.querySelectorAll(".fc-chart-line"),
          );

          if (reduced) {
            gsap.set([...chart, perfRef.current], { drawSVG: "100%" });
            /* No pen, so nothing would ever build the window or light a
               waypoint: the section finishes itself. */
            section.toggleAttribute("data-drafted", true);
            section.toggleAttribute("data-built", true);
            section.toggleAttribute("data-live", true);
            legEls().forEach((li) => li.toggleAttribute("data-reached", true));
            return;
          }

          /* Everything below is CSS keyed off attributes the pen sets, gated
             on `data-pen` so that without JS the case study is simply
             readable and the window simply shows the site. */
          section.setAttribute("data-pen", "");

          gsap.set([...chart, perfRef.current], { drawSVG: "0%" });

          /* The perforation inks itself as the pass comes up. Its own trigger,
             not the pen's: the tear is a fact about the section arriving, and
             the pen is still up in Education when it happens. */
          gsap.to(perfRef.current, {
            drawSVG: "100%",
            ease: "none",
            scrollTrigger: { trigger: section, start: "top bottom", end: "top 64%", scrub: 0.6 },
          });

          gsap.from([eyebrowRef.current, headingRef.current, leadRef.current], {
            opacity: 0,
            y: 16,
            duration: 0.8,
            stagger: 0.12,
            ease: "power2.out",
            scrollTrigger: { trigger: eyebrowRef.current, start: "top 88%" },
          });

          chart.forEach((el) => {
            gsap.to(el, {
              drawSVG: "100%",
              duration: 2.2,
              ease: "power2.inOut",
              scrollTrigger: {
                trigger: el.closest("[data-drift]") ?? el,
                start: "top 94%",
              },
            });
          });

          gsap.utils
            .toArray<HTMLElement>(section.querySelectorAll("[data-drift]"))
            .forEach((el, i) => {
              gsap.to(el, {
                rotation: i % 2 ? -7 : 5,
                duration: 30 + i * 6,
                ease: "sine.inOut",
                repeat: -1,
                yoyo: true,
                /* Paused off-screen. An endless tween on a 300px SVG keeps
                   repainting it whether or not anyone can see it, and this
                   page has several sections' worth of them. */
                scrollTrigger: {
                  trigger: section,
                  start: "top bottom",
                  end: "bottom top",
                  toggleActions: "play pause resume pause",
                },
              });
            });

          /* The stamp is pressed, not faded: it lands hard, once, and stays. */
          gsap.from(section.querySelectorAll("[data-stamp]"), {
            opacity: 0,
            scale: 1.5,
            rotate: -24,
            duration: 0.5,
            ease: "power3.out",
            scrollTrigger: { trigger: section, start: "top 46%" },
          });

          return () => {
            section.removeAttribute("data-pen");
            section.removeAttribute("data-drafted");
            section.removeAttribute("data-built");
            section.removeAttribute("data-live");
          };
        },
      );

      return () => mm.revert();
    },
    { scope: sectionRef },
  );

  const shot = COLLAB.shots[0];

  return (
    <section
      id="collaboration"
      ref={sectionRef}
      className="fc-section relative px-6 pt-24 pb-48 md:px-16 md:pb-[22rem]"
    >
      {/* The stub of the previous stock, the punched line, and the new paper
          below it. The holes are gaps in the sheet — what shows through them
          is the section above. */}
      <div aria-hidden className="fc-stub" />
      <div aria-hidden className="fc-perf">
        <svg width={PERF_W} height={PERF_H} viewBox={`0 0 ${PERF_W} ${PERF_H}`} fill="none">
          <path className="fc-perf-fill" d={PERF.fill} />
          <path ref={perfRef} className="fc-perf-ink" d={PERF.ink} />
        </svg>
      </div>
      <div aria-hidden className="fc-sheet" />


      <div aria-hidden className="fc-field">
        {/* Range rings from a station off the bottom-left corner, instead of a
            fourth ruled grid. Five stroked circles rather than a repeating
            radial gradient under a mask: the gradient version painted the
            whole section every frame it moved, and this is one flat layer. */}
        <div className="fc-ringset">
          <svg viewBox="0 0 1800 1800" fill="none">
            {[300, 460, 620, 780, 940].map((r) => (
              <circle key={r} className="fc-ring" cx="900" cy="900" r={r} />
            ))}
          </svg>
        </div>
        <div data-drift className="fc-rose">
          <svg viewBox="0 0 200 200" fill="none">
            <path className="fc-chart-line" d="M100 8 A92 92 0 1 1 99.9 8" />
            <path className="fc-chart-line" d="M100 26 A74 74 0 1 1 99.9 26" />
            <path className="fc-chart-line" d="M100 70 A30 30 0 1 1 99.9 70" />
            {ROSE_TICKS.map((t, i) => (
              <path key={i} className="fc-chart-line" data-heavy={t.heavy ? "" : undefined} d={t.d} />
            ))}
            <path className="fc-chart-line fc-chart-line--star" d="M100 12 L107 100 L100 188 L93 100 Z" />
            <path className="fc-chart-line fc-chart-line--star" d="M12 100 L100 93 L188 100 L100 107 Z" />
          </svg>
        </div>
        <div data-drift className="fc-course">
          <svg viewBox="0 0 400 300" fill="none">
            <path className="fc-chart-line fc-chart-line--teal" d="M4 296 C 96 214 176 116 396 24" />
            <path className="fc-chart-line fc-chart-line--teal" d="M4 258 C 110 190 186 96 372 4" />
          </svg>
        </div>
      </div>

      {/* This section's stretch of the site-wide thread: above the chart,
          below everything drawn on it. */}
      {thread.d && (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
          viewBox={thread.viewBox}
          preserveAspectRatio="none"
          fill="none"
        >
          <path
            ref={threadPathRef}
            className="draw-line site-thread"
            vectorEffect="non-scaling-stroke"
            d={thread.d}
          />
        </svg>
      )}

      {/* The aircraft sits exactly where the pen is, nose along its travel.
          It lives one layer above the route and below the copy. */}
      <div aria-hidden className="fc-air">
        <span ref={planeRef} className="fc-plane">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M12 1.6 L13.6 8.4 L22.6 14.4 L22.6 16.4 L13.6 13.4 L13.6 18.8 L16.4 21.2 L16.4 22.4 L12 20.9 L7.6 22.4 L7.6 21.2 L10.4 18.8 L10.4 13.4 L1.4 16.4 L1.4 14.4 L10.4 8.4 Z" />
          </svg>
        </span>
      </div>

      <div className="relative z-10 mx-auto max-w-6xl">
        <div ref={headerRef} className="fc-header">
          <p
            ref={eyebrowRef}
            className="font-body text-sm uppercase tracking-[0.25em] text-accent"
          >
            {COLLAB.eyebrow}
          </p>
          <div ref={headingRef} className="fc-title-row">
            {COLLAB.logo && (
              <span aria-hidden className="fc-logo">
                <Image
                  src={COLLAB.logo}
                  alt=""
                  width={156}
                  height={131}
                  className="h-full w-full object-contain"
                />
              </span>
            )}
            <h2 className="font-display text-3xl leading-tight text-ink md:text-4xl">
              {COLLAB.name}
            </h2>
            <span className="fc-meta font-body">{COLLAB.meta}</span>
          </div>
          <p ref={leadRef} className="fc-lead font-body">
            {COLLAB.lead}
          </p>
        </div>

        {/* Pressed into the corner as the pass comes up. */}
        <span aria-hidden data-stamp className="fc-stamp">
          <span className="fc-stamp-top">{COLLAB.stamp.top}</span>
          <span className="fc-stamp-mid">{COLLAB.stamp.mid}</span>
          <span className="fc-stamp-bottom">{COLLAB.stamp.bottom}</span>
        </span>

        <div className="fc-body">
          {/* The legs of the route. Each one carries its own waypoint marker,
              and the marker's box IS the fix the geometry flies through — CSS
              offsets them from one another, so every course change on the
              page is something the layout decided. */}
          <ol className="fc-legs">
            {COLLAB.stages.map((s, i) => (
              <li key={s.code} data-leg className="fc-leg">
                <span aria-hidden data-fix className="fc-fix">
                  <svg viewBox="0 0 26 26" fill="none">
                    <path className="fc-fix-mark" d="M13 3.4 L22.6 20.6 L3.4 20.6 Z" />
                    <circle className="fc-fix-core" cx="13" cy="15.2" r="2.5" />
                  </svg>
                </span>
                <p className="fc-wpt font-body">
                  WPT {String(i + 1).padStart(2, "0")}
                  <span aria-hidden className="fc-wpt-rule" />
                  {s.code}
                </p>
                <h3 className="fc-leg-title font-display">{s.title}</h3>
                <p className="fc-leg-body font-body">{s.body}</p>
              </li>
            ))}
          </ol>

          {/* The window and the stub. On a wide screen the pair travels
              together as one sticky column; on a narrow one the wrapper goes
              `display: contents` and only the window travels, because a
              sticky block that tall would take half a phone screen with it. */}
          <div className="fc-side">
          {/* The site, building itself as the route flies. Wireframe while the
              brief is being read, blocked out while the build is described,
              and the live thing at the last waypoint. */}
          <div className="fc-panel">
            <div className="fc-frame">
              <div className="fc-chrome">
                <svg className="fc-dots" viewBox="0 0 46 12" fill="none" aria-hidden>
                  <circle className="fc-dot" cx="6" cy="6" r="4" />
                  <circle className="fc-dot" cx="23" cy="6" r="4" />
                  <circle className="fc-dot" cx="40" cy="6" r="4" />
                </svg>
                <span className="fc-bar">
                  <span
                    className="fc-url font-body"
                    style={{ "--url-len": `${COLLAB.domain.length + 1}ch` } as CSSProperties}
                  >
                    {COLLAB.domain}
                  </span>
                  <span aria-hidden className="fc-caret" />
                </span>
                <span aria-hidden className="fc-live font-body">LIVE</span>
              </div>

              <div className="fc-window">
                <svg className="fc-wire" viewBox="0 0 400 216" fill="none" aria-hidden>
                  <g className="fc-wire-fills">
                    <rect x="14" y="12" width="372" height="24" rx="3" />
                    <rect x="14" y="44" width="372" height="88" rx="3" />
                    <rect x="14" y="142" width="114" height="58" rx="3" />
                    <rect x="143" y="142" width="114" height="58" rx="3" />
                    <rect x="272" y="142" width="114" height="58" rx="3" />
                  </g>
                  <g className="fc-wire-ink">
                    <rect className="fc-wl" style={{ "--i": 0 } as CSSProperties} x="14" y="12" width="372" height="24" rx="3" pathLength={1} />
                    <path className="fc-wl" style={{ "--i": 1 } as CSSProperties} d="M24 24 L44 24 M300 24 L318 24 M326 24 L344 24 M352 24 L370 24" pathLength={1} />
                    <rect className="fc-wl" style={{ "--i": 2 } as CSSProperties} x="14" y="44" width="372" height="88" rx="3" pathLength={1} />
                    <path className="fc-wl" style={{ "--i": 3 } as CSSProperties} d="M34 72 L188 72 M34 88 L146 88" pathLength={1} />
                    <rect className="fc-wl" style={{ "--i": 4 } as CSSProperties} x="34" y="100" width="66" height="16" rx="8" pathLength={1} />
                    <rect className="fc-wl" style={{ "--i": 5 } as CSSProperties} x="14" y="142" width="114" height="58" rx="3" pathLength={1} />
                    <rect className="fc-wl" style={{ "--i": 6 } as CSSProperties} x="143" y="142" width="114" height="58" rx="3" pathLength={1} />
                    <rect className="fc-wl" style={{ "--i": 7 } as CSSProperties} x="272" y="142" width="114" height="58" rx="3" pathLength={1} />
                    <path className="fc-wl" style={{ "--i": 8 } as CSSProperties} d="M26 178 L104 178 M26 190 L82 190 M155 178 L233 178 M155 190 L211 190 M284 178 L362 178 M284 190 L340 190" pathLength={1} />
                  </g>
                </svg>

                {shot && (
                  <span className="fc-shot">
                    <Image
                      src={shot}
                      alt={`${COLLAB.name} — the live site`}
                      fill
                      sizes="(min-width: 768px) 50vw, 100vw"
                      className="object-cover object-top"
                    />
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Not inside the panel: the panel is sticky, and a stub that
              travelled with it would take half a phone screen away with it. */}
          <div className="fc-notes">
            <ul className="fc-tags">
              {COLLAB.tags.map((t) => (
                <li key={t} className="fc-tag font-body">
                  {t}
                </li>
              ))}
            </ul>

            {/* The stub the pass was torn from, printed with the facts a
                recruiter actually asks for. It fills the half of the page the
                window leaves empty — and it is the same piece of paper the
                section arrived on. */}
            <dl className="fc-pass font-body">
              {COLLAB.pass.map((f) => (
                <div key={f.label} className="fc-pass-row">
                  <dt className="fc-pass-label">{f.label}</dt>
                  <dd className="fc-pass-value">{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          </div>
        </div>

        <div className="fc-actions">
          {/* The last fix on the route, labelled like the other three — the
              underline the pen draws here is the section's full stop. */}
          <p className="fc-wpt fc-dest font-body">
            DEST
            <span aria-hidden className="fc-wpt-rule" />
            USFA
          </p>
          {/* The measured box is the WRAPPER: MagneticLink writes a transform
              on the anchor itself, and the route's underline is derived from
              this box. */}
          <span data-cta className="fc-cta">
            <MagneticLink href={COLLAB.href} external className="fc-link font-body">
              <span aria-hidden className="fc-link-punch" />
              <span>Visit {COLLAB.domain}</span>
              <span aria-hidden className="fc-arrow">↗</span>
            </MagneticLink>
          </span>
        </div>
      </div>
    </section>
  );
}
