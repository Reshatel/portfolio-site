"use client";

import { useCallback, useRef, type CSSProperties } from "react";
import Image from "next/image";
import { useGSAP } from "@gsap/react";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { useThreadSegment, type Band } from "@/components/thread/SiteThread";
import { docRect, projectFrames } from "@/components/thread/geometry";
import { PROJECTS } from "@/components/projects/projects";
import MagneticLink from "@/components/ui/MagneticLink";

/**
 * The placeholder behind the glass until a real screenshot lands in
 * `public/projects/`. Deliberately a wireframe rather than a grey box or the
 * words "coming soon": a lo-fi mock is a thing a developer would actually
 * have, so it reads as intentional, and it pans nicely under the parallax.
 * Give a project an `image` and this is simply never rendered.
 */
function PlateSketch({ index }: { index: number }) {
  return (
    <div className="pj-sketch" data-flip={index % 2 === 1 ? "" : undefined}>
      <div className="pj-sk-top">
        <div className="pj-sk-col">
          <span className="pj-sk-bar" style={{ width: "56%" }} />
          <span className="pj-sk-bar pj-sk-bar--thin" style={{ width: "88%" }} />
          <span className="pj-sk-bar pj-sk-bar--thin" style={{ width: "72%" }} />
          <span className="pj-sk-pill" />
        </div>
        <div className="pj-sk-panel" />
      </div>
      <div className="pj-sk-row">
        <div className="pj-sk-tile" />
        <div className="pj-sk-tile" />
        <div className="pj-sk-tile" />
      </div>
      <span className="pj-sk-num">{String(index + 1).padStart(2, "0")}</span>
    </div>
  );
}

/**
 * The drawn figure that sits in the band between two rows.
 *
 * Rendered INSIDE the row rather than scattered across the section at fixed
 * percentages: a percentage is only correct for the number of projects that
 * happened to be there when it was picked, and this section is meant to take
 * another one without anybody re-checking the background. Hung off the row, it
 * lands in a real gap however many rows there are.
 *
 * Four shapes on rotation, and the side alternates with the card, so the band
 * is filled on whichever half the layout has just left empty.
 */
const DECOS = [
  { teal: true, paths: ["M12 128 C12 54 54 14 128 20", "M38 138 C38 82 72 52 130 58"] },
  { teal: false, paths: ["M70 8 A62 62 0 1 1 69.9 8", "M70 40 A30 30 0 1 1 69.9 40"] },
  { teal: true, paths: ["M6 76 L76 6", "M22 108 L108 22", "M40 136 L136 40"] },
  { teal: false, paths: ["M8 132 A124 124 0 0 1 132 8", "M98 106 A24 24 0 1 1 97.9 106"] },
];

function RowDeco({ index }: { index: number }) {
  const deco = DECOS[index % DECOS.length];
  return (
    <span aria-hidden data-deco className="pj-row-deco">
      <svg viewBox="0 0 140 140" fill="none" className="h-full w-full">
        {deco.paths.map((d, i) => (
          <path key={i} className={deco.teal ? "pj-figure-teal" : "pj-figure"} d={d} />
        ))}
      </svg>
    </span>
  );
}

export default function Projects() {
  const sectionRef = useRef<HTMLElement>(null);
  const eyebrowRef = useRef<HTMLParagraphElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const leadRef = useRef<HTMLParagraphElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const threadPathRef = useRef<SVGPathElement>(null);

  /* Two bands per row — see the note on `onBand` below. Filled by the same
     measuring pass that builds the thread, and read by the driver on every
     scrub frame, so they have to sit in a ref: a frame cannot afford a layout
     read of its own. */
  const bandsRef = useRef<Band[]>([]);

  const rows = useCallback(
    () => [...(sectionRef.current?.querySelectorAll<HTMLElement>("[data-row]") ?? [])],
    [],
  );

  /* ------------------------------------------------------------------ */
  /*  The thread through this section                                    */
  /*                                                                     */
  /*  The approved motif here is "the line outlines the card", so this    */
  /*  is the first section where the pen leaves the margins and works on  */
  /*  the content itself. As everywhere else, not one coordinate of the   */
  /*  path lives in this file: the section hands over the only two things */
  /*  it knows — which boxes are the media frames, and which boxes are    */
  /*  the whole rows they sit in — and `projectFrames()` owns the rest.   */
  /* ------------------------------------------------------------------ */
  const thread = useThreadSegment({
    id: "projects",
    order: 40,
    ref: sectionRef,
    pathRef: threadPathRef,
    /* No start: the driver begins this segment exactly where Experience's
       ended, so the seam is one number rather than two that have to agree. */
    range: { end: 0.5 },
    /* Wrapping a card is mostly sideways travel, and so is every crossing
       between two of them. At full weight the section would spend almost all
       its scroll sweeping; this leaves the sweeps room to read as strokes
       without letting them own the page. */
    pace: { horizontal: 0.28 },
    bands: () => bandsRef.current,
    /* The pen never turns back on itself here — it works straight down the
       page — so the reading is how far it has got, exactly as in Experience.
       A turn-based reading would fire on every corner of every card. */
    bandMode: "reach",
    /**
     * TWO bands per row, so one index carries two beats:
     *   even → the pen has arrived at this card (the copy reveals)
     *   odd  → the pen has closed the wrap (the window develops, the sketched
     *          browser chrome inks in, the address bar types itself)
     * No second ScrollTrigger and no thresholds: both beats are literally
     * caused by where the pen is, and both reverse for free on the way up.
     */
    onBand: (index) => {
      const active = index < 0 ? -1 : Math.floor(index / 2);
      const closed = index >= 0 && index % 2 === 1;
      rows().forEach((li, i) => {
        li.toggleAttribute("data-reached", i <= active);
        li.toggleAttribute("data-active", i === active);
        li.toggleAttribute("data-framed", i < active || (i === active && closed));
      });
    },
    build: ({ rect, entry, viewportWidth }) => {
      const items = rows();
      const frameEls = items.map((li) => li.querySelector<HTMLElement>("[data-frame]"));
      if (!items.length || frameEls.some((el) => !el)) {
        bandsRef.current = [];
        return projectFrames({ rect, entry, viewportWidth, frames: [] });
      }
      const frames = frameEls.map((el) => docRect(el as HTMLElement));
      bandsRef.current = frames.flatMap((r) => {
        const bottom = r.y + r.height;
        return [
          // Arrival: a touch above the top edge, where the pen leaves the rail.
          { top: r.y - 30, bottom },
          /* Closed: a touch BELOW the bottom edge. The wrap's last stroke runs
             along that edge at a constant y, so the pen's y reaches the bottom
             at the START of it; waiting for the crossing to begin dropping is
             what makes the beat land when the wrap actually finishes. */
          { top: bottom + 22, bottom: bottom + 22 },
        ];
      });
      return projectFrames({ rect, entry, viewportWidth, frames });
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

          const figures = gsap.utils.toArray<SVGPathElement>([
            ...(fieldRef.current?.querySelectorAll("path") ?? []),
            ...section.querySelectorAll("[data-deco] path"),
          ]);

          if (reduced) {
            gsap.set(figures, { drawSVG: "100%" });
            /* The pen drives this section's state, and with reduced motion
               there is no pen — so light every row, or the whole gallery
               would sit half-revealed forever. */
            rows().forEach((li) => {
              li.toggleAttribute("data-reached", true);
              li.toggleAttribute("data-framed", true);
              li.toggleAttribute("data-open", true);
              // No scroll-driven strip, so the frame rests on the first shot.
              li.querySelector("[data-ticks] .pj-tick")?.toggleAttribute("data-on", true);
            });
            return;
          }

          /* Everything past this point is CSS keyed off attributes the pen
             sets. The gate means that without JS, or before hydration, the
             section is plain readable copy — the reveal is an enhancement,
             never the thing standing between a reader and the work. */
          section.setAttribute("data-pen", "");

          gsap.set(figures, { drawSVG: "0%" });

          gsap.from([eyebrowRef.current, headingRef.current, leadRef.current], {
            opacity: 0,
            y: 16,
            duration: 0.8,
            stagger: 0.12,
            ease: "power2.out",
            scrollTrigger: { trigger: eyebrowRef.current, start: "top 88%" },
          });

          gsap.to(figures, {
            drawSVG: "100%",
            duration: 1.6,
            stagger: 0.24,
            ease: "power2.inOut",
            scrollTrigger: { trigger: section, start: "top 72%" },
          });
          gsap.utils
            .toArray<HTMLElement>(fieldRef.current?.querySelectorAll("[data-drift]") ?? [])
            .forEach((el, i) => {
              gsap.to(el, {
                y: i % 2 ? 22 : -18,
                rotation: i % 2 ? -5 : 4,
                duration: 13 + i * 3,
                ease: "sine.inOut",
                repeat: -1,
                yoyo: true,
                /* Paused while the section is off-screen: an endless
                   tween keeps writing styles and repainting its layer whether
                   or not anyone can see it, and this page has several
                   sections' worth of them. */
                scrollTrigger: {
                  trigger: section,
                  start: "top bottom",
                  end: "bottom top",
                  toggleActions: "play pause resume pause",
                },
              });
            });

          /* The gallery, without a pin.
             ---------------------------------------------------------------
             A pinned horizontal rail is the one thing this page cannot have:
             a pinned section goes `position: fixed`, its document box stops
             existing, and that box is exactly what the thread driver measures
             its windows from. So the sideways motion happens INSIDE each
             frame instead — the plate is wider than the window it sits in and
             pans across it as the row travels the viewport, in the direction
             that row's card leans. You get the drift of a gallery with the
             page still scrolling straight down.

             Crucially the transform is on the PLATE, never on the frame: the
             frame's box is what the pen is measured against, and a descendant's
             transform stays out of its parent's box. */
          rows().forEach((li, i) => {
            const frame = li.querySelector<HTMLElement>("[data-frame]");

            /* The one beat in this section that is NOT the pen's.
               ------------------------------------------------------------
               Everything else here is caused by where the pen is, and the
               window used to be too: it developed when the wrap closed. But
               measured against the viewport that lands late — with the card
               dead centre on screen the pen is still about 130px short of its
               bottom edge, so the window opened after the reader had already
               moved on. The card opening "when it reaches the middle of the
               screen" is a VIEWPORT fact, and tying it to the pen would only
               approximate it: the scrub is a lag, so how far the pen has got
               by the time a card is centred depends on how fast you scroll.
               So this one is a plain trigger, deliberately.

               Ordering still holds: the pen reaches a card some 200px before
               that card is centred, so the copy is always already in when the
               window opens, and the wrap closes after. Three beats, and each
               one lands later than the last. */
            if (frame) {
              ScrollTrigger.create({
                trigger: frame,
                start: "center 82%",
                onEnter: () => li.setAttribute("data-open", ""),
                onLeaveBack: () => li.removeAttribute("data-open"),
              });
            }

            const plate = li.querySelector<HTMLElement>("[data-plate]");
            if (!plate) return;

            if (plate.dataset.mode === "strip") {
              /* The filmstrip.
                 ----------------------------------------------------------
                 Several screenshots sit side by side behind the glass and the
                 row's own travel through the viewport walks along them. This
                 is what the "gallery without a pin" was built for: the frame
                 never moves, so the pen's wrap is still measured off a box
                 that holds still, and all the sideways motion is a child's.

                 It does NOT pan at a constant rate. A constant pan means that
                 most of the time you are looking at the seam between two
                 shots rather than at a shot; the eye never gets to read one.
                 So each shot gets a DWELL and then a quick slide — same
                 scrubbed, reversible mechanism, but it rests where there is
                 something to look at. */
              const n = Number(plate.dataset.count) || 1;
              const ticks = [
                ...li.querySelectorAll<HTMLElement>("[data-ticks] .pj-tick"),
              ];
              const DWELL = 0.42; // of each shot-to-shot unit
              const proxy = { p: 0 };
              const paint = () => {
                const u = proxy.p * (n - 1);
                const k = Math.min(n - 2, Math.floor(u));
                const f = u - k;
                const t = Math.min(1, Math.max(0, (f - DWELL) / (1 - DWELL)));
                const eased = t * t * (3 - 2 * t); // smoothstep
                // One shot is 100/n of the strip's own width.
                gsap.set(plate, { xPercent: (-(k + eased) * 100) / n });
                const shown = Math.round(k + eased);
                ticks.forEach((el, j) => el.toggleAttribute("data-on", j === shown));
              };
              /* Timed off the FRAME, not the row. Two reasons, both measured:
                 the row is much taller than the frame on a narrow screen, so a
                 row-timed strip would spend its first shot while the picture
                 is still off the bottom of the page; and on a wide one the
                 first dwell ended at almost exactly the moment the window
                 opens — so the first screenshot was already sliding away by
                 the time anyone could see it. Starting just after the window
                 opens (which is `center 82%`) gives shot one a real pause. */
              gsap.to(proxy, {
                p: 1,
                ease: "none",
                onUpdate: paint,
                scrollTrigger: {
                  trigger: frame ?? li,
                  start: "center 76%",
                  end: "bottom 18%",
                  scrub: true,
                  invalidateOnRefresh: true,
                },
              });
              paint();
              return;
            }

            /* A single screenshot is held still — it is exactly as wide as the
               glass, and panning it would only crop it. Only the generative
               placeholder, which has no edges worth keeping, drifts. */
            if (plate.dataset.mode !== "sketch") return;

            const dir = i % 2 === 0 ? 1 : -1;
            gsap.fromTo(
              plate,
              { xPercent: -4.5 * dir },
              {
                xPercent: 4.5 * dir,
                ease: "none",
                scrollTrigger: {
                  trigger: li,
                  start: "top bottom",
                  end: "bottom top",
                  scrub: true,
                  invalidateOnRefresh: true,
                },
              },
            );
          });

          /* The band figures drift like the ones in Stack and Experience, but
             they are drawn per row rather than all at once: at five rows the
             last of them is a page and a half below the first. */
          gsap.utils
            .toArray<HTMLElement>(section.querySelectorAll("[data-deco]"))
            .forEach((el, i) => {
              gsap.to(el.querySelectorAll("path"), {
                drawSVG: "100%",
                duration: 1.5,
                stagger: 0.2,
                ease: "power2.inOut",
                scrollTrigger: { trigger: el, start: "top 92%" },
              });
              gsap.to(el, {
                y: i % 2 ? 16 : -14,
                rotation: i % 2 ? -5 : 4,
                duration: 12 + i * 2,
                ease: "sine.inOut",
                repeat: -1,
                yoyo: true,
                /* Paused while the section is off-screen: an endless
                   tween keeps writing styles and repainting its layer whether
                   or not anyone can see it, and this page has several
                   sections' worth of them. */
                scrollTrigger: {
                  trigger: section,
                  start: "top bottom",
                  end: "bottom top",
                  toggleActions: "play pause resume pause",
                },
              });
            });

          return () => section.removeAttribute("data-pen");
        },
      );

      return () => mm.revert();
    },
    { scope: sectionRef },
  );

  return (
    <section
      id="projects"
      ref={sectionRef}
      className="pj-section relative bg-paper px-6 pt-28 pb-52 md:px-16 md:pb-80"
    >
      {/* Graph paper under everything. Stack rules its section with dots;
          this one uses a cross-rule, so the two read as the same hand without
          reading as the same page. Masked at both seams so it never becomes a
          border. */}
      <div aria-hidden className="pj-grid" />

      {/* Drawn figures in the outer margins — the only part of this section
          the zig-zag of cards leaves genuinely bare. */}
      <div ref={fieldRef} aria-hidden className="pj-field">
        <div data-drift className="absolute left-[-3%] top-[16%] hidden h-44 w-44 xl:block">
          <svg className="h-full w-full" viewBox="0 0 160 160" fill="none">
            <path className="pj-figure-teal" d="M14 148 C14 60 62 16 150 24" />
            <path className="pj-figure-teal" d="M44 158 C44 94 84 58 152 64" />
          </svg>
        </div>
        <div data-drift className="absolute bottom-[6%] right-[-3%] hidden h-40 w-40 xl:block">
          <svg className="h-full w-full" viewBox="0 0 160 160" fill="none">
            <path className="pj-figure" d="M80 8 A72 72 0 1 1 79.9 8" />
            <path className="pj-figure" d="M80 42 A38 38 0 1 1 79.9 42" />
          </svg>
        </div>
      </div>

      {/* This section's stretch of the site-wide thread. Above the paper,
          below everything drawn on it — so a wrap passes behind the card it
          is wrapping and the frame sits on top of its own outline. */}
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

      <div className="relative z-10 mx-auto max-w-6xl">
        <p
          ref={eyebrowRef}
          className="font-body text-sm uppercase tracking-[0.25em] text-ink-muted"
        >
          Projects
          {/* Counts itself, so a sixth project needs no edit here either. */}
          <span className="pj-count">{String(PROJECTS.length).padStart(2, "0")}</span>
        </p>
        <h2
          ref={headingRef}
          className="mt-5 max-w-2xl font-display text-3xl leading-snug text-ink md:text-4xl"
        >
          Things I&rsquo;ve built, and why they exist.
        </h2>
        <p ref={leadRef} className="pj-lead font-body">
          Every one of these is live. The address in each frame is the real one — open
          any of them and you land on the thing I actually shipped.
        </p>

        <ol className="pj-list mt-28 md:mt-48">
          {PROJECTS.map((p, i) => (
            <li
              key={p.name}
              data-row
              data-side={i % 2 === 0 ? "right" : "left"}
              className="pj-row"
            >
              {/* Fills the band this row leaves below it, on the half the
                  layout has just emptied. */}
              <RowDeco index={i} />

              {/* The measured box. Nothing may transform this element — the
                  pen's wrap is derived from it. Hover and parallax live on
                  descendants for exactly that reason. */}
              <a
                data-frame
                href={p.href}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${p.name}`}
                className="pj-frame"
              >
                <div className="pj-chrome">
                  <svg className="pj-dots" viewBox="0 0 46 12" fill="none" aria-hidden>
                    <circle className="pj-dot" cx="6" cy="6" r="4" />
                    <circle className="pj-dot" cx="23" cy="6" r="4" />
                    <circle className="pj-dot" cx="40" cy="6" r="4" />
                  </svg>
                  <span className="pj-bar">
                    <span
                      className="pj-url font-body"
                      style={{ "--url-len": `${p.domain.length + 1}ch` } as CSSProperties}
                    >
                      {p.domain}
                    </span>
                    <span aria-hidden className="pj-caret" />
                  </span>
                  {/* Which screenshot the frame is showing. In the chrome bar
                      rather than over the picture, and it keeps the browser
                      metaphor honest. */}
                  {(p.shots?.length ?? 0) > 1 && (
                    <span aria-hidden data-ticks className="pj-ticks">
                      {p.shots?.map((src) => (
                        <span key={src} className="pj-tick" />
                      ))}
                    </span>
                  )}
                </div>

                <div className="pj-window">
                  {/* One element, three jobs, decided by how many screenshots
                      the data file lists — see `shots` there. */}
                  <div
                    data-plate
                    data-mode={
                      !p.shots?.length ? "sketch" : p.shots.length === 1 ? "single" : "strip"
                    }
                    data-count={p.shots?.length ?? 0}
                    className="pj-plate"
                    style={
                      (p.shots?.length ?? 0) > 1
                        ? { width: `${(p.shots as string[]).length * 100}%` }
                        : undefined
                    }
                  >
                    {p.shots?.length ? (
                      p.shots.map((src, k) => (
                        <span key={src} className="pj-shot">
                          <Image
                            src={src}
                            alt={`${p.name} — screenshot ${k + 1}`}
                            fill
                            sizes="(min-width: 768px) 50vw, 100vw"
                            className="object-cover object-center"
                          />
                        </span>
                      ))
                    ) : (
                      <PlateSketch index={i} />
                    )}
                  </div>
                </div>

                <span aria-hidden className="pj-open">
                  Open <span className="pj-open-arrow">↗</span>
                </span>
              </a>

              <div className="pj-copy">
                <p className="pj-head">
                  <span aria-hidden className="pj-index font-display">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="pj-status font-body">{p.status}</span>
                </p>
                <h3 className="pj-title font-display text-2xl leading-tight text-ink md:text-3xl">
                  {p.name}
                  {p.subtitle && <span className="pj-subtitle">{p.subtitle}</span>}
                </h3>
                <p className="pj-hook font-body">{p.hook}</p>
                <p className="pj-body font-body text-sm leading-relaxed text-ink-muted">
                  {p.body}
                </p>
                <ul className="pj-tags">
                  {p.tags.map((tag) => (
                    <li key={tag} className="pj-tag font-body">
                      {tag}
                    </li>
                  ))}
                </ul>
                <p className="pj-actions">
                  <MagneticLink href={p.href} external className="pj-link font-body">
                    <span>{p.status === "Live" ? "Visit live site" : "Open project"}</span>
                    <span aria-hidden className="pj-arrow">
                      ↗
                    </span>
                  </MagneticLink>
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
