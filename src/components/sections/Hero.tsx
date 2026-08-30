"use client";

import { useEffect, useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap, SplitText } from "@/lib/gsap";
import MagneticLink from "@/components/ui/MagneticLink";
import HeroFigures from "@/components/hero/HeroFigures";
import { useThreadSegment } from "@/components/thread/SiteThread";
import { docRect, flourish, gutterX, peelTo, runDown } from "@/components/thread/geometry";

export default function Hero({ loaded }: { loaded: boolean }) {
  const sectionRef = useRef<HTMLElement>(null);
  const contentLayerRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const signatureBoxRef = useRef<HTMLDivElement>(null);
  const threadPathRef = useRef<SVGPathElement>(null);
  const ctaGroupRef = useRef<HTMLDivElement>(null);
  const socialsRef = useRef<HTMLDivElement>(null);
  const scrollCueRef = useRef<HTMLDivElement>(null);
  const scrollCueFadeRef = useRef<HTMLDivElement>(null);
  const scrollArrowGroupRef = useRef<HTMLDivElement>(null);
  const scrollArrowRef = useRef<SVGPathElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const idleTweensRef = useRef<gsap.core.Tween[]>([]);

  /* The site-wide thread starts here — flourish included. The opening stroke
     is no longer a separate SVG in this component: it is the first stretch of
     the thread's own path, so there is no join anywhere on the site and
     nothing to align by pixel. It is anchored to an empty layout box below
     the headline (which also holds the space the old SVG used to occupy), and
     drawn proportionally to that box, so it scales at every breakpoint.

     The flourish still animates on load rather than on scroll: `intro` draws
     that prefix when the preloader hands off, and the scroll leg picks up
     from exactly where it stopped. */
  const thread = useThreadSegment({
    id: "hero",
    order: 0,
    ref: sectionRef,
    pathRef: threadPathRef,
    // First in the chain, so this is the only segment whose own start is read:
    // the pen begins when Hero's top edge is level with the top of the screen.
    // Everything after it starts exactly where its predecessor ended.
    range: { start: 0, end: 0.66 },
    intro: { play: loaded, delay: 0.9, duration: 1 },
    build: ({ rect, viewportWidth }) => {
      const box = signatureBoxRef.current
        ? docRect(signatureBoxRef.current)
        : {
            x: rect.x + rect.width * 0.05,
            y: rect.y + rect.height * 0.45,
            width: 240,
            height: 56,
          };

      const fl = flourish(box);
      const gx = gutterX(rect.x, viewportWidth);
      // Leaves along the flourish's own end tangent, which comes out of its
      // geometry rather than being typed in.
      const peel = peelTo(
        fl.end,
        gx,
        fl.end.y + Math.min(270, rect.height * 0.31),
        fl.tangent,
      );
      const run = runDown(peel.end, gx, rect.y + rect.height, {
        steps: 6,
        amp: 5,
        seed: 3,
      });

      return { d: fl.d + peel.d + run.d, exit: run.end, introD: fl.d };
    },
  });

  // Build the entire entrance timeline once on mount, PAUSED, and hide
  // everything right away via gsap.set. This runs before the preloader
  // even starts its exit-wipe, so there's no frame where the fully
  // visible, un-animated hero flashes underneath it.
  useGSAP(
    () => {
      if (!headlineRef.current) return;

      const split = SplitText.create(headlineRef.current, { type: "chars" });
      const chars = split.chars as HTMLElement[];

      gsap.set(chars, { opacity: 0, y: 10, filter: "blur(6px)" });
      gsap.set(caretRef.current, { opacity: 0, x: 0, y: 0 });
      gsap.set([ctaGroupRef.current, socialsRef.current], { y: 16, opacity: 0 });
      gsap.set(scrollCueRef.current, { opacity: 0 });
      gsap.set(scrollArrowRef.current, { drawSVG: "0%" });

      const tl = gsap.timeline({ paused: true, defaults: { ease: "power2.out" } });

      // "Invisible pen" reveal, character by character, caret riding
      // the leading edge of each new letter.
      chars.forEach((char, i) => {
        const t = i * 0.045;
        tl.to(char, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.4 }, t);
        tl.set(caretRef.current, { opacity: 1 }, t);
        tl.to(
          caretRef.current,
          { x: char.offsetLeft, y: char.offsetTop, duration: 0.045, ease: "none" },
          t,
        );
      });

      tl.to(caretRef.current, { opacity: 0, duration: 0.3 }, "+=0.15");

      // The flourish is no longer drawn here — it belongs to the site-wide
      // thread now and animates from its own `intro` (delay 0.9s, so it still
      // lands at the same moment it used to). The label keeps the CTA timing
      // exactly where it was: the old label sat 0.1s after the flourish
      // started, i.e. 0.2s before the caret fade ended.
      tl.addLabel("shapes", "-=0.2");

      tl.to(ctaGroupRef.current, { opacity: 1, y: 0, duration: 0.6 }, "shapes+=0.3")
        .to(socialsRef.current, { opacity: 1, y: 0, duration: 0.6 }, "-=0.4")
        .to(scrollCueRef.current, { opacity: 1, duration: 0.5 }, "-=0.3")
        .to(
          scrollArrowRef.current,
          { drawSVG: "100%", duration: 0.5, ease: "power2.inOut" },
          "-=0.2",
        )
        .call(() => {
          idleTweensRef.current.push(
            gsap.to(scrollArrowGroupRef.current, {
              y: 6,
              duration: 1,
              ease: "power1.inOut",
              repeat: -1,
              yoyo: true,
            }),
          );
        });

      timelineRef.current = tl;

      return () => {
        idleTweensRef.current.forEach((t) => t.kill());
        idleTweensRef.current = [];
        split.revert();
        timelineRef.current = null;
      };
    },
    { scope: sectionRef },
  );

  // Play the already-built (hidden) timeline once the preloader hands off.
  useEffect(() => {
    if (loaded) timelineRef.current?.play();
  }, [loaded]);

  // The cue retires as soon as its advice has been taken — it would
  // otherwise sit on top of the figures once they've piled up.
  useGSAP(
    () => {
      gsap.to(scrollCueFadeRef.current, {
        opacity: 0,
        duration: 0.45,
        ease: "power2.out",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top -6%",
          once: true,
        },
      });
    },
    { scope: sectionRef },
  );

  // Faint counter-drift on the content block, so the text sits on a
  // different depth plane than the physics field behind it.
  useGSAP(
    () => {
      const section = sectionRef.current;
      if (!section) return;

      const xContent = gsap.quickTo(contentLayerRef.current, "x", {
        duration: 1,
        ease: "power3.out",
      });
      const yContent = gsap.quickTo(contentLayerRef.current, "y", {
        duration: 1,
        ease: "power3.out",
      });

      const handleMove = (e: MouseEvent) => {
        const rect = section.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width - 0.5;
        const relY = (e.clientY - rect.top) / rect.height - 0.5;
        xContent(relX * -10);
        yContent(relY * -10);
      };

      section.addEventListener("mousemove", handleMove);
      return () => section.removeEventListener("mousemove", handleMove);
    },
    { scope: sectionRef },
  );

  return (
    <section
      id="hero"
      ref={sectionRef}
      className="relative flex min-h-screen flex-col justify-center overflow-hidden px-6 py-32 md:px-16"
    >
      {/* This section's stretch of the site-wide thread, continuing from
          the signature down to the seam with About. */}
      {thread.d && (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-20 h-full w-full"
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

      {/* Background: figures that draw in, float, then gain weight and
          fall to the floor of the hero once the user scrolls away. */}
      <HeroFigures loaded={loaded} />

      {/* Main content */}
      <div ref={contentLayerRef} className="relative max-w-4xl">
        <p className="mb-6 font-body text-sm uppercase tracking-[0.25em] text-ink-muted md:text-base">
          Frontend Developer
        </p>

        <div className="relative">
          <h1
            ref={headlineRef}
            className="font-display text-[clamp(2.75rem,9vw,6rem)] font-semibold leading-[1.05] tracking-tight text-ink"
          >
            <span className="block md:inline">Maksym</span>{" "}
            <span className="block md:inline">Ostapchuk</span>
          </h1>
          <span
            ref={caretRef}
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 h-[0.85em] w-[3px] bg-accent opacity-0"
          />
        </div>

        {/* Anchor for the thread's opening flourish. It holds the space the
            signature SVG used to occupy, and the flourish is drawn into this
            box by SiteThread — so the stroke follows the layout instead of
            being positioned by hand. */}
        <div
          ref={signatureBoxRef}
          aria-hidden
          className="-ml-1 mt-3 h-12 w-56 md:h-14 md:w-64"
        />

        <p className="mt-6 max-w-xl font-body text-lg text-ink-muted md:text-xl">
          I build fast, interactive interfaces that feel alive.
        </p>

        <div ref={ctaGroupRef} className="mt-10 flex flex-wrap items-center gap-4">
          <MagneticLink
            href="#projects"
            className="inline-flex items-center rounded-full bg-ink px-7 py-3 font-body text-sm font-medium text-paper transition-colors duration-300 hover:bg-accent"
          >
            View Work
          </MagneticLink>
          <MagneticLink
            href="#contact"
            className="inline-flex items-center rounded-full border border-ink/20 px-7 py-3 font-body text-sm font-medium text-ink transition-colors duration-300 hover:border-accent hover:text-accent"
          >
            Get in Touch
          </MagneticLink>

          {/* Quieter third action — the CV is a take-away, not a destination,
              so it reads as a link with a drawn arrow rather than a button. */}
          <MagneticLink
            href="/Maksym_Ostapchuk_CV.pdf"
            download="Maksym_Ostapchuk_CV.pdf"
            strength={0.22}
            className="group inline-flex items-center gap-2 font-body text-sm font-medium text-ink-muted transition-colors duration-300 hover:text-accent"
          >
            <svg
              aria-hidden
              width="15"
              height="16"
              viewBox="0 0 15 16"
              fill="none"
              className="shrink-0 transition-transform duration-300 group-hover:translate-y-[2px]"
            >
              <path
                d="M7.5 1.5 V10 M3.8 6.6 L7.5 10.4 L11.2 6.6 M1.6 14.2 H13.4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Download CV
          </MagneticLink>
        </div>

        <div
          ref={socialsRef}
          className="mt-12 flex flex-wrap gap-x-6 gap-y-2 font-body text-sm text-ink-muted"
        >
          <MagneticLink
            href="mailto:ipadair.maxim@gmail.com"
            className="transition-colors duration-300 hover:text-accent"
          >
            ipadair.maxim@gmail.com
          </MagneticLink>
          <MagneticLink
            href="tel:+380669754291"
            className="transition-colors duration-300 hover:text-accent"
          >
            +380 66 975 4291
          </MagneticLink>
          <MagneticLink
            href="https://github.com/Reshatel"
            external
            className="transition-colors duration-300 hover:text-accent"
          >
            GitHub
          </MagneticLink>
          <MagneticLink
            href="https://djinni.co/q/16ed9430a8/"
            external
            className="transition-colors duration-300 hover:text-accent"
          >
            Djinni
          </MagneticLink>
        </div>
      </div>

      <div
        ref={scrollCueFadeRef}
        className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2"
      >
        <div ref={scrollCueRef} className="flex flex-col items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.35em] text-ink-muted">
            Scroll
          </span>
          <div ref={scrollArrowGroupRef}>
            <svg aria-hidden width="18" height="32" viewBox="0 0 18 32" fill="none">
              <path
                ref={scrollArrowRef}
                className="draw-line"
                d="M9,1 C6,10 11,20 9,28 M9,28 L3,22 M9,28 L15,22"
              />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
