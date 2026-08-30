/**
 * Shared geometry for the site-wide thread.
 *
 * Everything here works in DOCUMENT coordinates (px), so a segment built by
 * one section lines up exactly with the next one's — no per-pair tuning.
 */

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

/** An element's box in document coordinates. */
export function docRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return {
    x: r.left + window.scrollX,
    y: r.top + window.scrollY,
    width: r.width,
    height: r.height,
  };
}

/**
 * An element's LAYOUT box in document coordinates.
 *
 * `docRect` reads `getBoundingClientRect()`, which reports where a box is
 * PAINTED — and a `position: sticky` element that is currently stuck is
 * painted somewhere its layout never put it. Handing that to the geometry
 * would make the route's shape depend on where the reader happens to be
 * standing. The offset chain reports the position the LAYOUT assigned, which
 * is the only one the route can reason about. Same lesson as the rig in
 * Education, where a transform was doing the lying.
 */
export function staticRect(el: HTMLElement): Rect {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y, width: el.offsetWidth, height: el.offsetHeight };
}

/**
 * The left margin the thread runs down. Derived from the same padding scale
 * the sections use, so it stays put across breakpoints and every section
 * lands on the identical x.
 */
export function gutterX(sectionX: number, viewportWidth: number) {
  const pad = viewportWidth >= 768 ? 64 : 24;
  return Math.max(12, sectionX + pad - 22);
}

const n = (v: number) => v.toFixed(1);

/**
 * A long vertical run hugging `x`, sampled and joined with smooth cubics.
 * The wobble comes from a plain sine with a fixed seed rather than random
 * noise — the line has to be identical on every rebuild, or it would twitch
 * on resize.
 */
export function runDown(
  from: Point,
  x: number,
  endY: number,
  { steps = 9, amp = 7, seed = 0 }: { steps?: number; amp?: number; seed?: number } = {},
) {
  let d = "";
  let prev = from;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const y = from.y + (endY - from.y) * t;
    const px = x + Math.sin((i + seed) * 0.92) * amp;
    const midY = (prev.y + y) / 2;
    d += ` C ${n(prev.x)} ${n(midY)}, ${n(px)} ${n(midY)}, ${n(px)} ${n(y)}`;
    prev = { x: px, y };
  }
  return { d, end: prev };
}

/**
 * The pen peeling sideways from `from` and arriving at `x` by `arriveY`.
 *
 * Both ends are tangent-matched, which is what keeps the line from kinking:
 *  - it LEAVES along `outDir` (pass the previous stroke's end tangent, and the
 *    join is invisible; omit it and the curve simply starts downward), and
 *  - it ARRIVES vertically, because the second control point sits directly
 *    above the end — so `runDown`, which departs vertically, continues it
 *    smoothly instead of turning a corner.
 */
export function peelTo(
  from: Point,
  x: number,
  arriveY: number,
  outDir?: Point,
) {
  const dy = arriveY - from.y;

  let c1: Point;
  if (outDir) {
    const len = Math.hypot(outDir.x, outDir.y) || 1;
    const reach = dy * 0.52;
    c1 = { x: from.x + (outDir.x / len) * reach, y: from.y + (outDir.y / len) * reach };
  } else {
    c1 = { x: from.x, y: from.y + dy * 0.5 };
  }

  const c2 = { x, y: from.y + dy * 0.62 };
  const d = ` C ${n(c1.x)} ${n(c1.y)}, ${n(c2.x)} ${n(c2.y)}, ${n(x)} ${n(arriveY)}`;
  return { d, end: { x, y: arriveY } };
}

/** Convenience: start a subpath at a point. */
export function moveTo(p: Point) {
  return `M ${n(p.x)} ${n(p.y)}`;
}

/**
 * The opening flourish — the stroke that used to live in Hero as its own SVG.
 * It is now simply the FIRST STRETCH of the site-wide thread, so there is no
 * join to align any more: the pen starts here and never lifts.
 *
 * The shape is the original signature, re-expressed proportionally (0..1 of
 * `box`), so it scales with whatever layout box anchors it and nothing is
 * picked by pixel. Its S-commands are expanded into explicit cubics, which is
 * what lets the end tangent fall out of the geometry instead of being typed
 * in by hand — `peelTo` then leaves along exactly that direction.
 */
export function flourish(box: Rect) {
  // p0, then three cubics as (c1, c2, p). The first two are the original
  // signature's wave, untouched. The third — its closing flick — is eased:
  // as the last stroke of a standalone signature its tight hook read fine
  // under a round cap, but now that the line carries on through it, that
  // curvature spike looked like a kink. Retuned by sweeping the tail's
  // control points against the max-turn-per-1.5px metric: 13.1° → 4.7°.
  const pts: [number, number][] = [
    [0.018, 0.667],
    [0.136, 0.167], [0.25, 0.917], [0.364, 0.417],
    [0.478, -0.083], [0.591, 0.083], [0.727, 0.583],
    [0.86, 1.0], [0.88, 0.28], [0.982, 0.5],
  ];

  const at = ([px, py]: [number, number]): Point => ({
    x: box.x + px * box.width,
    y: box.y + py * box.height,
  });

  const p0 = at(pts[0]);
  // The cubics on their own, with no opening move. Hero starts the site with
  // this stroke, so it wants the `M`; the closing signature arrives INTO it
  // out of the page above, so it wants the same shape as a continuation.
  let body = "";
  for (let i = 1; i < pts.length; i += 3) {
    const c1 = at(pts[i]);
    const c2 = at(pts[i + 1]);
    const p = at(pts[i + 2]);
    body += ` C ${n(c1.x)} ${n(c1.y)}, ${n(c2.x)} ${n(c2.y)}, ${n(p.x)} ${n(p.y)}`;
  }

  const end = at(pts[pts.length - 1]);
  const lastC2 = at(pts[pts.length - 2]);
  const firstC1 = at(pts[1]);
  return {
    d: `M ${n(p0.x)} ${n(p0.y)}` + body,
    body,
    start: p0,
    startTangent: { x: firstC1.x - p0.x, y: firstC1.y - p0.y },
    end,
    tangent: { x: end.x - lastC2.x, y: end.y - lastC2.y },
  };
}

/**
 * The right-hand rail, mirroring `gutterX`. Clamped 12px off the section edge
 * so a narrow viewport keeps the line inside the page instead of pressing it
 * against the scrollbar.
 */
export function gutterRightX(rect: Rect, viewportWidth: number) {
  const pad = viewportWidth >= 768 ? 64 : 24;
  const right = rect.x + rect.width;
  return Math.min(right - 12, right - pad + 22);
}

/**
 * Intermediate points along a straight run, nudged off the line by a sine with
 * a fixed seed. Same reasoning as `runDown`'s wobble: the hand-drawn quiver has
 * to be deterministic, or the whole serpentine would twitch on every resize.
 *
 * These are ordinary polyline vertices, so `polyRound` rounds them like any
 * other corner — which is exactly what turns a 2px kink into a soft wave.
 */
export function waver(
  a: Point,
  b: Point,
  { step = 170, amp = 2.6, seed = 0 }: { step?: number; amp?: number; seed?: number } = {},
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const count = Math.floor(dist / step);
  if (count < 1) return [] as Point[];
  // Unit normal to the run, so the nudge is always across it, never along it.
  const nx = -dy / dist;
  const ny = dx / dist;
  const pts: Point[] = [];
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const k = Math.sin((i + seed) * 1.37) * amp;
    pts.push({ x: a.x + dx * t + nx * k, y: a.y + dy * t + ny * k });
  }
  return pts;
}

/**
 * A polyline with rounded corners, as one path.
 *
 * Each interior vertex is cut back along both of its segments and rejoined
 * with a quadratic through the original corner, so the curve is tangent to
 * both runs — the serpentine turns without a visible seam, and a run leaving
 * a corner leaves it straight.
 *
 * The cut is capped at 45% of either adjacent segment, so two corners sharing
 * a short segment can never eat past each other and invert the path.
 */
export function polyRound(pts: Point[], radius: number) {
  if (pts.length < 2) return "";
  return moveTo(pts[0]) + roundedRun(pts, radius);
}

/**
 * `polyRound` without the opening move — the same rounded polyline, written as
 * a CONTINUATION of whatever stroke is already on the paper.
 *
 * A segment that mixes rectilinear tracing with free gestures (Projects wraps
 * a card, then swoops across to the next one) has to splice the two, and a
 * fresh `M` at the join would start a new subpath: harmless to look at, but it
 * is exactly the kind of thing that later turns into "why is there a round cap
 * in the middle of the line". Emitting the run as `L`/`Q` commands keeps the
 * whole section one unbroken subpath.
 */
export function roundedRun(pts: Point[], radius: number) {
  if (pts.length < 2) return "";
  if (pts.length === 2) return ` L ${n(pts[1].x)} ${n(pts[1].y)}`;

  let d = "";
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const a = pts[i - 1];
    const b = pts[i + 1];
    const la = Math.hypot(a.x - p.x, a.y - p.y);
    const lb = Math.hypot(b.x - p.x, b.y - p.y);
    if (!la || !lb) continue;
    const r = Math.min(radius, la * 0.45, lb * 0.45);
    const c1 = { x: p.x + ((a.x - p.x) / la) * r, y: p.y + ((a.y - p.y) / la) * r };
    const c2 = { x: p.x + ((b.x - p.x) / lb) * r, y: p.y + ((b.y - p.y) / lb) * r };
    d += ` L ${n(c1.x)} ${n(c1.y)} Q ${n(p.x)} ${n(p.y)}, ${n(c2.x)} ${n(c2.y)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${n(last.x)} ${n(last.y)}`;
}

/* ------------------------------------------------------------------ */
/*  Serpentine                                                         */
/*                                                                     */
/*  A whole section's worth of thread in one call: the pen arrives in   */
/*  the left gutter, sweeps right under the section's headline and on   */
/*  past where the words end, then boxes in each block on alternating   */
/*  sides — down the right margin beside the first, back left beneath   */
/*  it, down the left margin beside the second, and so on.              */
/*                                                                     */
/*  The alternation is what makes the hand-off free: with the blocks    */
/*  wrapped right / left / right / left the pen finishes in the LEFT    */
/*  gutter at the bottom edge, which is where the next section expects  */
/*  to pick it up. An odd block count would leave it on the wrong side, */
/*  so there is an explicit correction at the end.                      */
/*                                                                     */
/*  Nothing here is a number read off a screenshot: rails come from the */
/*  same padding scale the sections use, and lanes ride the middle of   */
/*  the REAL gaps between blocks, which is why a sweep can never cross  */
/*  a line of copy however the grid rewraps.                           */
/* ------------------------------------------------------------------ */

export type SerpentineArgs = {
  /** The section's box, in document coordinates. */
  rect: Rect;
  /** Where the previous segment left the pen, in document coordinates. */
  entry: Point;
  viewportWidth: number;
  /** The blocks to wrap, top to bottom, in document coordinates. */
  rows: Rect[];
  /** The headline the opening sweep runs under, if the section has one. */
  headline?: Rect;
};

export function serpentine({
  rect,
  entry,
  viewportWidth,
  rows,
  headline,
}: SerpentineArgs): { d: string; exit: Point } {
  const wide = viewportWidth >= 768;
  const leftX = gutterX(rect.x, viewportWidth);
  const rightX = gutterRightX(rect, viewportWidth);
  const bottom = rect.y + rect.height;

  // Before hydration has measured anything, fall back to a plain run so the
  // section is never left without its stretch of thread.
  if (!rows.length || !headline) {
    const run = runDown(entry, leftX, bottom, { steps: 6, amp: 6 });
    return { d: moveTo(entry) + run.d, exit: run.end };
  }

  // The opening lane sits just under the headline, so the sweep reads as an
  // underline that carried on — clamped above the first block in case the gap
  // ever tightens.
  const lane0 = Math.min(
    headline.y + headline.height + (wide ? 32 : 24),
    rows[0].y - 22,
  );

  const corners: Point[] = [entry, { x: leftX, y: lane0 }];
  const tailLane = bottom - (wide ? 96 : 64);

  for (let i = 0; i < rows.length; i++) {
    const railX = i % 2 === 0 ? rightX : leftX;
    const laneY = corners[corners.length - 1].y;
    const nextRow = rows[i + 1];
    // Lanes ride the middle of the real gap between two blocks, which is why
    // a sweep can never cross a line of copy.
    const dropTo = nextRow
      ? (rows[i].y + rows[i].height + nextRow.y) / 2
      : railX === leftX
        ? bottom
        : tailLane;

    corners.push({ x: railX, y: laneY });
    corners.push({ x: railX, y: dropTo });
  }

  const last = corners[corners.length - 1];
  if (last.x !== leftX) {
    corners.push({ x: leftX, y: last.y });
    corners.push({ x: leftX, y: bottom });
  }

  // Straights get a deterministic quiver, then the whole polyline is rounded
  // in one pass: the real corners become sweeping turns and the quiver points
  // become a soft wave, out of the same mechanism.
  const dense: Point[] = [corners[0]];
  for (let i = 1; i < corners.length; i++) {
    dense.push(
      ...waver(corners[i - 1], corners[i], {
        step: wide ? 190 : 150,
        amp: wide ? 2.8 : 1.8,
        seed: i * 5,
      }),
    );
    dense.push(corners[i]);
  }

  return {
    d: polyRound(dense, wide ? 34 : 16),
    exit: corners[corners.length - 1],
  };
}

/**
 * Unit vector, guarding the zero case.
 */
function unit(p: Point): Point {
  const len = Math.hypot(p.x, p.y) || 1;
  return { x: p.x / len, y: p.y / len };
}

/**
 * A smooth run THROUGH every point given — Catmull-Rom, emitted as cubics.
 *
 * `polyRound` is the right tool for a path made of straight runs meeting at
 * corners: it keeps the runs straight and softens the joins. It is the wrong
 * tool for a gesture — a loop, a swoop — because there the CURVE is the shape,
 * and a rounded rectangle always reads as a rounded rectangle however large
 * the radius.
 *
 * Here every point is somewhere the pen passes through and the curvature is
 * derived from its neighbours, so nothing is straight and nothing has a
 * corner. Both end tangents are pinned (`inDir` / `outDir`), which is what
 * lets a run be spliced between two others with no kink at either splice.
 */
export function smoothThrough(
  pts: Point[],
  {
    inDir,
    outDir,
    tension = 0.9,
  }: { inDir?: Point; outDir?: Point; tension?: number } = {},
): { d: string; end: Point } {
  const count = pts.length;
  if (count < 2) return { d: "", end: pts[0] ?? { x: 0, y: 0 } };

  const first = pts[0];
  const last = pts[count - 1];
  const reach = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y) || 1;

  /* Virtual points just beyond each end, carrying the requested tangent.
     Catmull-Rom takes the tangent at a point from the SPAN BETWEEN ITS
     NEIGHBOURS, so pinning the direction means placing the ghost relative to
     the point on the far side — `ghostIn` is measured back from pts[1], not
     out from `first`. Getting that wrong (as the first version did) leaves
     the end tangent carrying the sideways component of the run itself, which
     is invisible in isolation and a measurable kink at every splice: the
     knot handed the trunk a 38° turn per 1.5px where both were supposed to
     be dead vertical. */
  const ghostIn = inDir
    ? {
        x: pts[1].x - unit(inDir).x * reach(first, pts[1]) * 2,
        y: pts[1].y - unit(inDir).y * reach(first, pts[1]) * 2,
      }
    : { x: 2 * first.x - pts[1].x, y: 2 * first.y - pts[1].y };
  const ghostOut = outDir
    ? {
        x: pts[count - 2].x + unit(outDir).x * reach(pts[count - 2], last) * 2,
        y: pts[count - 2].y + unit(outDir).y * reach(pts[count - 2], last) * 2,
      }
    : { x: 2 * last.x - pts[count - 2].x, y: 2 * last.y - pts[count - 2].y };

  const at = (i: number) => (i < 0 ? ghostIn : i > count - 1 ? ghostOut : pts[i]);

  /* Handles longer than the segment they sit on make the control polygon
     double back, and the curve answers with a cusp. It shows up wherever two
     close-together points have a far-away neighbour: on a narrow screen the
     mouth of the knot is 4px wide and its next point is 130px to the right,
     which put a control point off the left edge of the screen and a 122°
     spike in the line. Shortening a handle along its own direction fixes it
     without touching the tangent it encodes. */
  const capped = (base: Point, ctrl: Point, max: number): Point => {
    const vx = ctrl.x - base.x;
    const vy = ctrl.y - base.y;
    const len = Math.hypot(vx, vy);
    if (len <= max || len === 0) return ctrl;
    const k = max / len;
    return { x: base.x + vx * k, y: base.y + vy * k };
  };

  let d = "";
  for (let i = 0; i < count - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const span = Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.5;
    const c1 = capped(
      p1,
      {
        x: p1.x + ((p2.x - p0.x) * tension) / 6,
        y: p1.y + ((p2.y - p0.y) * tension) / 6,
      },
      span,
    );
    const c2 = capped(
      p2,
      {
        x: p2.x - ((p3.x - p1.x) * tension) / 6,
        y: p2.y - ((p3.y - p1.y) * tension) / 6,
      },
      span,
    );
    d += ` C ${n(c1.x)} ${n(c1.y)}, ${n(c2.x)} ${n(c2.y)}, ${n(p2.x)} ${n(p2.y)}`;
  }
  return { d, end: last };
}

/* ------------------------------------------------------------------ */
/*  Timeline spine                                                     */
/*                                                                     */
/*  Experience's stretch, in three spliced runs.                       */
/*                                                                     */
/*  1. THE KNOT. The pen comes down the left rail exactly where        */
/*     Stack's serpentine left it, sweeps right underneath the         */
/*     headline, curls up around its right end, runs back over the top */
/*     of the words and comes down their left side — crossing the      */
/*     stroke it came in on, which is the whole point: the crossing is */
/*     what makes it read as a knot tied round the headline rather     */
/*     than a box drawn about it. The words sit above the thread in    */
/*     the stacking order, so the loop passes BEHIND them and the wrap */
/*     looks physical. It then trails away right and down.             */
/*                                                                     */
/*  2. THE TRUNK. A near-straight run down through the milestones.     */
/*                                                                     */
/*  3. THE DEPARTURE. Past the last card the pen swings out across the */
/*     empty half of the page and comes to rest on the RIGHT rail at   */
/*     the bottom edge — so the next section picks it up on the other  */
/*     side and the thread stops using the same rail twice running.    */
/*                                                                     */
/*  Every join is tangent-pinned, so none of the three splices — nor   */
/*  the seam with Stack above — has a corner in it. The whole section  */
/*  is one uninterrupted gesture with no straight lines in it except   */
/*  the trunk, which is the only part that wants to be one.            */
/*                                                                     */
/*  The trunk's x is NOT computed here: it is the centre of the        */
/*  markers themselves, measured by the section. CSS therefore decides */
/*  where the spine runs — centred between two columns on a wide       */
/*  screen, tucked to the left on a narrow one — and this function     */
/*  never needs to know a breakpoint. Threading the dots is also what  */
/*  guarantees the line passes through them and not beside them.       */
/* ------------------------------------------------------------------ */

export type TimelineSpineArgs = {
  /** The section's box, in document coordinates. */
  rect: Rect;
  /** Where the previous segment left the pen, in document coordinates. */
  entry: Point;
  viewportWidth: number;
  /** The marker dots, top to bottom, in document coordinates. */
  nodes: Rect[];
  /**
   * The headline's WORDS, not its block box. The knot wraps what is visible:
   * an <h2> is a full-width block, and looping round that would tie a knot
   * around a lot of empty paper.
   */
  headline?: Rect;
  /**
   * The last milestone's card. The departure sweeps right, so it only has to
   * clear the card when the card is itself on the right.
   */
  lastCard?: Rect;
};

export function timelineSpine({
  rect,
  entry,
  viewportWidth,
  nodes,
  headline,
  lastCard,
}: TimelineSpineArgs): { d: string; exit: Point } {
  const wide = viewportWidth >= 768;
  const leftX = gutterX(rect.x, viewportWidth);
  const rightX = gutterRightX(rect, viewportWidth);
  const bottom = rect.y + rect.height;

  // Before hydration has measured anything, fall back to a plain run so the
  // section is never left without its stretch of thread.
  if (!nodes.length || !headline) {
    const run = runDown(entry, leftX, bottom, { steps: 6, amp: 6 });
    return { d: moveTo(entry) + run.d, exit: run.end };
  }

  const spineX = nodes[0].x + nodes[0].width / 2;
  const firstY = nodes[0].y + nodes[0].height / 2;
  const lastY = nodes[nodes.length - 1].y + nodes[nodes.length - 1].height / 2;

  /* ---- 1. the knot ------------------------------------------------- */

  // Clamped inside the page: on a narrow screen the headline already starts
  // one gutter in, and an unclamped loop would bulge off the left edge.
  const L = Math.max(rect.x + (wide ? 0 : 16), headline.x - (wide ? 30 : 14));
  const R = headline.x + headline.width + (wide ? 34 : 18);
  // Barely above the words: the span's own box already carries the font's
  // ascent, so anything more and the loop climbs into the eyebrow above it.
  const T = headline.y - (wide ? 4 : 2);
  // The pass under the words. Every other point in the loop is measured off it.
  const lane = headline.y + headline.height + (wide ? 40 : 28);
  const midX = (L + R) / 2;
  const midY = (T + lane) / 2;

  // Where the trunk begins: clamped above the first dot, and given enough room
  // below the knot for the trail-off to be a curve rather than a diagonal.
  const arriveY = Math.min(firstY - (wide ? 46 : 34), lane + (wide ? 130 : 92));

  // Where the descending left side cuts back through the incoming stroke.
  const cross = { x: L - (wide ? 2 : 1), y: lane + (wide ? 34 : 24) };
  const trail = { x: spineX - cross.x, y: arriveY - cross.y };

  /* The rail down to the knot is a plain straight line, spliced in rather
     than made of curve points.

     A Catmull-Rom point sitting ON a straight rail takes its tangent from its
     neighbours — and its next neighbour is far to the right, inside the loop.
     So the curve leans right at that point, which it can only do by bowing
     LEFT on the way in: a small hump in what is supposed to be a dead-straight
     rail. Splicing is exact instead: the line arrives vertical, and the
     gesture is pinned to leave vertical, so there is nothing to bow. */
  const railTop = Math.max(entry.y + 8, lane - (wide ? 104 : 78));

  /* A point easing the rail into the lane, but ONLY where there is room for
     one. On a narrow screen the loop's left edge sits a few pixels right of
     the rail, and a point squeezed into that gap has to swing from vertical
     to horizontal across four pixels — the cusp the cap above also guards
     against, better not created in the first place. */
  const mouth: Point[] =
    L - leftX > 60 ? [{ x: leftX + (L - leftX) * 0.35, y: lane - 8 }] : [];

  const knot: Point[] = [
    { x: leftX, y: railTop },
    ...mouth,
    { x: L, y: lane + 4 },
    { x: midX, y: lane + (wide ? 8 : 6) },
    { x: R, y: lane - 4 },
    { x: R + (wide ? 16 : 10), y: midY },
    { x: R - (wide ? 44 : 26), y: T - (wide ? 8 : 5) },
    { x: midX, y: T - (wide ? 12 : 8) },
    { x: L + (wide ? 22 : 7), y: T + (wide ? 6 : 4) },
    // Down the left side and straight through the stroke it came in on.
    { x: L - (wide ? 16 : 5), y: midY + 4 },
    { x: cross.x, y: cross.y },
    /* The trail-off is written as fractions of the run from the crossing to
       the trunk, never as fixed offsets. On a narrow screen the trunk sits
       barely thirty pixels right of the crossing, and an offset picked to
       look generous at 1440 sent the pen out and back again — a visible
       kink where the gesture should be settling down. */
    { x: cross.x + trail.x * 0.34, y: cross.y + trail.y * 0.42 },
    { x: cross.x + trail.x * 0.78, y: cross.y + trail.y * 0.8 },
    { x: spineX, y: arriveY },
  ];

  const intro = smoothThrough(knot, {
    inDir: { x: 0, y: 1 },
    outDir: { x: 0, y: 1 },
  });

  /* ---- 2. the trunk ------------------------------------------------ */

  const clearsRight = !lastCard || lastCard.x + lastCard.width <= spineX + 8;
  const departY = Math.max(
    lastY + 30,
    clearsRight
      ? Math.min(lastY + (wide ? 165 : 120), bottom - (wide ? 250 : 145))
      : Math.min(
          lastCard.y + lastCard.height + (wide ? 90 : 70),
          bottom - (wide ? 210 : 130),
        ),
  );

  const trunk = runDown({ x: spineX, y: arriveY }, spineX, departY, {
    steps: Math.max(6, Math.round((departY - arriveY) / 120)),
    amp: wide ? 3 : 2,
    seed: 3,
  });

  /* ---- 3. the departure -------------------------------------------- */

  /* ONE curve, all the way to the bottom edge — settling onto the rail is
     part of it, not a separate run bolted on afterwards.

     The first version reached the rail with a pinned vertical arrival and
     then ran the rail down. That put the entire turn — from a nearly
     horizontal crossing to straight down — inside the last handful of
     vertical pixels before the rail, and it read as a corner. Carrying the
     bottom edge inside the same curve spreads that turn over the whole
     settle: the pen meets the rail already steep and only straightens as it
     runs out. The last two points are a hair short of the rail and then on
     it, so the curve leans in rather than overshooting past it. */
  const dx = rightX - trunk.end.x;
  const drop = bottom - trunk.end.y;
  const outro = smoothThrough(
    [
      trunk.end,
      { x: trunk.end.x + dx * 0.07, y: trunk.end.y + drop * 0.16 },
      { x: trunk.end.x + dx * 0.38, y: trunk.end.y + drop * 0.4 },
      { x: trunk.end.x + dx * 0.72, y: trunk.end.y + drop * 0.62 },
      { x: rightX - dx * 0.03, y: trunk.end.y + drop * 0.8 },
      { x: rightX, y: bottom },
    ],
    { inDir: { x: 0, y: 1 }, outDir: { x: 0, y: 1 } },
  );

  return {
    d: moveTo(entry) + ` L ${n(leftX)} ${n(railTop)}` + intro.d + trunk.d + outro.d,
    exit: { x: rightX, y: bottom },
  };
}

/**
 * A small loop tied in the middle of a run — the one piece of showing off the
 * thread allows itself, and deliberately not on every card.
 *
 * Topology matters more than the numbers here. A loop spliced into a downward
 * stroke has to leave the way it came, and the only way out of an enclosed
 * loop is back across one of its own arcs: this one goes round, over the top,
 * then dives through the middle and out through the BOTTOM arc, so there is
 * exactly ONE crossing and the tail carries on downward. Trying to exit at the
 * top instead gives two crossings and reads as a scribble.
 *
 * `start` is the top of the loop, so the whole flourish hangs BELOW the point
 * it is given. That is what keeps it clear of the band boundary above it — the
 * pen's y is what tells the section which card it is working on, and a loop
 * that rose back past a boundary would flicker the highlight.
 *
 * `dir` mirrors it, so two loops in one section are never the same gesture.
 */
function penLoop(start: Point, r: number, dir: -1 | 1) {
  /* A TROCHOID, not a ring of hand-placed points.
     ----------------------------------------------------------------
     Two earlier versions were laid out by eye — first as a free-hand loop,
     then as an even-angled circle spliced onto the stem. Both measured 25-35
     degrees of tangent turn per 1.5px against about 6 for the rest of the
     site, and for the same reason: a loop that is STUCK ON to a straight run
     has a corner where it joins, and no amount of smoothing hides a corner,
     it only moves it.

     A trochoid has no join. It is one curve whose tangent is continuous
     everywhere by definition — the path of a point on a rolling wheel — and it
     produces a loop whenever the roll is slower than the wheel. Here:

         x = A*sin(t)              y = B*t - A*cos(t)          B < A

     Taking t over one full turn starting at t = pi/2 lands both ends on
     x = A with dx/dt = 0, i.e. the pen enters and leaves travelling straight
     DOWN, on the same vertical — so the flourish drops into the middle of a
     rail with nothing to splice.

     The tightest point of the loop is then a known quantity rather than
     something to discover with a screenshot: curvature peaks at A/(A-B)^2, so
     the smallest radius on the whole figure is (A-B)^2/A. With A = r and
     B = 0.35r that is 0.42r — which is what sets `r` below. Making the loop
     smaller does not make it gentler; it makes it sharper. */
  const B = 0.35 * r;
  const at = (t: number): Point => ({
    // -r shifts the curve so both ends sit on the stem rather than beside it.
    x: start.x + dir * (r * Math.sin(t) - r),
    y: start.y + B * t - r * Math.cos(t) - (B * Math.PI) / 2,
  });

  const STEPS = 26;
  const pts: Point[] = [];
  for (let k = 0; k <= STEPS; k++) pts.push(at(Math.PI / 2 + (2 * Math.PI * k) / STEPS));
  const end = pts[pts.length - 1];

  return {
    d: smoothThrough(pts, { inDir: { x: 0, y: 1 }, outDir: { x: 0, y: 1 } }).d,
    end,
  };
}

/** Vertical room a `penLoop` of radius r occupies, and how far it bulges. */
const LOOP_DROP = (r: number) => 2 * Math.PI * 0.35 * r;

/**
 * A long crossing that leaves vertical and arrives vertical.
 *
 * The fraction table is Experience's departure curve, which is the one shape
 * on this site already measured against the max-turn metric: the pen meets the
 * far rail already steep and only straightens as it runs out, instead of
 * cramming the whole turn into the last few pixels. Everything here that has
 * to get from one x to another — the way into the section, the step between
 * two cards, the way out — is this same curve at a different size, so there is
 * one shape to keep honest rather than three.
 */
function sweep(from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const at = (fx: number, fy: number) => ({ x: from.x + dx * fx, y: from.y + dy * fy });
  return smoothThrough(
    [from, at(0.07, 0.16), at(0.38, 0.4), at(0.72, 0.62), at(0.97, 0.8), to],
    { inDir: { x: 0, y: 1 }, outDir: { x: 0, y: 1 } },
  );
}

/* ------------------------------------------------------------------ */
/*  Project frames                                                     */
/*                                                                     */
/*  Projects' stretch. The approved motif for this section is "the      */
/*  thread outlines the card", so here the pen stops running in the     */
/*  margins and goes to work on the content itself.                     */
/*                                                                     */
/*  It runs down the GUTTER BETWEEN THE COLUMNS, and at every card it   */
/*  reaches out: over the top, down the outer edge, back along the      */
/*  bottom, and away down the gutter again. Three sides of every card   */
/*  are drawn by the thread itself; the fourth — the one facing the     */
/*  gutter — is the side the pen came in and left on, and the card's    */
/*  own ruled border closes it. Cards alternate sides, so the stem      */
/*  stays roughly straight while the brackets splay left and right.     */
/*                                                                     */
/*  WHY THE INNER EDGE IS THE OPEN ONE. Wrapping three sides of a       */
/*  rectangle always ends on the corner diagonally opposite the one it  */
/*  began at, so the choice of opening decides where the pen is left.   */
/*  Entering from the OUTER side leaves it on the outer side too, and   */
/*  since the next card is on the other half of the page, every step    */
/*  between cards became a full-width dash with a hairpin at each end   */
/*  — measured at 120 degrees of tangent turn per 1.5px, against about  */
/*  6 for the rest of the site. Entering from the INNER side leaves the */
/*  pen in the gutter, where the next card's opening is about thirty    */
/*  pixels away. The gesture is not smoothed into place; there is       */
/*  simply nothing left to smooth.                                      */
/*                                                                     */
/*  Which side a card is on is READ OFF ITS BOX, never told: CSS        */
/*  alternates the columns, and on a narrow screen the card goes full   */
/*  width, its centre lands on the section's centre, and the same test  */
/*  quietly settles on one behaviour for every row — one code path, no  */
/*  breakpoint in the geometry.                                        */
/*                                                                     */
/*  The exit is pinned: whatever the number of projects and whichever   */
/*  side the last one is on, the pen finishes in the LEFT gutter at the */
/*  bottom edge. Adding a sixth project cannot move the seam with the   */
/*  section below.                                                     */
/* ------------------------------------------------------------------ */

export type ProjectFramesArgs = {
  /** The section's box, in document coordinates. */
  rect: Rect;
  /** Where the previous segment left the pen, in document coordinates. */
  entry: Point;
  viewportWidth: number;
  /** The media frames the pen wraps, top to bottom, in document coordinates. */
  frames: Rect[];
};

export function projectFrames({
  rect,
  entry,
  viewportWidth,
  frames,
}: ProjectFramesArgs): { d: string; exit: Point } {
  const wide = viewportWidth >= 768;
  const leftX = gutterX(rect.x, viewportWidth);
  const bottom = rect.y + rect.height;

  // Before hydration has measured anything, fall back to a plain run so the
  // section is never left without its stretch of thread.
  if (!frames.length) {
    const run = runDown(entry, leftX, bottom, { steps: 6, amp: 6 });
    return { d: moveTo(entry) + run.d, exit: run.end };
  }

  /** How far outside the card the stroke sits. The card keeps a faint ruled
   *  border of its own — the guide the pen inks over — and this is the gap
   *  that stops the two reading as one thick line. */
  const pad = wide ? 14 : 8;
  /** Straight run into and out of a card, so the bracket starts and ends on a
   *  rail rather than in the middle of a curve. */
  const lead = wide ? 52 : 34;
  const tail = wide ? 46 : 30;
  /* The bracket's corners. Not a taste call: a 90-degree turn rounded at r
     spreads over roughly 1.2r of arc, so the max-turn-per-1.5px metric reads
     it directly — r=11 measured 11.1 degrees on a narrow screen, out of step
     with the rest of the site. r=15 brings it to about 8, in line with Stack's
     corners (7.9), and a softer corner is the more hand-drawn one anyway. */
  const radius = wide ? 20 : 15;
  const centre = rect.x + rect.width / 2;

  const geom = frames.map((f) => {
    // +1 = the card sits in the right column, -1 = the left one (or, on a
    // narrow screen where it spans the page, simply the left-hand reading).
    const side: -1 | 1 = f.x + f.width / 2 > centre + 24 ? 1 : -1;
    return {
      /** The edge facing the page edge — the far end of the bracket. */
      outerX: side === 1 ? f.x + f.width + pad : f.x - pad,
      /** The edge facing the gutter — the open side the pen enters through. */
      innerX: side === 1 ? f.x - pad : f.x + f.width + pad,
      topY: f.y - pad,
      botY: f.y + f.height + pad,
      approachY: f.y - pad - lead,
      exitY: f.y + f.height + pad + tail,
    };
  });

  let d = moveTo(entry);

  /* ---- the way in ---------------------------------------------------- */

  /* Experience hands the pen over on the right rail; the first card's opening
     is in the middle of the page. Run down the rail far enough that the
     crossing has vertical room to be a curve rather than a diagonal, then
     sweep. How far is derived from how far there is to go sideways — a fixed
     number would be wrong at the other breakpoint. */
  const g0 = geom[0];
  const want = Math.max(wide ? 200 : 110, Math.abs(entry.x - g0.innerX) * 0.85);
  const railEnd = Math.min(
    Math.max(entry.y + (wide ? 40 : 26), g0.approachY - want),
    g0.approachY - (wide ? 90 : 55),
  );
  let cursor = entry;
  /* Only if there is real room for it. `runDown` spends a full sine period per
     step, so squeezing four of them into the forty-odd pixels this section has
     to spare above its headline turned a rail into a zigzag — 14.8 degrees of
     tangent turn per 1.5px, in the one place the seam with Experience is
     supposed to be invisible. Below the threshold the sweep simply starts at
     the seam, which it can: it already leaves vertically. */
  const railRun = railEnd - entry.y;
  if (railRun >= 110) {
    const run = runDown(entry, entry.x, railEnd, {
      steps: Math.max(2, Math.round(railRun / 110)),
      amp: wide ? 5 : 3,
    });
    d += run.d;
    cursor = run.end;
  }
  d += sweep(cursor, { x: g0.innerX, y: g0.approachY }).d;

  /* ---- one bracket per project, one step between them ---------------- */

  for (let i = 0; i < geom.length; i++) {
    const g = geom[i];

    // in along the gutter, over the top, down the outer edge, back along the
    // bottom, and away down the gutter. The corners the pen turns are the
    // card's own corners, which is the whole point of the section.
    const bracket: Point[] = [
      { x: g.innerX, y: g.approachY },
      { x: g.innerX, y: g.topY },
      { x: g.outerX, y: g.topY },
      { x: g.outerX, y: g.botY },
      { x: g.innerX, y: g.botY },
      { x: g.innerX, y: g.exitY },
    ];

    // The same deterministic quiver the rest of the site has, kept small: this
    // stroke runs a few pixels off a straight ruled border, and any more would
    // read as a wobble rather than as a hand.
    const dense: Point[] = [bracket[0]];
    for (let k = 1; k < bracket.length; k++) {
      dense.push(
        ...waver(bracket[k - 1], bracket[k], {
          step: wide ? 210 : 160,
          amp: wide ? 1.7 : 1.1,
          seed: i * 7 + k * 3,
        }),
      );
      dense.push(bracket[k]);
    }
    d += roundedRun(dense, radius);

    const from: Point = { x: g.innerX, y: g.exitY };
    const next = geom[i + 1];
    /* The way out is pinned to the LEFT gutter at the bottom edge whatever
       side the last card sat on — Experience handed the pen over on the right,
       and the thread does not use the same rail twice running. */
    const target = next
      ? { x: next.innerX, y: next.approachY }
      : { x: leftX, y: bottom };

    /* Every other step, and only where the gap is genuinely long enough for
       one, the pen ties a loop before carrying on. Every step would be a
       mannerism; never would be the plain rail this section already had. The
       mirror alternates so two loops are never the same gesture, and the final
       run out of the section never gets one — it has a whole page to cross and
       needs its vertical budget for that. */
    const loopR = 24;
    /* Mirrored so two loops in one section are never the same gesture — unless
       the mirror would swing it off the page, which is what happens on a
       narrow screen where the rail already runs a thumb's width from the edge.
       Then it takes whichever side has room, and if neither does, no loop. */
    const bulge = (d1: -1 | 1) => from.x - d1 * 2 * loopR;
    const fits = (d1: -1 | 1) =>
      bulge(d1) > rect.x + 14 && bulge(d1) < rect.x + rect.width - 14;
    const wanted: -1 | 1 = i % 4 === 1 ? 1 : -1;
    const spin: -1 | 1 | 0 = fits(wanted)
      ? wanted
      : fits(-wanted as -1 | 1)
        ? (-wanted as -1 | 1)
        : 0;

    if (next && i % 2 === 1 && spin && target.y - from.y > LOOP_DROP(loopR) + 44) {
      const loop = penLoop(from, loopR, spin);
      d += loop.d;
      d += sweep(loop.end, target).d;
    } else {
      d += sweep(from, target).d;
    }
  }

  return { d, exit: { x: leftX, y: bottom } };
}

/* ------------------------------------------------------------------ */
/*  Scroll rail                                                        */
/*                                                                     */
/*  Education's stretch, and the first place on this site where the     */
/*  thread stops DRAWING something and starts DOING something.          */
/*                                                                     */
/*  The section is a wall of hanging scrolls: each credential is a      */
/*  sheet rolled up under a rod, and it unrolls downward exactly as far */
/*  as the pen has travelled past that rod. The roll and the pen        */
/*  descend at the same height, on the same line — so the line reads as */
/*  the hand pulling the paper open rather than as decoration beside    */
/*  it. Nothing about that is a tuned trigger: the section is handed    */
/*  the pen's position every frame (`onPen`) and the marks below say    */
/*  which stretch of it belongs to which scroll.                        */
/*                                                                     */
/*  The pen therefore does something very plain here — one straight     */
/*  descent down a rail — and that is the point after Projects. The     */
/*  only flourish is the KNOT it ties above each rod: `penLoop`, the    */
/*  trochoid from Projects, which enters and leaves vertically and so   */
/*  drops into a rail with nothing to splice. It sits entirely ABOVE    */
/*  the rod, which is not decoration either: inside a loop the pen's y  */
/*  wanders back up, and if any of that wander fell inside a scroll's   */
/*  own stretch the paper would visibly breathe while the knot was      */
/*  being tied.                                                         */
/*                                                                     */
/*  `railX` is measured from the layout and never computed here, for    */
/*  the same reason Experience takes its spine from the markers' own    */
/*  centres: CSS decides where the rail runs — down the middle on a     */
/*  wide screen, along the left margin on a narrow one — and the        */
/*  geometry follows without knowing a breakpoint. Which side a scroll  */
/*  hangs on is read off its box against that rail, never told.         */
/* ------------------------------------------------------------------ */

export type ScrollRailArgs = {
  /** The section's box, in document coordinates. */
  rect: Rect;
  /** Where the previous segment left the pen, in document coordinates. */
  entry: Point;
  viewportWidth: number;
  /** Where the rail runs, measured from the layout. */
  railX: number;
  /** The papers, top to bottom, in document coordinates. */
  sheets: Rect[];
  /** The header block, so the crossing onto the rail can clear the copy. */
  header?: Rect;
};

/** The stretch of pen travel that belongs to one scroll. */
export type ScrollMark = {
  /** Where its knot starts — the moment its rod is hung. */
  tie: number;
  /** Pen y at which it is still rolled up. */
  from: number;
  /** Pen y at which it is fully unrolled. */
  to: number;
};

export function scrollRail({
  rect,
  entry,
  viewportWidth,
  railX,
  sheets,
  header,
}: ScrollRailArgs): { d: string; exit: Point; marks: ScrollMark[] } {
  const wide = viewportWidth >= 768;
  const leftX = gutterX(rect.x, viewportWidth);
  const rightX = gutterRightX(rect, viewportWidth);
  const bottom = rect.y + rect.height;
  /* Pinned: Projects hands the pen over on the LEFT rail, and the thread does
     not use the same rail twice running. However many certificates the wall
     grows, the seam below cannot move. */
  const exit: Point = { x: rightX, y: bottom };

  // Before hydration has measured anything, fall back to a plain run so the
  // section is never left without its stretch of thread.
  if (!sheets.length) {
    const run = runDown(entry, leftX, bottom - (wide ? 200 : 130), { steps: 5, amp: 6 });
    return { d: moveTo(entry) + run.d + sweep(run.end, exit).d, exit, marks: [] };
  }

  /* The knot's size is a MEASURED parameter, not a taste call. A trochoid's
     tightest radius is (1 - 0.35)^2 * r = 0.42r, so the max-turn-per-1.5px
     metric reads it straight off: r = 15 measured 16 degrees on a narrow
     screen, out of step with the rest of the site. These give about 7 and 10,
     in line with Projects' loops (9.9 / 10.2). Shrinking a loop does not make
     it gentler — it makes it sharper. */
  const r = wide ? 30 : 24;
  const drop = LOOP_DROP(r);
  const ties = sheets.map((s) => s.y - drop);

  let d = moveTo(entry);
  let cursor = entry;

  /* A stretch of the left margin before the pen swings onto the rail.
     WHERE it stops is not a number: the crossing is most of the section's
     width, and starting it any higher than the copy ends draws a diagonal
     straight through the lead paragraph. So it starts below the header and
     is only given the room that is left — which is also why the layout keeps
     a deep gap above the first scroll. */
  const clearHeader = header ? header.y + header.height + (wide ? 34 : 20) : entry.y;
  const railEnd = Math.min(
    Math.max(entry.y + (wide ? 120 : 60), clearHeader),
    ties[0] - (wide ? 150 : 90),
  );
  const railRun = railEnd - entry.y;
  if (railRun >= 120) {
    const run = runDown(entry, leftX, railEnd, {
      steps: Math.max(2, Math.round(railRun / 150)),
      amp: wide ? 5 : 3,
    });
    d += run.d;
    cursor = run.end;
  }
  d += sweep(cursor, { x: railX, y: ties[0] }).d;
  cursor = { x: railX, y: ties[0] };

  const marks: ScrollMark[] = [];

  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    // Read off the box: +1 hangs right of the rail, -1 left of it.
    const side: -1 | 1 = sheet.x + sheet.width / 2 >= railX ? 1 : -1;
    // The knot leans towards the scroll it holds. `penLoop` bulges opposite
    // its `dir`, hence the negation.
    const loop = penLoop(cursor, r, (-side) as -1 | 1);
    d += loop.d;
    cursor = loop.end;

    const sheetBottom = sheet.y + sheet.height;
    const nextTie = i + 1 < sheets.length ? ties[i + 1] : null;
    const endY = Math.max(
      sheetBottom + (wide ? 16 : 12),
      nextTie ?? Math.min(sheetBottom + (wide ? 170 : 110), bottom - (wide ? 250 : 150)),
    );
    const run = runDown(cursor, railX, endY, {
      steps: Math.max(3, Math.round((endY - cursor.y) / 150)),
      amp: wide ? 2.6 : 1.8,
      seed: i * 4 + 1,
    });
    d += run.d;
    cursor = run.end;

    marks.push({ tie: ties[i], from: sheet.y, to: sheetBottom });
  }

  d += sweep(cursor, exit).d;

  return { d, exit, marks };
}

/* ------------------------------------------------------------------ */
/*  Flight route                                                       */
/*                                                                     */
/*  Featured Collaboration's stretch. The case study is a flight        */
/*  academy, so the thread stops being a margin rail here and becomes   */
/*  the ROUTE on a chart: the pen arrives on the right rail, makes one  */
/*  long crossing over the page, and then flies the legs — a straight   */
/*  run between fixes with a small course change at each one, the way   */
/*  a route is actually drawn, rather than the smooth snake of Stack or */
/*  the bracket of Projects.                                            */
/*                                                                     */
/*  The fixes are NOT computed here. They are the marker boxes the      */
/*  layout produced beside Brief / Build / Result, exactly as           */
/*  Experience takes its spine from the markers' own centres: CSS       */
/*  decides where each waypoint sits — and it deliberately offsets them */
/*  from one another by a few pixels — so the dog-leg at every fix is a */
/*  fact about the layout rather than a number typed in here. Threading */
/*  the centres is also what guarantees the route goes THROUGH each     */
/*  waypoint symbol instead of past it.                                 */
/*                                                                     */
/*  The last leg does not simply run out: it drops below the call to    */
/*  action and UNDERLINES it before turning away — the route reaching   */
/*  its destination — and only then sweeps to the left rail at the      */
/*  bottom edge. The exit is pinned there whatever the copy does:       */
/*  Education handed the pen over on the right, and the thread does not */
/*  use the same rail twice running.                                    */
/* ------------------------------------------------------------------ */

export type FlightRouteArgs = {
  /** The section's box, in document coordinates. */
  rect: Rect;
  /** Where the previous segment left the pen, in document coordinates. */
  entry: Point;
  viewportWidth: number;
  /** The waypoint markers, top to bottom, in document coordinates. */
  fixes: Rect[];
  /** The header block, so the crossing starts below the copy. */
  header?: Rect;
  /** The link the route underlines on its way out. */
  cta?: Rect;
  /**
   * Boxes the route may not cross on its way down to the call to action.
   *
   * On a wide screen the browser window is in the other column and this is
   * empty of consequence; on a narrow one the layout stacks, the window ends
   * up directly under the waypoints, and the descent would run straight
   * behind it. Handing the box over rather than adding a breakpoint keeps the
   * rule where it belongs: the route goes round what is in its way, and the
   * layout decides what that is.
   */
  obstacles?: Rect[];
};

export function flightRoute({
  rect,
  entry,
  viewportWidth,
  fixes,
  header,
  cta,
  obstacles = [],
}: FlightRouteArgs): { d: string; exit: Point } {
  const wide = viewportWidth >= 768;
  const leftX = gutterX(rect.x, viewportWidth);
  const rightX = gutterRightX(rect, viewportWidth);
  const bottom = rect.y + rect.height;
  /* Pinned, and pinned to the MIDDLE. Every other section hands the pen to a
     rail; this one hands it to the centre of the page, because what comes
     next is the closing signature — and a signature that starts off in a
     margin has to walk to the middle before it can begin. The finale is the
     reason for the exit, not the other way round. */
  const exit: Point = { x: rect.x + rect.width / 2, y: bottom };

  // Before hydration has measured anything, fall back to a plain run so the
  // section is never left without its stretch of thread.
  if (!fixes.length) {
    const run = runDown(entry, rightX, bottom - (wide ? 220 : 140), { steps: 5, amp: 6 });
    return { d: moveTo(entry) + run.d + sweep(run.end, exit).d, exit };
  }

  const centres = fixes.map((f) => ({ x: f.x + f.width / 2, y: f.y + f.height / 2 }));
  const first = centres[0];
  const last = centres[centres.length - 1];

  /* ---- 1. the approach --------------------------------------------- */

  /* A stretch of the right rail before the crossing, for the same reason
     Education keeps one before its own: the crossing is most of the page
     wide, and starting it any higher than the copy ends drags a diagonal
     straight through the lead paragraph. How much rail there is depends on
     how far there is to fall, so it is derived rather than typed. */
  const clearHeader = header ? header.y + header.height + (wide ? 40 : 24) : entry.y;

  /* Anything standing between the header and the first fix is crossed ABOVE,
     never behind. On a wide screen the window is in the other column and this
     never fires; stacked on a narrow one it sits exactly there, and the pen
     would otherwise vanish behind it for half a screen. The section hands over
     a BOX, so there is still no breakpoint in the shape. */
  const inWay = obstacles.find(
    (o) =>
      o.y + o.height > clearHeader &&
      o.y < first.y &&
      o.x < first.x + 40 &&
      o.x + o.width > first.x - 40,
  );
  const landY = inWay
    ? Math.min(inWay.y - (wide ? 30 : 22), first.y - (wide ? 150 : 110))
    : first.y;

  /* The rail stops far enough above the landing for the crossing to BE a
     curve. Both of its ends are pinned vertical, so a crossing given the
     whole width of the page and forty pixels of drop has to make an S sharp
     enough to read as a kink — measured at 16.8 degrees per 1.5px on a narrow
     screen before this clamp, against about 6 for the rest of the site. */
  const railEnd = Math.min(
    Math.max(entry.y + (wide ? 90 : 50), clearHeader),
    landY - (wide ? 160 : 120),
  );

  let d = moveTo(entry);
  let cursor = entry;
  const railRun = railEnd - entry.y;
  /* `runDown` spends a full sine period per step, so a rail with no room for
     one turns into a zigzag exactly where the seam above is supposed to be
     invisible. Below the threshold the crossing simply starts at the seam,
     which it can: it already leaves vertically. */
  if (railRun >= 110) {
    const run = runDown(entry, rightX, railEnd, {
      steps: Math.max(2, Math.round(railRun / 150)),
      amp: wide ? 5 : 3,
    });
    d += run.d;
    cursor = run.end;
  }
  const corners: Point[] = [];
  if (inWay) {
    d += sweep(cursor, { x: first.x, y: landY }).d;
    const run = runDown({ x: first.x, y: landY }, first.x, first.y - 46, {
      steps: Math.max(2, Math.round((first.y - 46 - landY) / 170)),
      amp: wide ? 4 : 2.4,
    });
    d += run.d;
    corners.push(run.end);
  } else {
    d += sweep(cursor, first).d;
  }

  /* ---- 2. the legs, and the destination ---------------------------- */

  corners.push(...centres);

  if (cta) {
    // Below the button, along it, and away: the route arrives somewhere.
    const underY = cta.y + cta.height + (wide ? 13 : 10);
    const turnX = Math.min(
      cta.x + cta.width + (wide ? 26 : 15),
      rect.x + rect.width - (wide ? 40 : 20),
    );
    /* Anything standing in the descent gets a course change round it, out to
       the left rail. The button itself is always one of those things: the
       last fix sits a little RIGHT of where the copy starts, so a straight
       drop would run down through the link's own text before underlining it.
       The descent is therefore pushed clear of the button's left edge. */
    const blocked = obstacles.some(
      (o) =>
        o.x - 18 < last.x &&
        o.x + o.width + 18 > last.x &&
        o.y + o.height > last.y &&
        o.y < underY,
    );
    const clearX = Math.max(leftX, Math.min(last.x, cta.x - (wide ? 22 : 14)));
    const descX = blocked ? leftX : clearX;
    if (Math.abs(descX - last.x) > 6) {
      corners.push({ x: descX, y: last.y + (wide ? 104 : 66) });
    }
    corners.push({ x: descX, y: underY });
    if (turnX > last.x + 40) {
      corners.push({ x: turnX, y: underY });
      corners.push({ x: turnX, y: underY + (wide ? 56 : 40) });
    }
  } else {
    corners.push({
      x: last.x,
      y: Math.min(last.y + (wide ? 200 : 130), bottom - (wide ? 240 : 150)),
    });
  }

  // Straights get the same deterministic quiver as everywhere else, and the
  // whole polyline is rounded in one pass: the course changes become turns,
  // the quiver becomes a soft wave, out of one mechanism.
  const dense: Point[] = [corners[0]];
  for (let i = 1; i < corners.length; i++) {
    dense.push(
      ...waver(corners[i - 1], corners[i], {
        step: wide ? 200 : 160,
        amp: wide ? 2.2 : 1.5,
        seed: i * 9,
      }),
    );
    dense.push(corners[i]);
  }
  d += roundedRun(dense, wide ? 26 : 16);

  /* ---- 3. the way out ---------------------------------------------- */

  d += sweep(corners[corners.length - 1], exit).d;

  return { d, exit };
}
/* ------------------------------------------------------------------ */
/*  The taut run — the last thing the pen does on this site             */
/*                                                                     */
/*  Every other section hands the pen on. This one has nobody to hand   */
/*  it to, so the line stops going anywhere and simply hangs: it comes  */
/*  down dead centre (Featured Collaboration gives the pen back in the  */
/*  MIDDLE of the seam rather than on a rail, on purpose), curls once   */
/*  through the sheet, and then runs STRAIGHT DOWN.                     */
/*                                                                     */
/*  That straight run is the only stroke on the whole site with no      */
/*  hand-tremor in it, and the absence is the point: everywhere else    */
/*  the line wanders because a hand drew it, here it is pulled tight.   */
/*  You read the tension before anything tells you about it — which is  */
/*  what has to be true a moment later, when it lets go and falls.      */
/*                                                                     */
/*  The curl is the same trochoid as the loops in Projects and the      */
/*  knots in Education, for the same reason: it enters and leaves on    */
/*  one vertical, travelling down, so there is nothing to splice at     */
/*  either end of it. It falls WITH the rope rather than staying on the */
/*  page, and it is what makes the heap at the bottom read as a length  */
/*  of thread rather than as a scribble.                                */
/* ------------------------------------------------------------------ */

export type TautThreadArgs = {
  /** The stage's box, in document coordinates. */
  rect: Rect;
  /** Where the previous segment left the pen — the centre of the seam. */
  entry: Point;
  viewportWidth: number;
};

/** How deep the sheet above sags on the thread before it gives. The curl sits
 *  at the bottom of that sag, so the paper stretches down to meet it. */
export const SEAM_SAG = (viewportWidth: number) => (viewportWidth >= 768 ? 84 : 48);

export function tautThread({ rect, entry, viewportWidth }: TautThreadArgs): {
  d: string;
  exit: Point;
} {
  const wide = viewportWidth >= 768;
  const sag = SEAM_SAG(viewportWidth);
  // Mirrored on narrow screens so the curl never bulges towards the same side
  // as Education's last knot two sections up.
  const r = wide ? 30 : 24;

  const top = { x: entry.x, y: entry.y + sag };
  let d = moveTo(entry) + ` L ${n(top.x)} ${n(top.y)}`;

  const loop = penLoop(top, r, wide ? 1 : -1);
  d += loop.d;

  /* Dead straight. No `runDown`, no waver: a line under tension has no slack
     to wander in, and this is the one place on the site where that is the
     whole idea. */
  const foot = { x: entry.x, y: rect.y + rect.height };
  d += ` L ${n(foot.x)} ${n(foot.y)}`;

  return { d, exit: foot };
}
