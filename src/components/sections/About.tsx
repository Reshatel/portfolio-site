"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { useGSAP } from "@gsap/react";
import { gsap, SplitText, ScrollTrigger } from "@/lib/gsap";
import { useThreadSegment } from "@/components/thread/SiteThread";
import { gutterX, moveTo, runDown } from "@/components/thread/geometry";

const FACTS = [
  "React / Next.js / TypeScript",
  "GSAP & Three.js animation",
  "WordPress · commercial project",
  "CS degree, 2022–2026",
];

export default function About() {
  const sectionRef = useRef<HTMLElement>(null);
  const eyebrowRef = useRef<HTMLParagraphElement>(null);
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const portraitRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<SVGPathElement>(null);

  const chipsRef = useRef<HTMLUListElement>(null);
  const figuresRef = useRef<HTMLDivElement>(null);
  const threadPathRef = useRef<SVGPathElement>(null);

  /* The pen arrives from the hero already in the gutter at this section's
     top edge, so all this section has to do is carry it down and hand it
     on. No join to tune — that is the whole point of the thread registry.
     It picks up exactly where Hero left off — the driver chains the windows,
     so there is no start to configure — and hands over when its own bottom
     edge reaches mid-screen, where Stack takes it on.

     The hand-over used to sit at `bottom 85%`. Stack moved it: its pen drives
     which category is lit, so the pen has to sit on the viewport's midline
     rather than a third of a screen ahead of it — and the contract says one
     segment's end IS the next one's start, so About's end moved with it. For
     About itself the change is cosmetic: its line simply keeps drawing a
     little longer, and the pen crosses the seam at mid-screen. */
  const thread = useThreadSegment({
    id: "about",
    order: 10,
    ref: sectionRef,
    pathRef: threadPathRef,
    range: { end: 0.5 },
    build: ({ rect, entry, viewportWidth }) => {
      const gx = gutterX(rect.x, viewportWidth);
      const run = runDown(entry, gx, rect.y + rect.height, { steps: 9, amp: 7 });
      return { d: moveTo(entry) + run.d, exit: run.end };
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

          if (reduced) {
            gsap.set(section, { "--wipe": 0 });
            gsap.set(frameRef.current, { drawSVG: "100%" });
            return;
          }

          /* The section's own paper wipes over the hero's on a slanted,
             accent-edged front as you scroll into it.

             The end point is not cosmetic: the hero's figures gain gravity
             when the hero's bottom edge — this section's top edge — reaches
             55% of the viewport, and they land on that edge. So the paper
             has to be fully laid down before then, or they pile up on a
             floor that isn't visible yet. Finishing at 66% leaves a margin;
             starting below the fold at 130% keeps the front's travel slow
             despite the earlier finish. */
          gsap.set(section, { "--wipe": 112 });
          gsap.to(section, {
            "--wipe": 0,
            ease: "none",
            scrollTrigger: {
              trigger: section,
              start: "top 130%",
              end: "top 66%",
              scrub: 0.6,
            },
          });

          /* Eyebrow label */
          gsap.from(eyebrowRef.current, {
            opacity: 0,
            y: 14,
            duration: 0.7,
            ease: "power2.out",
            scrollTrigger: { trigger: eyebrowRef.current, start: "top 88%" },
          });

          /* Body copy: line by line, out of a soft blur.
             autoSplit re-splits on font load and resize; returning the tween
             lets GSAP revert it cleanly before each re-split. */
          const split = SplitText.create(bodyRef.current, {
            type: "lines",
            autoSplit: true,
            onSplit(self) {
              return gsap.from(self.lines, {
                opacity: 0,
                yPercent: 60,
                filter: "blur(9px)",
                duration: 0.9,
                stagger: 0.075,
                ease: "power3.out",
                scrollTrigger: {
                  trigger: bodyRef.current,
                  start: "top 82%",
                  toggleActions: "play none none none",
                },
              });
            },
          });

          /* Portrait: frame draws itself, monogram fades up inside it,
             and the whole card drifts against the scroll. */
          gsap.set(frameRef.current, { drawSVG: "0%" });
          gsap
            .timeline({
              scrollTrigger: { trigger: portraitRef.current, start: "top 80%" },
            })
            .to(frameRef.current, {
              drawSVG: "100%",
              duration: 1.4,
              ease: "power2.inOut",
            });

          gsap.to(portraitRef.current, {
            yPercent: -7,
            ease: "none",
            scrollTrigger: {
              trigger: sectionRef.current,
              start: "top bottom",
              end: "bottom top",
              scrub: true,
            },
          });

          /* Quick-facts chips */
          gsap.from(chipsRef.current?.children ?? [], {
            opacity: 0,
            y: 14,
            scale: 0.94,
            duration: 0.55,
            stagger: 0.08,
            ease: "back.out(1.6)",
            scrollTrigger: { trigger: chipsRef.current, start: "top 90%" },
          });

          /* Decorative figures: drawn in, then left to breathe */
          const figurePaths = gsap.utils.toArray<SVGPathElement>(
            figuresRef.current?.querySelectorAll("path") ?? [],
          );
          gsap.set(figurePaths, { drawSVG: "0%" });
          gsap.to(figurePaths, {
            drawSVG: "100%",
            duration: 1.1,
            stagger: 0.16,
            ease: "power2.inOut",
            scrollTrigger: { trigger: sectionRef.current, start: "top 70%" },
          });

          const drifts = gsap.utils
            .toArray<HTMLElement>(figuresRef.current?.children ?? [])
            .map((el, i) =>
              gsap.to(el, {
                y: i % 2 ? 12 : -12,
                rotation: i % 2 ? -5 : 5,
                duration: 6 + i,
                ease: "sine.inOut",
                repeat: -1,
                yoyo: true,
                /* Paused while the section is off-screen: an endless tween
                   keeps writing styles and repainting its layer whether or not
                   anyone can see it. */
                scrollTrigger: {
                  trigger: sectionRef.current,
                  start: "top bottom",
                  end: "bottom top",
                  toggleActions: "play pause resume pause",
                },
              }),
            );

          return () => {
            drifts.forEach((t) => t.kill());
            split.revert();
          };
        },
      );

      return () => mm.revert();
    },
    { scope: sectionRef },
  );

  /* Layout shifts from font loading would otherwise leave every trigger
     measuring stale positions. */
  useEffect(() => {
    if (!document.fonts?.ready) return;
    document.fonts.ready.then(() => ScrollTrigger.refresh());
  }, []);

  return (
    <section
      id="about"
      ref={sectionRef}
      className="about-section relative overflow-hidden"
    >
      {/* The accent front runs 3px ahead of the clipped section body, so a
          hairline of colour leads the wipe across the screen. */}
      <div aria-hidden className="about-edge" />

      {/* Everything else is clipped by the same --wipe front: the section
          paints its paper AND its content in behind the moving edge. */}
      <div className="about-clip px-6 py-28 md:px-16">
        <div aria-hidden className="about-fill" />

        {/* The seam the hero's figures come to rest on. It sits at the very
            top of the clipped body, so the wipe uncovers it exactly as the
            front lands — the figures get a drawn floor instead of an
            invisible one. */}
        <div aria-hidden className="about-seam" />

        {/* This section's stretch of the site-wide thread. Inside the clip,
            so the wipe reveals it along with everything else. */}
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

        {/* Abstract drawn figures */}
        <div ref={figuresRef} aria-hidden className="pointer-events-none absolute inset-0 z-[2]">
          <svg
            className="absolute right-[4%] top-[10%] hidden h-16 w-16 md:block md:h-24 md:w-24"
            viewBox="0 0 80 80"
            fill="none"
          >
            <path className="draw-line-teal" d="M8,64 C8,26 32,8 66,12" />
            <path className="draw-line-teal" d="M22,68 C22,38 40,24 64,28" />
          </svg>
          <svg
            className="absolute left-[3%] top-[58%] hidden h-14 w-14 md:block"
            viewBox="0 0 60 60"
            fill="none"
          >
            <path className="draw-line-alt" d="M30,8 L54,50 L6,50 Z" />
          </svg>
          <svg
            className="absolute bottom-[5%] right-[2%] h-12 w-12 md:h-16 md:w-16"
            viewBox="0 0 60 60"
            fill="none"
          >
            <path className="draw-line-alt" d="M30,6 A24,24 0 1,1 29.9,6" />
            <path className="draw-line" d="M30,20 A10,10 0 1,1 29.9,20" />
          </svg>
        </div>

        <div className="relative z-10 mx-auto grid max-w-6xl gap-12 md:grid-cols-[1.4fr_1fr] md:gap-16">
          <div>
            <p
              ref={eyebrowRef}
              className="mb-6 font-body text-sm uppercase tracking-[0.25em] text-ink-muted"
            >
              About
            </p>
            <p
              ref={bodyRef}
              className="font-display text-2xl leading-snug text-ink md:text-3xl"
            >
              I&rsquo;m a frontend developer who likes making interfaces that
              don&rsquo;t just work — they respond. Most of my projects start
              as an idea I want to see move: a layout, an animation, a small
              interaction that makes a page feel alive. I work mainly with
              React, Next.js and TypeScript, and I&rsquo;ve spent a lot of time
              in GSAP and Three.js pushing what a browser can actually do.
              Before that, I was the second developer on a commercial
              WordPress site for a flight academy — real deadlines, real users.
              I&rsquo;ve already earned my Bachelor&rsquo;s degree in Computer Science, and right now I&rsquo;m focusing on building my own side projects.
            </p>
          </div>

          <div className="flex flex-col gap-6">
            {/* Portrait slot — drop the real photo in as an <Image> filling
                this box; the drawn frame sits on top of it unchanged. */}
            <div
              ref={portraitRef}
              className="relative aspect-[4/5] w-full overflow-hidden rounded-[18px] bg-paper"
            >
              <Image
                src="/photo.jpg"
                alt="Maksym Ostapchuk"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 400px"
                priority
              />
              <svg
                aria-hidden
                className="absolute inset-0 h-full w-full"
                viewBox="0 0 400 500"
                fill="none"
              >
                <path
                  ref={frameRef}
                  className="draw-line"
                  d="M20,28 C110,20 292,18 380,27 C389,126 388,376 379,473 C288,481 108,483 21,474 C13,364 12,126 20,28 Z"
                />
              </svg>
            </div>

            <ul ref={chipsRef} className="flex flex-wrap gap-2">
              {FACTS.map((fact) => (
                <li
                  key={fact}
                  className="cursor-default rounded-full border border-line bg-paper px-4 py-2 font-body text-xs text-ink-muted transition-colors duration-300 hover:border-accent hover:text-ink"
                >
                  {fact}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
