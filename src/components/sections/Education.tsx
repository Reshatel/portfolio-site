"use client";

import { useCallback, useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/lib/gsap";
import { useThreadSegment } from "@/components/thread/SiteThread";
import CredentialRig from "@/components/education/CredentialRig";
import { docRect, scrollRail, type ScrollMark } from "@/components/thread/geometry";
import { CREDENTIALS } from "@/components/education/credentials";

/* ------------------------------------------------------------------ */
/*  The torn top edge — this section's way in                          */
/*                                                                     */
/*  About arrives behind a slanted wipe; this one arrives as a SHEET    */
/*  LAID ON THE PAGE. Its top edge is deckled rather than ruled, the    */
/*  paper below it is the alternate stock, and a hairline of accent     */
/*  inks itself along the tear as the section comes up — so the change  */
/*  of ground is an event and not a colour swap.                        */
/*                                                                     */
/*  Written at a FIXED pixel scale, not stretched to the viewport: a    */
/*  `preserveAspectRatio="none"` tear is three times as jagged at       */
/*  390px as at 1440. The path is a 240px tile repeated to 3200px, and  */
/*  the wrapper simply clips whatever the window does not need. Because */
/*  every sine below has a period dividing 240, the tile has no seam.   */
/* ------------------------------------------------------------------ */
const TEAR_W = 3200;
const TEAR_H = 34;

function tornEdge() {
  const pts: string[] = [];
  for (let x = 0; x <= TEAR_W; x += 8) {
    const u = (2 * Math.PI * x) / 240;
    // Five harmonics, all periodic in the tile so the repeat has no seam —
    // and enough of the fast ones that the edge reads as TORN rather than as
    // a wave someone drew.
    const y =
      18 +
      4.4 * Math.sin(u) +
      3.2 * Math.sin(2 * u + 1.1) +
      2.1 * Math.sin(3 * u + 2.3) +
      1.5 * Math.sin(5 * u + 0.6) +
      0.9 * Math.sin(8 * u + 2);
    pts.push(`${x} ${y.toFixed(2)}`);
  }
  return pts;
}
const TEAR_PTS = tornEdge();
const TEAR_LINE = `M ${TEAR_PTS.join(" L ")}`;
const TEAR_FILL = `${TEAR_LINE} L ${TEAR_W} ${TEAR_H} L 0 ${TEAR_H} Z`;

/* ------------------------------------------------------------------ */
/*  Guilloche rosette                                                  */
/*                                                                     */
/*  The engine-turned figure on the face of a certificate, and a real   */
/*  hypotrochoid rather than a drawing of one: the point on a circle of */
/*  radius `r` rolling inside one of radius `R`, offset by `d`. One     */
/*  closed curve, so the pen can draw it in a single stroke like        */
/*  everything else on this site.                                       */
/* ------------------------------------------------------------------ */
function rosette(R: number, r: number, d: number, turns: number, samples = 720) {
  const k = (R - r) / r;
  const span = R - r + d;
  const scale = 96 / span;
  const pts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (turns * 2 * Math.PI * i) / samples;
    const x = 100 + ((R - r) * Math.cos(t) + d * Math.cos(k * t)) * scale;
    const y = 100 + ((R - r) * Math.sin(t) - d * Math.sin(k * t)) * scale;
    pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `M ${pts.join(" L ")} Z`;
}
const ROSETTE_WATERMARK = rosette(5, 3, 5, 3);
const ROSETTE_FIELD = rosette(7, 4, 6, 4);

/* ------------------------------------------------------------------ */
/*  What hangs off the rod                                             */
/*                                                                     */
/*  Three weights, and the row alternates between two cords and three  */
/*  so the wall does not read as the same mobile twice. They are metal */
/*  and wax rather than more drawn line: the section already has a      */
/*  drawn line running through it, and the point of these is that they  */
/*  have WEIGHT.                                                        */
/* ------------------------------------------------------------------ */
const CHARMS: Record<number, ("bead" | "ring" | "seal")[]> = {
  2: ["ring", "seal"],
  3: ["bead", "ring", "seal"],
};

function Charm({ kind }: { kind: "bead" | "ring" | "seal" }) {
  if (kind === "bead") {
    return <span data-charm data-shape="round" className="sc-charm sc-charm--bead" />;
  }
  if (kind === "ring") {
    return <span data-charm data-shape="round" className="sc-charm sc-charm--ring" />;
  }
  return (
    <span data-charm data-shape="round" className="sc-charm sc-charm--seal">
      <svg viewBox="0 0 46 46" fill="none">
        {Array.from({ length: 24 }, (_, k) => (
          <line
            key={k}
            className="sc-wax-tick"
            x1="23"
            y1="8"
            x2="23"
            y2="3"
            transform={`rotate(${(k * 360) / 24} 23 23)`}
          />
        ))}
        <circle className="sc-wax-body" cx="23" cy="23" r="16" />
        <circle className="sc-wax-ring" cx="23" cy="23" r="12" />
        <path
          className="sc-wax-mark"
          d="M23 13 L25.2 20.8 L33 23 L25.2 25.2 L23 33 L20.8 25.2 L13 23 L20.8 20.8 Z"
        />
      </svg>
    </span>
  );
}

/** The wax seal pressed into a document once it is fully unrolled. */
function Seal() {
  return (
    <span aria-hidden className="sc-seal">
      <svg viewBox="0 0 56 56" fill="none">
        {Array.from({ length: 28 }, (_, i) => (
          <line
            key={i}
            className="sc-seal-tick"
            x1="28"
            y1="10"
            x2="28"
            y2="4"
            transform={`rotate(${(i * 360) / 28} 28 28)`}
          />
        ))}
        <circle className="sc-seal-ring" cx="28" cy="28" r="19" />
        <circle className="sc-seal-ring sc-seal-ring--in" cx="28" cy="28" r="14" />
        <path
          className="sc-seal-mark"
          d="M28 15 L30.8 24.2 L40 27 L30.8 29.8 L28 39 L25.2 29.8 L16 27 L25.2 24.2 Z"
        />
      </svg>
    </span>
  );
}

export default function Education() {
  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const eyebrowRef = useRef<HTMLParagraphElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const leadRef = useRef<HTMLParagraphElement>(null);
  const railRef = useRef<HTMLSpanElement>(null);
  const tearRef = useRef<SVGPathElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const threadPathRef = useRef<SVGPathElement>(null);

  /* Filled by the same pass that builds the thread and read on every scrub
     frame, so both live in refs: a frame cannot afford a layout read. */
  const marksRef = useRef<ScrollMark[]>([]);
  const itemsRef = useRef<HTMLElement[]>([]);
  /** Last value written per item, so a still frame writes nothing. */
  const lastRef = useRef<number[]>([]);

  const itemEls = useCallback(
    () => [...(sectionRef.current?.querySelectorAll<HTMLElement>("[data-item]") ?? [])],
    [],
  );

  /* ------------------------------------------------------------------ */
  /*  The thread through this section                                    */
  /*                                                                     */
  /*  Everywhere else the pen draws something. Here it PULLS something:   */
  /*  each scroll unrolls exactly as far as the pen has travelled past    */
  /*  its rod, so the roll and the pen come down the page at the same     */
  /*  height, on the same line. That is why this section asks for         */
  /*  `onPen` rather than bands — the state it needs is a continuous      */
  /*  quantity, and no number of discrete bands makes it smooth.          */
  /*                                                                     */
  /*  As everywhere, not one coordinate of the path lives in this file:   */
  /*  the section hands over the two things only it knows — where the     */
  /*  rail runs and where the papers are — and `scrollRail()` owns the    */
  /*  rest, including which stretch of pen travel belongs to which        */
  /*  scroll.                                                             */
  /* ------------------------------------------------------------------ */
  const thread = useThreadSegment({
    id: "education",
    order: 50,
    ref: sectionRef,
    pathRef: threadPathRef,
    range: { end: 0.5 },
    /* Almost all of this segment is vertical, so there is little for the
       weighting to redistribute; it only keeps the swing onto the rail and
       the exit from eating the section. */
    pace: { horizontal: 0.3 },
    onPen: (_x, y) => {
      const items = itemsRef.current;
      const marks = marksRef.current;
      for (let i = 0; i < items.length; i++) {
        const m = marks[i];
        if (!m) continue;
        const roll = Math.min(1, Math.max(0, (y - m.from) / Math.max(1, m.to - m.from)));
        // A frame the pen barely moved in should write nothing at all.
        if (Math.abs(roll - (lastRef.current[i] ?? -1)) > 0.0015) {
          lastRef.current[i] = roll;
          items[i].style.setProperty("--r", roll.toFixed(4));
        }
        items[i].toggleAttribute("data-tied", y >= m.tie);
        items[i].toggleAttribute("data-open", roll > 0.995);
      }
    },
    build: ({ rect, entry, viewportWidth }) => {
      const els = itemEls();
      const rail = railRef.current;
      const papers = els.map((li) => li.querySelector<HTMLElement>("[data-sheet]"));
      if (!els.length || !rail || papers.some((p) => !p)) {
        itemsRef.current = [];
        marksRef.current = [];
        return scrollRail({ rect, entry, viewportWidth, railX: rect.x, sheets: [] });
      }
      itemsRef.current = els;
      const out = scrollRail({
        rect,
        entry,
        viewportWidth,
        railX: docRect(rail).x,
        sheets: papers.map((p) => docRect(p as HTMLElement)),
        header: headerRef.current ? docRect(headerRef.current) : undefined,
      });
      marksRef.current = out.marks;
      return { d: out.d, exit: out.exit };
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

          const drawn = gsap.utils.toArray<SVGPathElement>(
            section.querySelectorAll(".edu-guilloche"),
          );

          if (reduced) {
            gsap.set([...drawn, tearRef.current], { drawSVG: "100%" });
            /* No pen, so nothing would ever unroll these — every scroll would
               stay rolled up forever. */
            itemEls().forEach((li) => {
              li.style.setProperty("--r", "1");
              li.toggleAttribute("data-tied", true);
              li.toggleAttribute("data-open", true);
            });
            return;
          }

          /* Everything below is CSS keyed off `--r` and two attributes the pen
             sets, gated on `data-pen` so that without JS every scroll is
             simply open and readable. */
          section.setAttribute("data-pen", "");

          gsap.set([...drawn, tearRef.current], { drawSVG: "0%" });

          /* The tear inks itself as the sheet comes up. Its own trigger, not
             the pen's: the seam is a fact about the section arriving, and the
             pen is still up in Projects when it happens. */
          gsap.to(tearRef.current, {
            drawSVG: "100%",
            ease: "none",
            scrollTrigger: {
              trigger: section,
              start: "top bottom",
              end: "top 62%",
              scrub: 0.6,
            },
          });

          gsap.from([eyebrowRef.current, headingRef.current, leadRef.current], {
            opacity: 0,
            y: 16,
            duration: 0.8,
            stagger: 0.12,
            ease: "power2.out",
            scrollTrigger: { trigger: eyebrowRef.current, start: "top 88%" },
          });

          gsap.utils.toArray<SVGPathElement>(section.querySelectorAll(".edu-guilloche")).forEach(
            (el) => {
              gsap.to(el, {
                drawSVG: "100%",
                duration: 2.6,
                ease: "power2.inOut",
                scrollTrigger: { trigger: el.closest("[data-drift], [data-item]") ?? el, start: "top 90%" },
              });
            },
          );

          gsap.utils
            .toArray<HTMLElement>(section.querySelectorAll("[data-drift]"))
            .forEach((el, i) => {
              gsap.to(el, {
                rotation: i % 2 ? -8 : 6,
                duration: 26 + i * 5,
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
      id="education"
      ref={sectionRef}
      className="edu-section relative px-6 pt-32 pb-56 md:px-16 md:pb-72"
    >
      {/* The sheet itself, and the torn edge it was pulled off along. */}
      <div aria-hidden className="edu-sheet" />
      <div aria-hidden className="edu-tear">
        <svg width={TEAR_W} height={TEAR_H} viewBox={`0 0 ${TEAR_W} ${TEAR_H}`} fill="none">
          <path className="edu-tear-fill" d={TEAR_FILL} />
          <path ref={tearRef} className="edu-tear-ink" d={TEAR_LINE} />
        </svg>
      </div>

      {/* Security paper: a fine diagonal weave rather than Stack's dots or
          Projects' cross-rule — same hand, a third kind of stock. */}
      <div aria-hidden className="edu-weave" />

      <div ref={fieldRef} aria-hidden className="edu-field">
        <div data-drift className="edu-rosette edu-rosette--field">
          <svg viewBox="0 0 200 200" fill="none">
            <path className="edu-guilloche edu-guilloche--teal" d={ROSETTE_FIELD} />
          </svg>
        </div>
      </div>

      {/* This section's stretch of the site-wide thread. Above the ground,
          below the scrolls — the rail runs beside them, never under them. */}
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
        <div ref={headerRef}>
          <p
            ref={eyebrowRef}
            className="font-body text-sm uppercase tracking-[0.25em] text-ink-muted"
          >
            Education &amp; Certificates
          </p>
          <h2
            ref={headingRef}
            className="mt-5 max-w-2xl font-display text-3xl leading-snug text-ink md:text-4xl"
          >
            The paper trail.
          </h2>
          <p ref={leadRef} className="edu-lead font-body">
            The formal half of the story: four years of computer science for the
            fundamentals, and a security course I signed up for on my own time.
          </p>
        </div>

        <ol className="sc-list">
          {/* Measured, never drawn: where this sits is the layout's business,
              and the geometry reads it rather than computing an x. */}
          <span ref={railRef} aria-hidden data-rail className="sc-rail" />

          {CREDENTIALS.map((c, i) => (
            <li
              key={c.title}
              data-item
              data-kind={c.kind}
              data-side={i % 2 === 0 ? "left" : "right"}
              className="sc-item"
            >
              <span aria-hidden className="sc-rod" />
              {/* The dowel runs on past the paper, the way a hanging scroll is
                  really made — and that overhang is what the cords hang from. */}
              <span aria-hidden data-arm className="sc-arm" />
              <span aria-hidden className="sc-nail" />

              {/* The measured box: `scrollRail()` derives this scroll's stretch
                  of pen travel from it, so nothing may transform it. The roll
                  and the paper are children for exactly that reason. */}
              <div data-sheet className="sc-sheet">
                {/* Everything that swings lives in here. The box the thread
                    measures is the one OUTSIDE it — a descendant's transform
                    stays out of its parent's box, which is the only reason the
                    sheet is allowed to move at all. */}
                <div data-swing className="sc-swing">
                  <div className="sc-paper">
                    <span aria-hidden className="sc-rule" />
                    {c.kind === "diploma" && (
                      <span aria-hidden className="sc-watermark">
                        <svg viewBox="0 0 200 200" fill="none">
                          <path className="edu-guilloche" d={ROSETTE_WATERMARK} />
                        </svg>
                      </span>
                    )}

                    <p className="sc-kicker font-body">{c.kicker}</p>
                    <h3 className="sc-title font-diploma">{c.title}</h3>
                    <p className="sc-org font-body">{c.org}</p>
                    <p className="sc-meta font-body">{c.meta}</p>
                    {c.note && <p className="sc-note font-body">{c.note}</p>}

                    <Seal />

                    {/* The shading where the paper curves into the roll. Inside
                        the clip, so it is revealed with the sheet and never
                        shows below the boundary. */}
                    <span aria-hidden className="sc-curl" />
                  </div>

                  {/* The roll. It rides the reveal boundary, so it is always
                      at the pen's own height — and it thins as it unwinds,
                      because the paper on it is going onto the wall. */}
                  <span aria-hidden className="sc-roll" />
                </div>
              </div>

              {/* What hangs in the empty half. The count alternates 3 / 2 so
                  no two documents carry the same mobile; the cords, their
                  spacing and their lengths follow from it — see
                  `CredentialRig`. Desktop only. */}
              <div aria-hidden data-rig className="sc-rig">
                <svg className="sc-cords" fill="none" preserveAspectRatio="none">
                  {(CHARMS[i % 2 === 0 ? 3 : 2] ?? []).map((k) => (
                    <path key={k} data-cord className="sc-cord" />
                  ))}
                </svg>
                {(CHARMS[i % 2 === 0 ? 3 : 2] ?? []).map((k) => (
                  <Charm key={k} kind={k} />
                ))}
              </div>

            </li>
          ))}
        </ol>
      </div>

      <CredentialRig sectionRef={sectionRef} />
    </section>
  );
}
