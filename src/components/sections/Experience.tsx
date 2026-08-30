"use client";

import { useCallback, useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/lib/gsap";
import { useThreadSegment, type Band } from "@/components/thread/SiteThread";
import { docRect, timelineSpine } from "@/components/thread/geometry";

const MILESTONES = [
  {
    /* The watermark behind the section. Short on purpose: it is set at a size
       where a full date range would stop being a shape and start being text. */
    ghost: "2022",
    date: "2022",
    title: "Enrolled in Computer Science",
    body: "Started a Computer Science degree — the plan was simple: learn how software actually works, then go build things with it.",
  },
  {
    ghost: "2024",
    date: "2024",
    title: "First Lines of Frontend",
    body: "Picked up the basics — HTML, CSS, JavaScript — then jumped into React soon after. What began as coursework turned into an obsession with making interfaces feel right.",
  },
  {
    ghost: "2025",
    date: "2024–2025",
    title: "Two Coursework Projects, Defended",
    body: "Built and defended two academic projects as real frontend applications, not just theory — proof the skills held up under review.",
  },
  {
    ghost: "2026",
    date: "Jan – Apr 2026",
    title: "WordPress Developer, Flight Academy (usfa-ua)",
    body: "First commercial project, as second developer on a two-person build: pages, reusable blocks, OAuth and Google Classroom integrations, mobile adaptation and bug fixing — shipped for real users on a real deadline.",
  },
  {
    /* The only milestone with no end date gets the only label that is not one. */
    ghost: "NOW",
    date: "2026",
    title: "Still Climbing",
    body: "Deep in Next.js, TypeScript and GSAP now, with no plan to stop learning anytime soon. This site — and everything moving on it — is the latest proof.",
    tag: "Always learning",
  },
];

export default function Experience() {
  const sectionRef = useRef<HTMLElement>(null);
  const eyebrowRef = useRef<HTMLParagraphElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingTextRef = useRef<HTMLSpanElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const threadPathRef = useRef<SVGPathElement>(null);

  /* The milestone dots, filled by the same measuring pass that builds the
     thread. The driver reads them on every scrub frame, so they have to be
     sitting in a ref — a frame cannot afford a layout read of its own. */
  const bandsRef = useRef<Band[]>([]);

  const nodes = useCallback(
    () => [...(sectionRef.current?.querySelectorAll<HTMLElement>("[data-node]") ?? [])],
    [],
  );

  /* ------------------------------------------------------------------ */
  /*  The thread through this section                                    */
  /*                                                                     */
  /*  The spine of this timeline is not a line of its own: it is the      */
  /*  site-wide thread, arriving on the left rail exactly where Stack's   */
  /*  serpentine left it. As everywhere else, no coordinate of the path   */
  /*  lives in this file — the section hands over the only things it      */
  /*  knows and `timelineSpine()` owns the rest.                          */
  /* ------------------------------------------------------------------ */
  const thread = useThreadSegment({
    id: "experience",
    order: 30,
    ref: sectionRef,
    pathRef: threadPathRef,
    /* No start: the driver begins this segment exactly where Stack's ended,
       so the seam is one number rather than two that have to agree. */
    range: { end: 0.5 },
    /* The knot and the departure are both mostly sideways travel. At full
       weight they would eat well over a third of the section's scroll; this
       leaves them room to read as gestures without owning the section. */
    pace: { horizontal: 0.3 },
    bands: () => bandsRef.current,
    /* A spine never turns, so the turn-based reading Stack uses would fire
       once at the top and then never again. Here the reading is how far the
       pen has got: every dot above it is reached, the newest one is live. */
    bandMode: "reach",
    onBand: (index) => {
      nodes().forEach((li, i) => {
        li.toggleAttribute("data-reached", i <= index);
        li.toggleAttribute("data-active", i === index);
      });
      // The watermark is a second readout of the same one number.
      /* Before the pen has reached the first dot the watermark still shows
         the first year: the knot alone takes a good stretch of scroll, and
         an empty section with nothing large in it is the exact problem the
         watermark is here to solve. */
      const lit = Math.max(0, index);
      ghostRef.current
        ?.querySelectorAll("[data-ghost]")
        .forEach((el, i) => el.toggleAttribute("data-on", i === lit));
    },
    build: ({ rect, entry, viewportWidth }) => {
      const items = nodes();
      const marks = items
        .map((li) => li.querySelector<HTMLElement>("[data-marker]"))
        .filter((el): el is HTMLElement => !!el)
        .map(docRect);
      // A dot is claimed when the pen reaches its CENTRE, which is the moment
      // the line visibly touches it — and the moment its card is allowed in.
      bandsRef.current = marks.map((r) => ({
        top: r.y + r.height / 2,
        bottom: r.y + r.height,
      }));
      const lastCard = items[items.length - 1]?.querySelector<HTMLElement>("[data-card]");
      return timelineSpine({
        rect,
        entry,
        viewportWidth,
        nodes: marks,
        // The WORDS, not the <h2> block: the knot wraps what can be seen.
        headline: headingTextRef.current ? docRect(headingTextRef.current) : undefined,
        lastCard: lastCard ? docRect(lastCard) : undefined,
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

          const figures = gsap.utils.toArray<SVGPathElement>(
            fieldRef.current?.querySelectorAll("path") ?? [],
          );

          if (reduced) {
            gsap.set(figures, { drawSVG: "100%" });
            // The pen drives this timeline's state, and with reduced motion
            // there is no pen — light every node so the section reads as
            // finished rather than stalled half-way.
            nodes().forEach((li) => li.toggleAttribute("data-reached", true));
            ghostRef.current
              ?.querySelectorAll("[data-ghost]")
              .forEach((el, i) => el.toggleAttribute("data-on", i === MILESTONES.length - 1));
            return;
          }

          /* The cards are hidden ONLY once this runs. Without JS, or before
             hydration, the section is plain readable copy — the reveal is an
             enhancement, never the thing standing between a reader and the
             text. Everything past this point is CSS keyed off `data-reached`,
             which the pen sets and unsets, so scrolling back up puts each
             card away exactly as it arrived. */
          section.setAttribute("data-pen", "");

          gsap.set(figures, { drawSVG: "0%" });

          gsap.from([eyebrowRef.current, headingRef.current], {
            opacity: 0,
            y: 16,
            duration: 0.8,
            stagger: 0.12,
            ease: "power2.out",
            scrollTrigger: { trigger: eyebrowRef.current, start: "top 88%" },
          });

          /* The watermark holds still in the viewport while the section runs
             past it. Deliberately not `position: sticky`: the page has an
             overflow-clipped body and a smooth-scroll proxy, and a scrubbed
             translate is the version whose behaviour is not at the mercy of
             either. */
          if (ghostRef.current) {
            gsap.fromTo(
              ghostRef.current,
              { y: 0 },
              {
                y: () => Math.max(0, section.offsetHeight - window.innerHeight),
                ease: "none",
                scrollTrigger: {
                  trigger: section,
                  start: "top top",
                  end: "bottom bottom",
                  scrub: true,
                  invalidateOnRefresh: true,
                },
              },
            );
          }

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
                y: i % 2 ? 20 : -16,
                rotation: i % 2 ? -5 : 4,
                duration: 12 + i * 3,
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
      id="experience"
      ref={sectionRef}
      className="exp-section relative bg-paper-alt px-6 pt-28 pb-56 md:px-16 md:pb-80"
    >
      {/* The year the pen is standing in, set large enough to be architecture
          rather than a label. It is the section's sense of scale: the copy is
          small and the timeline is narrow, so something has to be big. */}
      <div aria-hidden className="exp-ghost">
        <div ref={ghostRef} className="exp-ghost-inner">
          {MILESTONES.map((m) => (
            <span key={m.title} data-ghost className="exp-ghost-year">
              {m.ghost}
            </span>
          ))}
        </div>
      </div>

      {/* Drawn figures, placed where the zig-zag leaves the page empty: the
          outer margins, which on this section are wide and otherwise bare. */}
      <div ref={fieldRef} aria-hidden className="exp-field">
        <div data-drift className="absolute left-[2%] top-[26%] hidden h-40 w-40 lg:block">
          <svg className="h-full w-full" viewBox="0 0 160 160" fill="none">
            <path className="exp-figure-teal" d="M18 142 C18 58 66 18 146 26" />
            <path className="exp-figure-teal" d="M46 154 C46 92 84 60 148 66" />
          </svg>
        </div>
        <div data-drift className="absolute right-[1%] top-[58%] hidden h-52 w-52 md:block">
          <svg className="h-full w-full" viewBox="0 0 200 200" fill="none">
            <path className="exp-figure" d="M100 10 A90 90 0 1 1 99.9 10" />
            <path className="exp-figure" d="M100 52 A48 48 0 1 1 99.9 52" />
          </svg>
        </div>
      </div>

      {/* This section's stretch of the site-wide thread. Above the paper and
          the watermark, below everything drawn on them — which is what lets
          the knot pass behind the headline it ties itself around. */}
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

      <div className="relative z-10 mx-auto max-w-4xl">
        <p
          ref={eyebrowRef}
          className="font-body text-sm uppercase tracking-[0.25em] text-ink-muted"
        >
          Experience
        </p>
        <h2
          ref={headingRef}
          className="mt-5 max-w-2xl font-display text-3xl leading-snug text-ink md:text-4xl"
        >
          {/* The span is what the knot is measured from — an <h2> is a
              full-width block, and the loop has to wrap the words. */}
          <span ref={headingTextRef}>How I got here.</span>
        </h2>

        <ol className="exp-list mt-40 md:mt-48">
          {MILESTONES.map((m, i) => (
            <li
              key={m.title}
              data-node
              data-side={i % 2 === 0 ? "left" : "right"}
              className="exp-node"
            >
              <span aria-hidden data-marker className="exp-marker">
                <span className="exp-dot" />
                {m.tag && <span className="exp-pulse" />}
              </span>

              <div data-card className="exp-card">
                <p className="exp-date font-body">
                  {m.date}
                  {m.tag && <span className="exp-tag">{m.tag}</span>}
                </p>
                <h3 className="exp-title font-display text-xl text-ink">{m.title}</h3>
                <p className="exp-body font-body text-sm leading-relaxed text-ink-muted">
                  {m.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
