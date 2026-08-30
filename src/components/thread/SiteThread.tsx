"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useGSAP } from "@gsap/react";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { docRect, type Point, type Rect } from "./geometry";

/* ------------------------------------------------------------------ */
/*  The site-wide thread                                               */
/*                                                                     */
/*  One pen draws the whole site. Sections do NOT invent their own      */
/*  line — each registers a SEGMENT and is handed the exact point where */
/*  the previous segment's pen came to rest, in document coordinates.   */
/*  Continuity of POSITION is therefore structural: there is no pair of */
/*  sections whose join has to be nudged by hand.                       */
/*                                                                     */
/*  Continuity of MOTION is the other half, and it needs the same       */
/*  treatment. Every segment used to own a ScrollTrigger of its own.    */
/*  Their scroll windows were contiguous, so on paper only one could    */
/*  ever be drawing — but a scrub is a lag, not a position, and two     */
/*  scrubs with anything less than identical settings visibly move at   */
/*  the same time near a seam. Scrolling back up, the segment above     */
/*  would retreat while the one below was still tucking itself away:    */
/*  unmistakably two lines that happen to touch.                        */
/*                                                                     */
/*  So there is exactly ONE driver for the entire thread. One           */
/*  ScrollTrigger, one scrub, one scalar. Every frame it works out      */
/*  where the pen is, and writes: fully drawn behind it, nothing ahead  */
/*  of it, and the partial stroke on the one segment it is inside. At   */
/*  any instant precisely one segment is in motion, which is what makes */
/*  the thread behave as the single line it is meant to be.             */
/*                                                                     */
/*  Geometry stays global; RENDERING stays local. Each section draws    */
/*  its own <path> in its own DOM, so it keeps control of stacking,     */
/*  clipping (About's wipe reveals its stretch of thread) and colour.   */
/* ------------------------------------------------------------------ */

/** How far the pen trails the scroll, in seconds of catch-up. ONE value for
 *  the whole site, on purpose: this is the setting that, if it ever differed
 *  between segments, would make them read as separate lines again. */
const SCRUB = 1.1;

export type BuildArgs = {
  /** The registering element's box, in document coordinates. */
  rect: Rect;
  /** Where the previous segment left the pen, in document coordinates. */
  entry: Point;
  viewportWidth: number;
};

export type BuildResult = {
  /** Path data in document coordinates. Empty string draws nothing. */
  d: string;
  /** Where this segment leaves the pen, for the next section. */
  exit: Point;
  /**
   * Optional leading sub-path (a prefix of `d`) drawn on load rather than on
   * scroll — Hero's opening flourish. It is measured at runtime to find where
   * the intro hands over, so the split is exact and never guessed.
   */
  introD?: string;
};

/** A block the pen travels past, in document coordinates. */
export type Band = { top: number; bottom: number };

/**
 * How a segment decides which block the pen is working on.
 *
 * `turn` — a block is claimed when the pen turns downhill off a lane. Right
 *   for a serpentine, where the pen wraps blocks from alternating sides.
 * `reach` — the block whose top the pen has last travelled past, and every
 *   block above it counts as reached. Right for a spine, which never turns:
 *   a turn-based reading would fire once at the top and then never again.
 */
export type BandMode = "turn" | "reach";

/**
 * When this segment's stretch is drawn, as viewport fractions.
 *
 * `end` is the moment its section's BOTTOM edge reaches that fraction of the
 * viewport. `start` is only read for the FIRST segment in the chain (as the
 * fraction its section's TOP reaches); every other segment starts exactly
 * where the previous one ended, because the driver chains them rather than
 * trusting two configs to agree. A seam cannot drift if there is only one
 * number describing it.
 */
export type ThreadRange = { start?: number; end: number };

type Pace = { horizontal: number };

type Registration = {
  id: string;
  order: number;
  el: Element;
  build: (a: BuildArgs) => BuildResult;
  pathRef: RefObject<SVGPathElement | null>;
  range: ThreadRange;
  pace?: Pace;
  bands?: () => Band[];
  onBand?: (index: number) => void;
  bandMode?: BandMode;
  onPen?: (x: number, y: number) => void;
  hasIntro: boolean;
};

type SegmentOutput = { d: string; viewBox: string; introD: string };

/* Register and outputs live in separate contexts on purpose: `register` has
   to stay referentially stable, or every recompute would re-register every
   segment and spin. */
const RegisterContext = createContext<((r: Registration) => () => void) | null>(null);
const OutputsContext = createContext<Record<string, SegmentOutput>>({});
const ReadyContext = createContext<((id: string) => void) | null>(null);

/* ------------------------------------------------------------------ */
/*  Pacing                                                             */
/*                                                                     */
/*  DrawSVG advances by PATH LENGTH, and scroll maps to it linearly.   */
/*  That is right for a segment that mostly runs downhill, and wrong    */
/*  for one that snakes: Stack's serpentine is ~80% horizontal by       */
/*  length, so a length-paced draw would spend four fifths of the       */
/*  section's scroll sweeping sideways while the page barely moves,     */
/*  then drop between rows in a blink.                                  */
/*                                                                     */
/*  So the pen is paced on a weighted metric instead — vertical travel  */
/*  at full weight, horizontal at `horizontal` — sampled once off the   */
/*  real path. A sweep still costs scroll (it is a gesture, not a       */
/*  transition), just no longer all of it.                             */
/*                                                                     */
/*  The weight is a per-segment SHAPE knob: it only redistributes that  */
/*  segment's own scroll budget, so raising it slows a sweep without    */
/*  desynchronising anything. The FEEL knob — how far the pen trails —  */
/*  is `SCRUB`, and that one is deliberately global.                    */
/* ------------------------------------------------------------------ */

type PaceTable = {
  /** Cumulative weighted cost at sample i; index maps to length linearly. */
  cost: Float64Array;
  samples: number;
  total: number;
  totalCost: number;
};

function buildPaceTable(path: SVGPathElement, horizontal: number, samples = 600): PaceTable {
  const total = path.getTotalLength();
  const cost = new Float64Array(samples + 1);
  let prev = path.getPointAtLength(0);
  let acc = 0;
  for (let i = 1; i <= samples; i++) {
    const pt = path.getPointAtLength((total * i) / samples);
    acc += Math.abs(pt.y - prev.y) + horizontal * Math.abs(pt.x - prev.x);
    cost[i] = acc;
    prev = pt;
  }
  return { cost, samples, total, totalCost: acc };
}

/** Inverse of the table: the path length at which the given cost is reached. */
function lengthAtCost(t: PaceTable, target: number) {
  const { cost, samples, total } = t;
  if (target <= 0) return 0;
  if (target >= cost[samples]) return total;
  let lo = 0;
  let hi = samples;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cost[mid] <= target) lo = mid;
    else hi = mid;
  }
  const span = cost[hi] - cost[lo];
  const f = span ? (target - cost[lo]) / span : 0;
  return (total * (lo + f)) / samples;
}

/** Forward lookup: the cost accrued by the time the pen has drawn `len`. */
function costAtLength(t: PaceTable, len: number) {
  if (len <= 0) return 0;
  const i = Math.min(t.samples, Math.max(0, Math.round((len / t.total) * t.samples)));
  return t.cost[i];
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** A path point as a plain object, so it can outlive the SVGPoint. */
function point(path: SVGPathElement, len: number): Point {
  const p = path.getPointAtLength(len);
  return { x: p.x, y: p.y };
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * How far along the full path the intro prefix reaches, as a percentage.
 * Measured off a throwaway <path> in the same SVG rather than estimated, so
 * the hand-over from the load animation to the scroll is seamless at any size.
 */
function introPercent(path: SVGPathElement, introD: string) {
  const svg = path.ownerSVGElement;
  if (!svg || !introD) return 0;
  const probe = document.createElementNS(SVG_NS, "path");
  probe.setAttribute("d", introD);
  probe.style.visibility = "hidden";
  svg.appendChild(probe);
  const introLen = probe.getTotalLength();
  svg.removeChild(probe);
  const total = path.getTotalLength();
  return total ? Math.min(100, (introLen / total) * 100) : 0;
}

/**
 * Paint exactly `len` of a path.
 *
 * `stroke-linecap: round` on a dash of zero length is painted as a DOT — the
 * pen sitting on the paper before it has moved. Every segment renders a state
 * the moment it exists, so that dot would appear at the top of a section from
 * page load and wait there in plain sight until the thread reached it.
 * Squaring the caps off would fix it and cost the line its hand-drawn ends, so
 * an empty segment is simply hidden.
 */
function paint(path: SVGPathElement, len: number, total: number) {
  if (len <= 0.6) {
    if (path.style.visibility !== "hidden") path.style.visibility = "hidden";
    return;
  }
  if (path.style.visibility !== "") path.style.visibility = "";
  if (len >= total - 0.6) {
    if (path.style.strokeDasharray !== "none") path.style.strokeDasharray = "none";
    return;
  }
  path.style.strokeDasharray = `${len}px ${total + 1}px`;
  path.style.strokeDashoffset = "0px";
}

/* ------------------------------------------------------------------ */
/*  Which block the pen is working on                                  */
/*                                                                     */
/*  NOT "the block nearest the pen". A serpentine spends every          */
/*  horizontal sweep at a lane exactly midway between two blocks, where */
/*  the two distances agree to within a pixel or two and the line's own */
/*  hand-drawn quiver flips the winner back and forth — the highlight   */
/*  strobed.                                                            */
/*                                                                     */
/*  What the eye actually reads is the TURN. A block is claimed when    */
/*  the pen turns downhill off a lane, and keeps the highlight through  */
/*  the whole sweep beneath it, until the pen turns down again.         */
/*  Classification is relative — |dy| against |dx| — so it needs no     */
/*  thresholds tuned to a viewport.                                     */
/*                                                                     */
/*  It is fed by ARC LENGTH, not by frames. A frame-to-frame delta is   */
/*  only as fine as the scroll is slow: flick the wheel and one frame   */
/*  swallows a whole lane plus the rail after it, the turn between them */
/*  never appears in any delta, and categories go unlit. The driver     */
/*  therefore walks the path from where the pen was to where it now is  */
/*  in bounded steps, so the same turns are seen at any scroll speed.   */
/* ------------------------------------------------------------------ */
function createBandTracker(
  getBands: () => Band[],
  notify: (i: number) => void,
  mode: BandMode = "turn",
) {
  let heading: "down" | "up" | "side" = "side";
  let prevX = NaN;
  let prevY = NaN;
  let band = -1;

  const set = (next: number) => {
    if (next === band) return;
    band = next;
    notify(next);
  };

  return {
    reset() {
      prevX = NaN;
      prevY = NaN;
      heading = "side";
      set(-1);
    },
    track(x: number, y: number) {
      /* A spine gives the tracker no turns to read: it leaves the lane once
         and runs straight down past every node. So the reading is simply how
         far the pen has got — which is also monotonic in the pen's y, and
         therefore cannot strobe and rewinds exactly on the way back up. */
      if (mode === "reach") {
        const list = getBands();
        let picked = -1;
        for (let i = 0; i < list.length; i++) if (list[i].top <= y) picked = i;
        set(picked);
        return;
      }
      if (Number.isNaN(prevX)) {
        prevX = x;
        prevY = y;
        return;
      }
      const dx = x - prevX;
      const dy = y - prevY;
      prevX = x;
      prevY = y;
      // A frame the pen barely moved in must not reclassify anything.
      if (Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4) return;

      const next: typeof heading =
        Math.abs(dy) > Math.abs(dx) ? (dy > 0 ? "down" : "up") : "side";
      const turned = next !== heading;
      heading = next;
      if (!turned || next === "side") return;

      const list = getBands();
      let picked = -1;
      if (next === "down") {
        // Turning downhill claims the next block below the pen.
        for (let i = 0; i < list.length; i++) {
          if (list[i].bottom >= y) {
            picked = i;
            break;
          }
        }
      } else {
        // Scrolling back up hands the highlight back the same way it came.
        for (let i = list.length - 1; i >= 0; i--) {
          if (list[i].top <= y) {
            picked = i;
            break;
          }
        }
      }
      set(picked);
    },
  };
}

/* ------------------------------------------------------------------ */

export function ThreadProvider({ children }: { children: React.ReactNode }) {
  const regs = useRef(new Map<string, Registration>());
  const [outputs, setOutputs] = useState<Record<string, SegmentOutput>>({});
  const [readyTick, setReadyTick] = useState(0);
  const ready = useRef(new Set<string>());
  const frame = useRef<number | null>(null);

  const recompute = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const list = [...regs.current.values()].sort((a, b) => a.order - b.order);
      if (!list.length) return;

      let pen: Point = { x: 0, y: 0 };
      const next: Record<string, SegmentOutput> = {};

      for (const seg of list) {
        const rect = docRect(seg.el);
        const { d, exit, introD } = seg.build({
          rect,
          entry: pen,
          viewportWidth: window.innerWidth,
        });
        // The viewBox is the section's own document box, so a path written in
        // document coordinates renders 1:1 inside the section with no
        // translation and no distortion.
        next[seg.id] = {
          d,
          introD: introD ?? "",
          viewBox: `${rect.x} ${rect.y} ${rect.width} ${rect.height}`,
        };
        pen = exit;
      }

      setOutputs((prev) => {
        const keys = Object.keys(next);
        const unchanged =
          keys.length === Object.keys(prev).length &&
          keys.every(
            (k) =>
              prev[k]?.d === next[k].d &&
              prev[k]?.viewBox === next[k].viewBox &&
              prev[k]?.introD === next[k].introD,
          );
        return unchanged ? prev : next;
      });
    });
  }, []);

  const register = useCallback(
    (r: Registration) => {
      regs.current.set(r.id, r);
      recompute();
      return () => {
        regs.current.delete(r.id);
        recompute();
      };
    },
    [recompute],
  );

  const markReady = useCallback((id: string) => {
    if (ready.current.has(id)) return;
    ready.current.add(id);
    setReadyTick((n) => n + 1);
  }, []);

  useEffect(() => {
    // Body resize covers section reflow (copy, breakpoints, font swap);
    // the explicit listeners cover the rest.
    const ro = new ResizeObserver(recompute);
    ro.observe(document.body);
    window.addEventListener("resize", recompute);
    document.fonts?.ready.then(recompute).catch(() => {});
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [recompute]);

  /* ---------------------------------------------------------------- */
  /*  The one driver                                                   */
  /* ---------------------------------------------------------------- */
  useGSAP(
    () => {
      const list = [...regs.current.values()].sort((a, b) => a.order - b.order);
      if (!list.length) return;

      type Leg = {
        el: Element;
        path: SVGPathElement;
        table: PaceTable;
        total: number;
        /** Length the intro already drew; the scroll picks up from here. */
        from: number;
        startFrac: number;
        endFrac: number;
        s: number;
        e: number;
        tracker: ReturnType<typeof createBandTracker> | null;
        /** Where the tracker last looked, so a jump can be walked, not skipped. */
        seen: number;
        /** Reported to the section every frame, when it asks. See `onPen`. */
        onPen?: (x: number, y: number) => void;
        head: Point;
        tail: Point;
      };

      const legs: Leg[] = [];
      for (const seg of list) {
        const out = outputs[seg.id];
        const path = seg.pathRef.current;
        if (!out || !out.d || !path) continue;
        // A segment that still owes its load animation is not the driver's to
        // touch yet; hold the whole chain until it hands over.
        if (seg.hasIntro && !ready.current.has(seg.id)) return;
        const total = path.getTotalLength();
        legs.push({
          el: seg.el,
          path,
          table: buildPaceTable(path, seg.pace?.horizontal ?? 1),
          total,
          from: out.introD ? (total * introPercent(path, out.introD)) / 100 : 0,
          startFrac: seg.range.start ?? 0,
          endFrac: seg.range.end,
          s: 0,
          e: 0,
          tracker:
            seg.bands && seg.onBand
              ? createBandTracker(seg.bands, seg.onBand, seg.bandMode)
              : null,
          seen: -1,
          onPen: seg.onPen,
          // The ends, measured once: a segment the pen has passed reports its
          // tail and one it has not reached reports its head, so a section
          // driven by the pen's position is correct off-screen too.
          head: point(path, 0),
          tail: point(path, total),
        });
      }
      if (!legs.length) return;

      if (prefersReducedMotion()) {
        legs.forEach((l) => paint(l.path, l.total, l.total));
        return;
      }

      /* Scroll windows. Only the first segment's own start is used; every
         other one begins exactly where its predecessor ended, so the chain
         has no seam to keep in agreement. */
      const measure = () => {
        const vh = window.innerHeight;
        legs.forEach((l, i) => {
          const r = docRect(l.el);
          l.e = r.y + r.height - l.endFrac * vh;
          l.s = i === 0 ? r.y - l.startFrac * vh : legs[i - 1].e;
        });
      };
      measure();

      const proxy = { v: 0 };

      const apply = () => {
        const first = legs[0];
        const last = legs[legs.length - 1];
        const span = Math.max(1, last.e - first.s);
        const at = first.s + proxy.v * span;

        // The one segment the pen is inside; everything before it is finished
        // and everything after it has not been started.
        let active = legs.length - 1;
        for (let i = 0; i < legs.length; i++) {
          if (at <= legs[i].e) {
            active = i;
            break;
          }
        }

        for (let i = 0; i < legs.length; i++) {
          const l = legs[i];
          if (i < active) {
            paint(l.path, l.total, l.total);
            l.onPen?.(l.tail.x, l.tail.y);
            continue;
          }
          if (i > active) {
            paint(l.path, 0, l.total);
            l.onPen?.(l.head.x, l.head.y);
            if (l.tracker && l.seen !== -1) {
              l.tracker.reset();
              l.seen = -1;
            }
            continue;
          }
          const t = Math.min(1, Math.max(0, (at - l.s) / Math.max(1, l.e - l.s)));
          const fromCost = costAtLength(l.table, l.from);
          const len = lengthAtCost(
            l.table,
            fromCost + (l.table.totalCost - fromCost) * t,
          );
          paint(l.path, len, l.total);
          if (l.onPen) {
            const pt = l.path.getPointAtLength(len);
            l.onPen(pt.x, pt.y);
          }
          if (l.tracker) {
            // Walk from the last look to here in bounded steps. A fast flick
            // must see the same turns a slow drag does.
            const STEP = 26;
            if (l.seen < 0) l.seen = len;
            const delta = len - l.seen;
            const steps = Math.min(80, Math.ceil(Math.abs(delta) / STEP));
            for (let k = 1; k <= steps; k++) {
              const at2 = l.seen + (delta * k) / steps;
              const pt = l.path.getPointAtLength(at2);
              l.tracker.track(pt.x, pt.y);
            }
            if (!steps) {
              const pt = l.path.getPointAtLength(len);
              l.tracker.track(pt.x, pt.y);
            }
            l.seen = len;
          }
        }
      };

      gsap.fromTo(
        proxy,
        { v: 0 },
        {
          v: 1,
          ease: "none",
          onUpdate: apply,
          scrollTrigger: {
            trigger: document.body,
            start: () => legs[0].s,
            end: () => legs[legs.length - 1].e,
            scrub: SCRUB,
            onRefresh: measure,
          },
        },
      );
      apply();
    },
    { dependencies: [outputs, readyTick], revertOnUpdate: true },
  );

  return (
    <RegisterContext.Provider value={register}>
      <ReadyContext.Provider value={markReady}>
        <OutputsContext.Provider value={outputs}>{children}</OutputsContext.Provider>
      </ReadyContext.Provider>
    </RegisterContext.Provider>
  );
}

type UseThreadSegment = {
  id: string;
  /** Position in the chain. Leave gaps (10, 20, 30…) so sections can be inserted. */
  order: number;
  /** The section element: its box is the render box and the scroll anchor. */
  ref: RefObject<HTMLElement | null>;
  /** The <path> this segment draws into. Owned by the section. */
  pathRef: RefObject<SVGPathElement | null>;
  build: (a: BuildArgs) => BuildResult;
  /** When this stretch is drawn. See `ThreadRange`. */
  range: ThreadRange;
  /**
   * Re-time the draw so sideways travel costs less scroll than downward
   * travel. Only redistributes this segment's own budget. See the pacing note.
   */
  pace?: Pace;
  /**
   * Blocks the pen travels past, in document coordinates. Read fresh on every
   * frame, so pass a getter backed by whatever the section measured — never a
   * snapshot, which would go stale on the first reflow.
   */
  bands?: () => Band[];
  /** Called only when the block the pen is working on changes. -1 = none. */
  onBand?: (index: number) => void;
  /** How that block is chosen. Defaults to `turn`. See `BandMode`. */
  bandMode?: BandMode;
  /**
   * The pen's position in document coordinates, every frame.
   *
   * `onBand` is the right tool when a section's states are STEPS — a card
   * lights, a wrap closes. It is the wrong one when a section's state is a
   * CONTINUOUS quantity the pen is supposed to be dragging: Education's
   * scrolls unroll exactly as far as the pen has travelled past their rod,
   * and no number of bands makes that smooth.
   *
   * Called for every registered segment, not only the one being drawn: a
   * segment already behind the pen reports its own end and one still ahead
   * reports its start, so a section reads the same value whether or not the
   * pen is currently inside it — which is what makes the reveal reverse
   * cleanly and survive a resize.
   *
   * It runs on the scrub frame, so do no layout reading in it. Writing a
   * custom property is fine; changing anything that reflows the page is not,
   * or the measuring pass will chase its own tail.
   */
  onPen?: (x: number, y: number) => void;
  /**
   * Draw this segment's `introD` prefix on load instead of on scroll. `play`
   * is the hand-off signal (the preloader finishing). The driver leaves the
   * whole thread alone until the intro has finished, so the two never fight
   * over the same property.
   */
  intro?: { play: boolean; delay?: number; duration?: number };
};

export function useThreadSegment({
  id,
  order,
  ref,
  pathRef,
  build,
  range,
  pace,
  bands,
  onBand,
  bandMode,
  onPen,
  intro,
}: UseThreadSegment) {
  const register = useContext(RegisterContext);
  const markReady = useContext(ReadyContext);
  const outputs = useContext(OutputsContext);
  const [introDone, setIntroDone] = useState(!intro);

  // Keep the latest closures without re-registering on every render.
  const buildRef = useRef(build);
  const bandsRef = useRef(bands);
  const onBandRef = useRef(onBand);
  const onPenRef = useRef(onPen);
  useLayoutEffect(() => {
    buildRef.current = build;
    bandsRef.current = bands;
    onBandRef.current = onBand;
    onPenRef.current = onPen;
  });

  const hasIntro = !!intro;
  const wantsBands = !!bands;
  const wantsOnBand = !!onBand;
  const wantsOnPen = !!onPen;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!register || !el) return;
    return register({
      id,
      order,
      el,
      pathRef,
      range,
      pace,
      bandMode,
      hasIntro,
      build: (a) => buildRef.current(a),
      bands: bands ? () => bandsRef.current?.() ?? [] : undefined,
      onBand: onBand ? (i) => onBandRef.current?.(i) : undefined,
      onPen: onPen ? (x, y) => onPenRef.current?.(x, y) : undefined,
    });
    // `range` and `pace` are plain config objects; spread their fields so a
    // fresh object literal each render does not churn the registry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    register,
    id,
    order,
    ref,
    pathRef,
    hasIntro,
    range.start,
    range.end,
    pace?.horizontal,
    bandMode,
    wantsBands,
    wantsOnBand,
    wantsOnPen,
  ]);

  const out = outputs[id];
  const d = out?.d ?? "";
  const introD = out?.introD ?? "";
  const viewBox = out?.viewBox ?? "0 0 0 0";
  const introPlay = intro?.play ?? false;
  const introDelay = intro?.delay ?? 0;
  const introDuration = intro?.duration ?? 1;

  /* The load animation, if this segment has one. The only thing besides the
     driver that ever writes to a path — and the driver waits for it. */
  useGSAP(
    () => {
      const path = pathRef.current;
      if (!path || !d || !intro) return;

      if (prefersReducedMotion()) {
        setIntroDone(true);
        markReady?.(id);
        return;
      }

      if (introDone) return;

      const total = path.getTotalLength();
      paint(path, 0, total);
      if (!introPlay) return;

      const end = (total * introPercent(path, introD)) / 100;
      const state = { len: 0 };
      gsap.to(state, {
        len: end,
        delay: introDelay,
        duration: introDuration,
        ease: "power2.inOut",
        onUpdate: () => paint(path, state.len, total),
        onComplete: () => {
          setIntroDone(true);
          markReady?.(id);
        },
      });
    },
    {
      dependencies: [d, introD, introPlay, introDelay, introDuration, introDone],
      revertOnUpdate: true,
    },
  );

  /* Segments with no load animation are the driver's from the start. */
  useEffect(() => {
    if (!intro && d) markReady?.(id);
  }, [intro, d, id, markReady]);

  /* Font swaps and late layout shifts move every anchor; the driver reads its
     windows back on refresh. */
  useEffect(() => {
    if (!document.fonts?.ready) return;
    document.fonts.ready.then(() => ScrollTrigger.refresh()).catch(() => {});
  }, []);

  return useMemo(() => ({ d, viewBox }), [d, viewBox]);
}
