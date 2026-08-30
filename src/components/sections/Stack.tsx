"use client";

import { useCallback, useRef, type CSSProperties } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/lib/gsap";
import { useThreadSegment, type Band } from "@/components/thread/SiteThread";
import { docRect, serpentine } from "@/components/thread/geometry";
import { STACK_CATEGORIES } from "@/components/stack/icons";

export default function Stack() {
  const sectionRef = useRef<HTMLElement>(null);
  const eyebrowRef = useRef<HTMLParagraphElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const threadPathRef = useRef<SVGPathElement>(null);

  /* The category boxes, filled by the same measuring pass that builds the
     thread. The thread reads them on every scrub frame, so they have to be
     sitting in a ref — a frame cannot afford a layout read of its own. */
  const bandsRef = useRef<Band[]>([]);

  const rows = useCallback(
    () => [
      ...(sectionRef.current?.querySelectorAll<HTMLElement>("[data-stack-row]") ?? []),
    ],
    [],
  );

  /* ------------------------------------------------------------------ */
  /*  The thread through this section                                    */
  /*                                                                     */
  /*  The line itself is not drawn here — `serpentine()` in the thread    */
  /*  folder owns every point of it. All this section does is hand over   */
  /*  the two things only it can know: which boxes are the blocks, and    */
  /*  which box is the headline the opening sweep runs under.             */
  /* ------------------------------------------------------------------ */
  const thread = useThreadSegment({
    id: "stack",
    order: 20,
    ref: sectionRef,
    pathRef: threadPathRef,
    /* Hands over when this section's bottom edge reaches mid-screen. The
       start is not configured: the driver begins this segment exactly where
       About's ended, so the seam is one number, not two that have to agree. */
    range: { end: 0.5 },
    /* A pixel of sideways travel costs a third of a pixel of downward travel.
       Up from 0.22: at that weight each sweep crossed the page in about 155px
       of scroll, which read as a snap rather than a stroke. This buys it half
       again as much — paid for out of the rails, which is the trade the
       weight always makes. */
    pace: { horizontal: 0.34 },
    /* There is deliberately no per-segment scrub. A scrub is a lag, and two
       different lags either side of a seam are exactly what made the thread
       read as two lines — see the driver note in SiteThread. Trailing is one
       global setting for the whole site. */
    bands: () => bandsRef.current,
    onBand: (index) =>
      rows().forEach((row, i) => {
        if (i === index) row.setAttribute("data-active", "");
        else row.removeAttribute("data-active");
      }),
    build: ({ rect, entry, viewportWidth }) => {
      const boxes = rows().map(docRect);
      bandsRef.current = boxes.map((r) => ({ top: r.y, bottom: r.y + r.height }));
      return serpentine({
        rect,
        entry,
        viewportWidth,
        rows: boxes,
        headline: headingRef.current ? docRect(headingRef.current) : undefined,
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

          const strokes = gsap.utils.toArray<SVGPathElement>(
            section.querySelectorAll("[data-icon] [data-stroke]"),
          );
          const fills = gsap.utils.toArray<SVGPathElement>(
            section.querySelectorAll("[data-icon] [data-fill]"),
          );
          const figures = gsap.utils.toArray<SVGPathElement>(
            fieldRef.current?.querySelectorAll("path") ?? [],
          );

          if (reduced) {
            gsap.set([...strokes, ...figures], { drawSVG: "100%" });
            gsap.set(fills, { fillOpacity: 1 });
            gsap.set(
              strokes.filter((p) => p.dataset.retires === "1"),
              { strokeOpacity: 0 },
            );
            return;
          }

          gsap.set([...strokes, ...figures], { drawSVG: "0%" });
          gsap.set(fills, { fillOpacity: 0 });

          gsap.from([eyebrowRef.current, headingRef.current], {
            opacity: 0,
            y: 16,
            duration: 0.8,
            stagger: 0.12,
            ease: "power2.out",
            scrollTrigger: { trigger: eyebrowRef.current, start: "top 88%" },
          });

          /* Background field: drawn in once, then left to drift. Deliberately
             slower and fainter than anything in the foreground — it is there
             to stop the page reading as blank paper, not to be looked at. */
          gsap.to(figures, {
            drawSVG: "100%",
            duration: 1.6,
            stagger: 0.22,
            ease: "power2.inOut",
            scrollTrigger: { trigger: section, start: "top 75%" },
          });
          gsap.utils
            .toArray<HTMLElement>(fieldRef.current?.querySelectorAll("[data-drift]") ?? [])
            .forEach((el, i) => {
              gsap.to(el, {
                y: i % 2 ? 22 : -18,
                rotation: i % 2 ? -6 : 5,
                duration: 11 + i * 3,
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

          rows().forEach((row) => {
            /* Fires a touch AFTER the thread's pen reaches this level: the
               thread is scrubbed with a 0.8 lag, so a trigger level slightly
               below the pen's is what makes the icons look like they follow
               the line rather than anticipate it. */
            const tl = gsap.timeline({
              scrollTrigger: { trigger: row, start: "top 78%" },
            });

            // Deliberately NOT "[data-station-group] > *": that swept up the
            // accent rule too, and GSAP writes an inline `transform` when it
            // animates x — which outranks the CSS `scaleX(1)` the active state
            // relies on, so the rule silently never appeared.
            tl.from(row.querySelectorAll("[data-reveal]"), {
              opacity: 0,
              x: -14,
              duration: 0.6,
              stagger: 0.08,
              ease: "power2.out",
            });

            gsap.utils
              .toArray<HTMLElement>(row.querySelectorAll("[data-icon]"))
              .forEach((icon, i) => {
                const at = i * 0.09;
                const iconStrokes = icon.querySelectorAll("[data-stroke]");
                const fill = icon.querySelector("[data-fill]");

                // An icon's own strokes draw almost together — the tiny inner
                // stagger is the pen lifting between strokes, not a queue.
                tl.to(
                  iconStrokes,
                  {
                    drawSVG: "100%",
                    duration: 0.75,
                    ease: "power2.inOut",
                    stagger: 0.05,
                  },
                  at,
                );

                // Brand marks are filled shapes, so the outline hands over:
                // the fill rises into the finished contour and the stroke
                // retires, leaving the mark exactly as its owner drew it.
                if (fill) {
                  tl.to(
                    fill,
                    { fillOpacity: 1, duration: 0.55, ease: "power1.out" },
                    at + 0.45,
                  );
                  tl.to(
                    iconStrokes,
                    { strokeOpacity: 0, duration: 0.5, ease: "power1.out" },
                    at + 0.62,
                  );
                }

                tl.from(
                  icon.querySelector("[data-label]"),
                  { opacity: 0, y: 8, duration: 0.45, ease: "power2.out" },
                  at + 0.4,
                );
              });
          });
        },
      );

      return () => mm.revert();
    },
    { scope: sectionRef },
  );

  return (
    <section
      id="stack"
      ref={sectionRef}
      className="stack-section relative overflow-hidden bg-paper px-6 py-28 md:px-16"
    >
      {/* Ruled field, masked to fade out at both section seams so it never
          reads as a border. */}
      <div aria-hidden className="stack-grid" />

      {/* Drawn figures. Placed against the layout, not scattered: each one
          sits where the grid leaves a genuine hole, and the right-hand side
          gets the weight because that is where the four-column grid runs out
          of items. */}
      <div ref={fieldRef} aria-hidden className="stack-field">
        <div data-drift className="absolute right-[3%] top-[6%] h-56 w-56 md:h-80 md:w-80">
          <svg className="h-full w-full" viewBox="0 0 200 200" fill="none">
            <path className="stack-figure" d="M20 150 C20 60 80 20 180 34" />
            <path className="stack-figure" d="M52 172 C52 96 100 62 178 74" />
          </svg>
        </div>

        {/* The one structurally empty cell — Animation & 3D has three items in
            a four-column grid — so this fills a real hole rather than sitting
            on top of an icon. */}
        <div
          data-drift
          className="absolute right-[11%] top-[45%] hidden h-40 w-40 md:block"
        >
          <svg className="h-full w-full" viewBox="0 0 160 160" fill="none">
            <path className="stack-figure" d="M80 8 A72 72 0 1 1 79.9 8" />
            <path className="stack-figure" d="M80 44 A36 36 0 1 1 79.9 44" />
          </svg>
        </div>

        {/* Right margin beside CMS & Backend. Narrow on purpose: the thread's
            right rail runs past here on the rows it wraps from that side. */}
        <div
          data-drift
          className="absolute right-[3%] top-[67%] hidden h-24 w-24 lg:block"
        >
          <svg className="h-full w-full" viewBox="0 0 60 60" fill="none">
            <path className="stack-figure-teal" d="M4 34 L34 4" />
            <path className="stack-figure-teal" d="M12 46 L46 12" />
            <path className="stack-figure-teal" d="M22 56 L56 22" />
          </svg>
        </div>

        {/* Bleeds off the right edge under the last row, where the thread has
            crossed to the left rail and the whole right side is empty. */}
        <div
          data-drift
          className="absolute bottom-[3%] right-[-7%] hidden h-64 w-64 md:block"
        >
          <svg className="h-full w-full" viewBox="0 0 240 240" fill="none">
            <path className="stack-figure" d="M16 224 C16 96 96 16 224 22" />
            <path className="stack-figure-teal" d="M74 236 C74 136 136 74 236 80" />
          </svg>
        </div>
      </div>

      {/* This section's stretch of the site-wide thread. Above the paper and
          the field, below everything drawn on them. */}
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
          Stack
        </p>
        <h2
          ref={headingRef}
          className="mt-5 max-w-2xl font-display text-3xl leading-snug text-ink md:text-4xl"
        >
          What I build with.
        </h2>

        <div className="mt-24 space-y-24 md:space-y-28">
          {STACK_CATEGORIES.map((cat) => (
            <div
              key={cat.title}
              data-stack-row
              className="stack-row grid gap-8 md:grid-cols-[220px_1fr] md:gap-12"
            >
              <div data-station-group className="md:pt-1">
                <h3 data-reveal className="stack-cat-title font-display text-xl">
                  {cat.title}
                </h3>
                {/* Drawn only while the pen is working on this category. */}
                <span aria-hidden className="stack-cat-rule" />
                <p
                  data-reveal
                  className="mt-3 max-w-[24ch] font-body text-sm leading-relaxed text-ink-muted"
                >
                  {cat.blurb}
                </p>
              </div>

              {/* Four columns, not six: the categories run 8 / 3 / 4 / 4, so
                  four fills every row it starts and nothing trails off as a
                  ragged remainder. */}
              <ul className="grid grid-cols-3 gap-x-4 gap-y-12 sm:grid-cols-4">
                {cat.items.map((icon) => (
                  <li
                    key={icon.name}
                    data-icon
                    className="stack-icon group flex cursor-default flex-col items-center gap-3 text-center"
                    style={{ "--brand": icon.brand } as CSSProperties}
                  >
                    {icon.kind === "mark" ? (
                      <svg
                        aria-hidden
                        className="stack-icon-mark h-11 w-11 md:h-12 md:w-12"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path data-fill className="stack-fill" d={icon.path} />
                        <path
                          data-stroke
                          data-retires="1"
                          className="stack-stroke"
                          d={icon.path}
                        />
                      </svg>
                    ) : (
                      <svg
                        aria-hidden
                        className="stack-icon-mark h-12 w-12 md:h-14 md:w-14"
                        viewBox="0 0 48 48"
                        fill="none"
                      >
                        {icon.paths.map((d, i) => (
                          <path
                            key={i}
                            data-stroke
                            className="stack-stroke stack-stroke--drawn"
                            d={d}
                          />
                        ))}
                      </svg>
                    )}
                    <span
                      data-label
                      className="stack-label font-body text-xs leading-tight"
                    >
                      {icon.name}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
