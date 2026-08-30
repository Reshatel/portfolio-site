"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import { gsap, ScrollTrigger, SplitText } from "@/lib/gsap";
import { useThreadSegment } from "@/components/thread/SiteThread";
import { docRect, SEAM_SAG, tautThread, type Rect } from "@/components/thread/geometry";
import { Rope, sampleCount, sampleRope, type RopePoint } from "@/components/contact/rope";
import { CONTACT_COPY, CONTACT_LINES } from "@/components/contact/contacts";
import MagneticLink from "@/components/ui/MagneticLink";

/* ------------------------------------------------------------------ */
/*  The finale: the thread comes loose                                 */
/*                                                                     */
/*  Eight sections have been drawn by one pen without it ever stopping. */
/*  Here it stops. The line comes down the middle of the seam, curls    */
/*  once through the sheet, and then runs DEAD STRAIGHT — the only      */
/*  stroke on the site with no hand-tremor in it. Nothing says the      */
/*  line is under tension; the missing wobble does.                     */
/*                                                                     */
/*  The sheet above knows about it too: it SAGS on the thread, deeper   */
/*  the further the pen descends. Then, at the foot of the run, the     */
/*  thread lets go — and the whole of it falls. Not a fade, not an      */
/*  effect: the drawn path is sampled into a verlet rope at that exact  */
/*  instant, so the thing that starts falling IS the line, point for    */
/*  point. The paper snaps flat, and the rope drops through the page    */
/*  and piles up on its bottom edge, where it stays. You can pick it    */
/*  up.                                                                 */
/*                                                                     */
/*  And the fall is what WRITES the section. Nothing is on the page     */
/*  before it: as the rope's leading point passes the heading, the      */
/*  lead, and each contact line in turn, each one inks in. Under a      */
/*  second, top to bottom, all of it caused by something falling past   */
/*  it. That is the rule this section learnt the hard way — an effect   */
/*  stretched across a section's whole scroll stops being an effect, so */
/*  this one is a moment.                                               */
/*                                                                     */
/*  The cut is triggered by the pen's own position against the foot of  */
/*  the run: one comparison, monotone in the pen's y, so it cannot      */
/*  flicker and it reverses cleanly on the way back up.                 */
/* ------------------------------------------------------------------ */

/**
 * When the thread lets go — and this one bit is NOT the pen's.
 *
 * Everything else in this section is caused by the pen, and the first version
 * of the cut was too: it fired when the pen reached the foot of the run. It is
 * the wrong owner, and measurably so. The scrub is a LAG, not a position, so
 * the pen trails the reader by roughly a second of scrolling — about four
 * hundred pixels at a normal reading pace. Measured: at the instant the pen
 * finally reached the foot, the stage it had been drawn in was three hundred
 * pixels above the top of the screen. The whole event — the tension, the
 * break, the fall, and everything the fall writes — happened where nobody was
 * looking.
 *
 * "It has to happen while the reader can see it" is a fact about the VIEWPORT,
 * and tying it to the pen could only ever approximate it. Same conclusion, and
 * the same reason, as the window that opens in Projects.
 *
 * What falls, then, is exactly what has been DRAWN when the moment arrives —
 * the rope is sampled up to the pen, not to the end of the path. So a reader
 * who took their time drops the whole line and one who flew drops the part
 * they actually saw, and in both cases the thing that falls is the thing that
 * was on the screen.
 */
const CUT_AT = "bottom 44%";

/**
 * Where the reader has to get back to before it is reeled in.
 *
 * Deliberately NOT the same line as `CUT_AT`. With one threshold, turning
 * round a few pixels past the break undid it immediately, which is the other
 * half of "the way back is too abrupt": the reader had barely reversed and the
 * page was already taking itself apart. There is a quarter of a screen of
 * hysteresis now — enough that going back up reads as a decision.
 */
const REEL_AT = "bottom 72%";

/** How long the thread takes to be pulled back up when the reader goes up. */
const REEL_SECONDS = 0.75;

/**
 * The cut is ARMED by the viewport and fired by the pen — whichever of the two
 * is ready last, up to a limit.
 *
 * The trigger alone was not enough. It says when the reader can see the place
 * this happens; it says nothing about how much line there is to drop, and the
 * pen trails the scroll, so a reader moving quickly would arrive with a
 * quarter of a stroke drawn and watch a stub fall. So the moment is armed at
 * `CUT_AT` and then held while the pen catches up: it goes when most of the
 * line is on the page, or when the wait is up, whichever comes first. Reads as
 * the thread holding on for as long as it can, which is also what it is.
 */
const CUT_MIN_DRAWN = 0.72;
const CUT_WAIT_MS = 1100;

/** How near the pointer has to be to take hold of the rope. */
const GRAB_RADIUS = 30;
const NUDGE_RADIUS = 96;

type Geo = {
  section: Rect;
  /** Where the pen crosses the seam, and where the taut run ends. */
  topY: number;
  footY: number;
  /** The pen travel over which the sheet above reaches full stretch. */
  pull: number;
  floorY: number;
  leftX: number;
  rightX: number;
};

type Target = { el: HTMLElement; y: number };

export default function Contact() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const threadPathRef = useRef<SVGPathElement>(null);
  const ropePathRef = useRef<SVGPathElement>(null);
  const fallRef = useRef<SVGSVGElement>(null);

  /* Written by the measuring pass, read on the scrub frame — a frame cannot
     afford a layout read, so everything it needs lives in refs. */
  const geoRef = useRef<Geo | null>(null);
  const targetsRef = useRef<Target[]>([]);
  const writtenRef = useRef(0);
  const cutRef = useRef(false);
  /** When the cut was armed, or 0. See `CUT_MIN_DRAWN`. */
  const armedAtRef = useRef(0);
  const tensionRef = useRef(-1);
  const landedRef = useRef(false);
  const ropeRef = useRef<Rope | null>(null);
  /** A reel-in in progress: where the rope was when it started, and how far
   *  along the way back it is. */
  const reelRef = useRef<{ p: number; from: RopePoint[] } | null>(null);
  const visibleRef = useRef(true);
  const pointerRef = useRef<{ x: number; y: number; inside: boolean }>({
    x: 0,
    y: 0,
    inside: false,
  });
  /** The heading's own word reveal, played the moment the rope passes it. */
  const headingTlRef = useRef<gsap.core.Timeline | null>(null);

  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback((value: string) => {
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(true);
        if (copyTimer.current) clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setCopied(false), 1900);
      },
      () => {},
    );
  }, []);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  /* ---- the ink that the fall lays down ------------------------------ */

  /**
   * The ink, as a function of where the rope's leading point is.
   *
   * It runs BOTH WAYS on purpose. The first version only ever wrote, and undid
   * everything in one call when the reader turned round — which is why the
   * text did not go back, it just switched off. Going up, the rope is being
   * pulled up past the same blocks, so they have to come off in the reverse
   * order they went on, at the moment it passes them.
   */
  const syncInk = useCallback((upTo: number) => {
    const list = targetsRef.current;
    let i = writtenRef.current;
    while (i < list.length && upTo >= list[i].y) {
      list[i].el.setAttribute("data-written", "");
      if (list[i].el === headingRef.current?.parentElement) headingTlRef.current?.play();
      i++;
    }
    while (i > 0 && upTo < list[i - 1].y) {
      i--;
      list[i].el.removeAttribute("data-written");
      // Reversed, not reset: `pause(0)` snaps the words back to nothing in one
      // frame, and that snap is exactly what "the text disappears abruptly"
      // was.
      if (list[i].el === headingRef.current?.parentElement) headingTlRef.current?.reverse();
    }
    writtenRef.current = i;
  }, []);

  const unwrite = useCallback(() => {
    for (const t of targetsRef.current) t.el.removeAttribute("data-written");
    writtenRef.current = 0;
    headingTlRef.current?.reverse();
  }, []);

  /* ---- the cut ------------------------------------------------------- */

  const cut = useCallback(() => {
    const path = threadPathRef.current;
    const section = sectionRef.current;
    const geo = geoRef.current;
    if (!path || !section || !geo) return;

    /* Only as far as the pen has actually got. `paint()` writes the drawn
       length into the dash pattern, so the number is already there — no need
       to recompute what the driver has just decided. */
    const total = path.getTotalLength();
    const dash = path.style.strokeDasharray;
    const drawn = !dash || dash === "none" ? total : parseFloat(dash) || total;

    const rope = new Rope(sampleRope(path, 11, Math.max(60, Math.min(total, drawn))), {
      bounds: { floorY: geo.floorY, leftX: geo.leftX, rightX: geo.rightX },
    });
    ropeRef.current = rope;
    reelRef.current = null;
    landedRef.current = false;

    /* Painted before the attribute flips, so the frame the drawn path is
       hidden on is the frame the rope is already standing in its place. */
    ropePathRef.current?.setAttribute("d", rope.path());
    section.setAttribute("data-cut", "");
  }, []);

  /**
   * Scrolling back up REELS IT IN.
   *
   * The first version simply took the flag off and cross-faded: the heap on
   * the page and the taut line at the top of the section are nothing like each
   * other, so half a second of one dissolving into the other reads as a jump
   * cut — which is exactly what it looked like. A fall cannot be rewound (a
   * verlet step keeps no history), but it does not have to be: going up, the
   * thread should be PULLED BACK, and that is an interpolation towards a shape
   * rather than a simulation run backwards.
   *
   * The shape it aims at is the stroke the pen currently has drawn, resampled
   * every frame — not the one it was cut from. The pen is retreating at the
   * same time, so aiming at a fixed shape would land the rope on a line that
   * is no longer there. Aiming at the live one means that at the end of the
   * reel the rope IS the drawn stroke, point for point, and the hand-over back
   * to the pen needs no fade at all.
   */
  const uncut = useCallback(() => {
    const section = sectionRef.current;
    const rope = ropeRef.current;
    if (!section) return;
    armedAtRef.current = 0;
    section.removeAttribute("data-grab");
    section.removeAttribute("data-hold");
    if (!rope) {
      section.removeAttribute("data-cut");
      section.removeAttribute("data-landed");
      landedRef.current = false;
      unwrite();
      return;
    }
    /* The ink is NOT cleared here. The rope is about to travel back up past
       every block that it wrote on the way down, and each one comes off as it
       passes — see `syncInk`. Clearing them now would be the switch-off again,
       just half a second earlier. */
    // `data-cut` stays on until the reel finishes: the drawn line must not
    // reappear while the rope is still on its way back to it.
    reelRef.current = { p: 0, from: rope.snapshot() };
  }, [unwrite]);

  const thread = useThreadSegment({
    id: "contact",
    order: 70,
    /* The STAGE, not the section. A segment's element is both its render box
       and its scroll anchor, and this stretch has to be timed against the run
       itself — anchored to the whole section, the pen would still be drawing
       long after the reader had scrolled past the place it lets go. */
    ref: stageRef,
    pathRef: threadPathRef,
    range: { end: 0.5 },
    /* Almost all vertical; the curl is the only sideways travel, and at full
       weight it would eat a third of the section's scroll. */
    pace: { horizontal: 0.5 },
    /** The sag, and only the sag: the cut has its own trigger — see `CUT_AT`. */
    onPen: (_x, y) => {
      const geo = geoRef.current;
      const section = sectionRef.current;
      if (!geo || !section) return;

      /* The sheet above sags BECAUSE of the pen, so its depth is the pen's own
         descent — not a second scroll trigger that would have to be kept in
         step with this one. It reaches full stretch about halfway down the
         run, so the paper is taut for a while before it gives. */
      const t = Math.min(1, Math.max(0, (y - geo.topY) / geo.pull));
      if (Math.abs(t - tensionRef.current) > 0.005) {
        tensionRef.current = t;
        section.style.setProperty("--tension", t.toFixed(3));
      }
    },
    build: ({ rect, entry, viewportWidth }) => {
      const out = tautThread({ rect, entry, viewportWidth });
      const section = sectionRef.current;
      if (section) {
        const sec = docRect(section);
        const inset = viewportWidth >= 768 ? 18 : 12;
        /* The floor is the FIRST CONTACT RULE, not the bottom of the section.
           Two reasons, and the first one is not aesthetic: the pen finishes
           this stretch with the stage in the upper third of the screen, so a
           floor at the foot of the section is several hundred pixels below the
           fold — the fall, the landing and everything the landing writes would
           all happen where nobody is looking. Landing on the rule keeps the
           whole event inside one screen. The second reason is that it is then
           true: the thread comes to rest ON the line the contacts are written
           under, in the gap the layout leaves for it. */
        const list = listRef.current;
        const floorY = list ? docRect(list).y : sec.y + sec.height - inset;
        geoRef.current = {
          section: sec,
          topY: entry.y,
          footY: out.exit.y,
          pull: Math.max(90, (out.exit.y - entry.y) * 0.28),
          floorY,
          leftX: sec.x + inset,
          rightX: sec.x + sec.width - inset,
        };

        /* What the fall writes, and where each of them starts. Measured HERE,
           in the pass that already measures everything — never on a frame. */
        /* Only what the rope actually falls PAST. The contact lines are below
           the floor, so no fall could ever reach them — they are written by
           the landing instead, in CSS. */
        const targets: Target[] = [];
        section.querySelectorAll<HTMLElement>("[data-ink]:not(.ct-row)").forEach((el) => {
          const r = docRect(el);
          targets.push({ el, y: r.y + Math.min(30, r.height * 0.45) });
        });
        targets.sort((a, b) => a.y - b.y);
        targetsRef.current = targets;

        const sag = `${SEAM_SAG(viewportWidth)}px`;
        if (section.style.getPropertyValue("--sag") !== sag) {
          section.style.setProperty("--sag", sag);
        }

        /* The fall happens over the whole SECTION, not over the stage the
           thread is anchored to, so it gets its own viewBox — in the same
           document coordinates, so the rope needs no transform at all. */
        const svg = fallRef.current;
        if (svg) {
          svg.setAttribute("viewBox", `${sec.x} ${sec.y} ${sec.width} ${sec.height}`);
        }
      }
      return { d: out.d, exit: out.exit };
    },
  });

  /* --- Motion --------------------------------------------------------- */
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
          const heading = headingRef.current;
          if (!section || !heading) return;

          if (reduced) {
            /* No pen, so nothing would ever fall: the page arrives written,
               and the thread simply ends where it ends. */
            section
              .querySelectorAll<HTMLElement>("[data-ink]")
              .forEach((el) => el.setAttribute("data-written", ""));
            return;
          }

          section.setAttribute("data-pen", "");

          /* Two thresholds, a quarter of a screen apart. See `CUT_AT` and
             `REEL_AT`: one line for both directions made turning round undo
             the whole finale the instant the reader changed their mind. */
          const cutTrigger = ScrollTrigger.create({
            trigger: stageRef.current,
            start: CUT_AT,
            onEnter: () => {
              if (cutRef.current) return;
              cutRef.current = true;
              /* Turning round in the middle of a reel does not start again:
                 the rope is already on the page, part of the way home, and it
                 simply lets go from wherever it has got to. */
              if (reelRef.current && ropeRef.current) {
                reelRef.current = null;
                ropeRef.current.wake();
                return;
              }
              if (!ropeRef.current) armedAtRef.current = performance.now();
            },
          });

          const reelTrigger = ScrollTrigger.create({
            trigger: stageRef.current,
            start: REEL_AT,
            onLeaveBack: () => {
              if (!cutRef.current) return;
              cutRef.current = false;
              uncut();
            },
          });

          /* The heading's own reveal. Words, not characters: the hero already
             owns the typewriter, and this heading is not being typed — it is
             being splashed onto the page by something falling past it. */
          const tl = gsap.timeline({ paused: true });
          headingTlRef.current = tl;
          const split = SplitText.create(heading, {
            type: "words",
            autoSplit: true,
            onSplit: (self) => {
              const inner = gsap.timeline();
              /* No `blur()`. A blurred layer sitting at opacity 0 is the one
                 thing here that a compositor can leave a trace of — faint grey
                 word-shaped patches on the paper before anything is written —
                 and this section already had blur taken out of a reveal once,
                 in Featured Collaboration, for the cost of re-rasterising text
                 every frame. It buys nothing that the rise does not. */
              inner.fromTo(
                self.words,
                { opacity: 0, yPercent: 55 },
                { opacity: 1, yPercent: 0, duration: 0.55, stagger: 0.045, ease: "power3.out" },
              );
              const at = tl.time();
              tl.add(inner, 0);
              tl.time(at);
              return inner;
            },
          });

          /* The rope only simulates while it is on screen. Both other rigs on
             this site turn the ticker whether or not anyone is looking, and
             that is already the page's biggest idle cost — this one does not
             add to it. */
          const io = new IntersectionObserver(
            ([e]) => {
              visibleRef.current = e.isIntersecting;
              if (e.isIntersecting) ropeRef.current?.wake();
            },
            { rootMargin: "120px" },
          );
          io.observe(section);

          /** How much of the stroke the pen has actually laid down. */
          const drawnLength = (path: SVGPathElement, total: number) => {
            if (path.style.visibility === "hidden") return 0;
            const dash = path.style.strokeDasharray;
            if (!dash || dash === "none") return total;
            return parseFloat(dash) || total;
          };

          const tick = (_t: number, delta: number) => {
            const rope = ropeRef.current;

            if (!rope) {
              // Armed, waiting for the pen. See `CUT_MIN_DRAWN`.
              const at = armedAtRef.current;
              const path = threadPathRef.current;
              if (!at || !path) return;
              const total = path.getTotalLength();
              if (
                drawnLength(path, total) >= total * CUT_MIN_DRAWN ||
                performance.now() - at > CUT_WAIT_MS
              ) {
                armedAtRef.current = 0;
                cut();
              }
              return;
            }

            const reel = reelRef.current;
            if (reel) {
              const path = threadPathRef.current;
              reel.p = Math.min(1, reel.p + Math.min(delta, 50) / 1000 / REEL_SECONDS);
              // Smoothstep: it leaves the heap gently and arrives on the line
              // gently, which is what "being pulled back" looks like.
              const e = reel.p * reel.p * (3 - 2 * reel.p);
              if (path) {
                const target = sampleCount(path, rope.n, drawnLength(path, path.getTotalLength()));
                rope.setPoints(
                  reel.from.map((s, i) => ({
                    x: s.x + (target[i].x - s.x) * e,
                    y: s.y + (target[i].y - s.y) * e,
                  })),
                );
                ropePathRef.current?.setAttribute("d", rope.path());
                /* The ink comes off in the same order, and for the same
                   reason, as it went on: the rope is passing these blocks
                   again, upwards. */
                syncInk(rope.maxY);
                const geo = geoRef.current;
                const down = !!geo && rope.maxY >= geo.floorY - 8;
                if (down !== landedRef.current) {
                  landedRef.current = down;
                  section.toggleAttribute("data-landed", down);
                }
              }
              if (reel.p >= 1) {
                reelRef.current = null;
                ropeRef.current = null;
                ropePathRef.current?.removeAttribute("d");
                section.removeAttribute("data-cut");
                section.removeAttribute("data-landed");
                landedRef.current = false;
                unwrite();
              }
              return;
            }

            if (!visibleRef.current) return;

            const p = pointerRef.current;
            if (p.inside && !rope.holding) {
              rope.nudge(p.x, p.y, NUDGE_RADIUS, 0.012);
            }

            const moved = rope.step(Math.min(delta, 50) / 1000);
            if (!moved) return;

            ropePathRef.current?.setAttribute("d", rope.path());
            syncInk(rope.maxY);
            if (rope.landed && !landedRef.current) {
              landedRef.current = true;
              section.setAttribute("data-landed", "");
            }
          };
          gsap.ticker.add(tick);

          /* ---- picking it up ------------------------------------------ */

          const near = (e: PointerEvent) => {
            const rope = ropeRef.current;
            if (!rope) return null;
            const x = e.pageX;
            const y = e.pageY;
            pointerRef.current = { x, y, inside: true };
            return rope.nearest(x, y);
          };

          const onMove = (e: PointerEvent) => {
            const rope = ropeRef.current;
            if (!rope) return;
            if (rope.holding) {
              rope.dragTo(e.pageX, e.pageY);
              return;
            }
            if (e.pointerType !== "mouse") return;
            const hit = near(e);
            section.toggleAttribute("data-grab", !!hit && hit.distance < GRAB_RADIUS);
          };

          const onDown = (e: PointerEvent) => {
            if (e.pointerType !== "mouse" || e.button !== 0) return;
            const rope = ropeRef.current;
            if (!rope) return;
            const hit = near(e);
            if (!hit || hit.distance > GRAB_RADIUS) return;
            e.preventDefault();
            rope.grab(hit.index, e.pageX, e.pageY);
            section.setAttribute("data-hold", "");
            section.setPointerCapture?.(e.pointerId);
          };

          const onUp = (e: PointerEvent) => {
            const rope = ropeRef.current;
            if (!rope?.holding) return;
            rope.release();
            section.removeAttribute("data-hold");
            section.releasePointerCapture?.(e.pointerId);
          };

          const onLeave = () => {
            pointerRef.current.inside = false;
            section.removeAttribute("data-grab");
          };

          section.addEventListener("pointermove", onMove);
          section.addEventListener("pointerdown", onDown);
          section.addEventListener("pointerleave", onLeave);
          window.addEventListener("pointerup", onUp);

          return () => {
            gsap.ticker.remove(tick);
            cutTrigger.kill();
            reelTrigger.kill();
            io.disconnect();
            section.removeEventListener("pointermove", onMove);
            section.removeEventListener("pointerdown", onDown);
            section.removeEventListener("pointerleave", onLeave);
            window.removeEventListener("pointerup", onUp);
            split.revert();
            tl.kill();
            headingTlRef.current = null;
            ropeRef.current = null;
            reelRef.current = null;
            cutRef.current = false;
            armedAtRef.current = 0;
            tensionRef.current = -1;
            unwrite();
            section.removeAttribute("data-pen");
            section.removeAttribute("data-cut");
            section.removeAttribute("data-landed");
            section.removeAttribute("data-grab");
            section.removeAttribute("data-hold");
            section.style.removeProperty("--tension");
          };
        },
      );

      return () => mm.revert();
    },
    { scope: sectionRef },
  );

  return (
    <section id="contact" ref={sectionRef} className="ct-section">
      {/* The way in. Not a new sheet arriving — the sheet ABOVE, sagging on
          the thread that runs through it. It deepens as the pen descends and
          snaps flat the instant the thread lets go, which is the only place
          on the site where a seam and the line's own event are the same
          event. */}
      <div aria-hidden className="ct-seam">
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" fill="none">
          {/* A LOCAL pucker, not a wave. The first version dipped across the
              whole width, and a 54px dip over 1440px of paper is a curve
              nobody reads as anything: it just looks like the seam is not
              level. The paper is being pulled at ONE point, so the sag has to
              be steep and narrow enough to say so. */}
          <path
            className="ct-seam-fill"
            d="M 0 0 L 300 0 C 404 0, 414 96, 500 96 C 586 96, 596 0, 700 0 L 1000 0 L 0 0 Z"
          />
          <path
            className="ct-seam-ink"
            vectorEffect="non-scaling-stroke"
            d="M 0 0 L 300 0 C 404 0, 414 96, 500 96 C 586 96, 596 0, 700 0 L 1000 0"
          />
        </svg>
      </div>

      <div aria-hidden className="ct-margin" />

      {/* Writing paper. Stack rules with dots, Projects with a cross-rule,
          Education with a weave, Collaboration with a chart — this one is
          ruled like a letter, because it is one. */}
      <div aria-hidden className="ct-paper" />

      {/* The stage the taut run hangs in. It is the thread segment's element,
          so the run is timed against itself rather than against the copy it
          is about to write. */}
      <div ref={stageRef} className="ct-stage">
        {thread.d && (
          <svg
            aria-hidden
            className="ct-thread"
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
      </div>

      <div className="ct-inner">
        <div className="ct-header">
          <p data-ink className="ct-eyebrow font-body">
            {CONTACT_COPY.eyebrow}
          </p>
          <div data-ink className="ct-heading-wrap">
            <h2 ref={headingRef} className="ct-heading font-display">
              {CONTACT_COPY.heading}
            </h2>
          </div>
          <p data-ink className="ct-lead font-body">
            {CONTACT_COPY.lead}
          </p>
        </div>

        <ul ref={listRef} className="ct-list">
          {CONTACT_LINES.map((line, i) => (
            <li key={line.label} data-ink className="ct-row">
              <span aria-hidden className="ct-rule" />
              <a
                className="ct-hit"
                href={line.href}
                {...(line.external ? { target: "_blank", rel: "noreferrer" } : {})}
              >
                <span aria-hidden className="ct-index font-body">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="ct-label font-body">{line.label}</span>
                <span className="ct-value font-display">
                  <span className="ct-value-text">{line.value}</span>
                  {/* Underlined BY HAND on hover — the site's own stroke, and
                      revealed by a wipe rather than by a dash offset: the path
                      is stretched to the width of the value, and a normalised
                      `pathLength` is measured in the WRONG space once
                      `non-scaling-stroke` is on it, so the dash never worked. */}
                  <svg
                    aria-hidden
                    className="ct-scribble"
                    viewBox="0 0 200 10"
                    preserveAspectRatio="none"
                    fill="none"
                  >
                    <path
                      vectorEffect="non-scaling-stroke"
                      d="M 2 6.4 C 35 3.3, 68 8.3, 101 5.5 C 134 2.8, 167 7.5, 198 4.5"
                    />
                  </svg>
                </span>
              </a>

              {line.action === "copy" ? (
                <button
                  type="button"
                  className="ct-act font-body"
                  data-done={copied ? "" : undefined}
                  onClick={() => copy(line.value)}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              ) : (
                <MagneticLink
                  href={line.href}
                  external={line.external}
                  className="ct-act font-body"
                >
                  {line.action === "call" ? "Call" : "Open ↗"}
                </MagneticLink>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* What is left of the line, once it is an object rather than a
          drawing. Its own layer, over everything: it falls in FRONT of the
          page it is writing. `overflow: visible` because the heap sits on the
          very bottom edge — the same trap the cords in Education fell into. */}
      <svg
        aria-hidden
        ref={fallRef}
        className="ct-fall"
        preserveAspectRatio="none"
        fill="none"
      >
        <path ref={ropePathRef} className="draw-line ct-rope" vectorEffect="non-scaling-stroke" />
      </svg>
    </section>
  );
}
