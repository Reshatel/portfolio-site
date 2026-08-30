

export const ROPE = {
  gravity: 2300,
  drag: 0.993,
  floorFriction: 0.42,
  thickness: 11,
  iterations: 6,
  lean: 1,
};

export type RopePoint = { x: number; y: number };

export type RopeBounds = {
  /** Where the floor is, in the rope's own coordinates. */
  floorY: number;
  leftX: number;
  rightX: number;
};

export type RopeOptions = {
  bounds: RopeBounds;
  /** px/s². Tuned so the drop reads as a drop and not as a feather. */
  gravity?: number;
  /** How much of a point's velocity survives a step. */
  drag?: number;
  /** How much horizontal speed the floor takes off a point that is on it. */
  floorFriction?: number;
  /** How far apart two non-adjacent points are kept: the rope's thickness. */
  thickness?: number;
  /** Constraint passes per step. */
  iterations?: number;
};

const FIXED_STEP = 1 / 60;
const MAX_SUBSTEPS = 3;

export class Rope {
  readonly n: number;
  private readonly x: Float64Array;
  private readonly y: Float64Array;
  private readonly px: Float64Array;
  private readonly py: Float64Array;
  /** Rest length per link, taken from the seed shape rather than assumed
   *  uniform: the curl at the top is densely sampled and has to stay that way. */
  private readonly rest: Float64Array;

  private readonly o: Required<Omit<RopeOptions, "bounds">> & { bounds: RopeBounds };

  private held = -1;
  private heldX = 0;
  private heldY = 0;

  private accum = 0;
  private quiet = 0;

  /** The lowest point the rope has reached. Monotone, so the copy it uncovers
   *  on the way down cannot flicker. */
  maxY = -Infinity;
  /** True once any part of the rope has touched the floor. */
  landed = false;

  constructor(seed: RopePoint[], options: RopeOptions) {
    this.n = seed.length;
    this.x = new Float64Array(this.n);
    this.y = new Float64Array(this.n);
    this.px = new Float64Array(this.n);
    this.py = new Float64Array(this.n);
    this.rest = new Float64Array(Math.max(0, this.n - 1));

    this.o = {
      gravity: ROPE.gravity,
      drag: ROPE.drag,
      /* High on purpose. A rope that keeps sliding along the floor spreads
         out into a line again, and a line lying flat is exactly the outcome
         the self-repulsion is there to prevent. */
      floorFriction: ROPE.floorFriction,
      thickness: ROPE.thickness,
      iterations: ROPE.iterations,
      ...options,
    };

    for (let i = 0; i < this.n; i++) {
      this.x[i] = seed[i].x;
      this.y[i] = seed[i].y;
      /* A deterministic lean, written as a starting VELOCITY (the gap between
         a point and its previous position) rather than as a displacement, so
         the rope's shape on frame zero is still exactly the drawn line. */
      const t = i / Math.max(1, this.n - 1);
      const lean =
        (Math.sin(t * 5.7 + 0.4) * 0.55 + Math.sin(t * 13.1) * 0.22) * ROPE.lean;
      this.px[i] = seed[i].x - lean;
      this.py[i] = seed[i].y;
      if (i > 0) {
        this.rest[i - 1] = Math.hypot(seed[i].x - seed[i - 1].x, seed[i].y - seed[i - 1].y);
      }
      if (seed[i].y > this.maxY) this.maxY = seed[i].y;
    }
  }

  /** The rope's points as plain objects — the state a reel-in starts from. */
  snapshot(): RopePoint[] {
    const out: RopePoint[] = [];
    for (let i = 0; i < this.n; i++) out.push({ x: this.x[i], y: this.y[i] });
    return out;
  }

  setPoints(pts: RopePoint[]) {
    for (let i = 0; i < this.n; i++) {
      const p = pts[Math.min(pts.length - 1, i)];
      this.x[i] = p.x;
      this.y[i] = p.y;
      this.px[i] = p.x;
      this.py[i] = p.y;
    }
    this.landed = false;
    this.maxY = -Infinity;
    for (let i = 0; i < this.n; i++) if (this.y[i] > this.maxY) this.maxY = this.y[i];
  }

  /** Wake the simulation — a settled rope stops stepping until something
   *  happens to it. */
  wake() {
    this.quiet = 0;
  }

  get asleep() {
    return this.quiet > 45 && this.held < 0;
  }

  /** The index nearest a point, and how far away it is. */
  nearest(x: number, y: number) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.n; i++) {
      const d = (this.x[i] - x) ** 2 + (this.y[i] - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return { index: best, distance: Math.sqrt(bestD) };
  }

  grab(index: number, x: number, y: number) {
    this.held = index;
    this.heldX = x;
    this.heldY = y;
    this.wake();
  }

  dragTo(x: number, y: number) {
    this.heldX = x;
    this.heldY = y;
    this.wake();
  }

  release() {
    this.held = -1;
    this.wake();
  }

  get holding() {
    return this.held >= 0;
  }

  /** A weak pull towards a point, for the parts of the rope near the cursor.
   *  It is what tells the reader the heap is a thing they can pick up, with
   *  no label saying so. */
  nudge(x: number, y: number, radius: number, strength: number) {
    let touched = false;
    for (let i = 0; i < this.n; i++) {
      const dx = x - this.x[i];
      const dy = y - this.y[i];
      const d = Math.hypot(dx, dy);
      if (d > radius || d < 1e-4) continue;
      const f = (1 - d / radius) * strength;
      this.x[i] += dx * f;
      this.y[i] += dy * f;
      touched = true;
    }
    if (touched) this.wake();
    return touched;
  }

  /**
   * Advance by real elapsed time, in FIXED steps.
   *
   * A variable integration step is the other half of every twitchy rope: a
   * frame that ran long makes every constraint overshoot, and a chain turns
   * that into a whip. Same fix as Education's rig — always 1/60, at most three
   * of them per frame, the rest thrown away.
   */
  step(dt: number) {
    if (this.asleep) return false;
    this.accum = Math.min(this.accum + dt, FIXED_STEP * MAX_SUBSTEPS);
    let stepped = false;
    while (this.accum >= FIXED_STEP) {
      this.accum -= FIXED_STEP;
      this.integrate(FIXED_STEP);
      stepped = true;
    }
    if (stepped) this.measure();
    return stepped;
  }

  private integrate(h: number) {
    const { gravity, drag, iterations } = this.o;
    const g = gravity * h * h;

    for (let i = 0; i < this.n; i++) {
      if (i === this.held) continue;
      const vx = (this.x[i] - this.px[i]) * drag;
      const vy = (this.y[i] - this.py[i]) * drag;
      this.px[i] = this.x[i];
      this.py[i] = this.y[i];
      this.x[i] += vx;
      this.y[i] += vy + g;
    }

    if (this.held >= 0) {
      const i = this.held;
      /* The previous position is left where the point actually was, so a point
         being dragged carries real momentum into the rope — let go mid-swing
         and it keeps going. */
      this.px[i] = this.x[i];
      this.py[i] = this.y[i];
      this.x[i] = this.heldX;
      this.y[i] = this.heldY;
    }

    for (let k = 0; k < iterations; k++) {
      this.links();
      this.walls();
    }
    // Two passes: one is enough to keep points apart, but not enough to build
    // a pile, because the rope arrives faster than a single pass can stack it.
    this.repel();
    this.repel();
    this.walls();
  }

  /** Length is a fact, not a spring: both ends of a link move half the error. */
  private links() {
    for (let i = 0; i < this.n - 1; i++) {
      const dx = this.x[i + 1] - this.x[i];
      const dy = this.y[i + 1] - this.y[i];
      const d = Math.hypot(dx, dy);
      if (d < 1e-6) continue;
      const diff = (d - this.rest[i]) / d;
      const share = this.held === i ? 0 : this.held === i + 1 ? 1 : 0.5;
      this.x[i] += dx * diff * share;
      this.y[i] += dy * diff * share;
      this.x[i + 1] -= dx * diff * (1 - share);
      this.y[i + 1] -= dy * diff * (1 - share);
    }
  }

  private walls() {
    const { floorY, leftX, rightX } = this.o.bounds;
    const f = this.o.floorFriction;
    for (let i = 0; i < this.n; i++) {
      if (i === this.held) continue;
      if (this.y[i] > floorY) {
        this.y[i] = floorY;
        // Take horizontal speed off a point dragging along the floor, or the
        // heap slides instead of settling.
        this.x[i] -= (this.x[i] - this.px[i]) * f;
      }
      if (this.x[i] < leftX) this.x[i] = leftX;
      else if (this.x[i] > rightX) this.x[i] = rightX;
    }
  }

  /**
   * The rope's thickness.
   *
   * Bucketed on a uniform grid the size of the thickness, so this is linear in
   * the number of points instead of quadratic. Neighbours within two links are
   * skipped: they are already held at their rest length, and pushing them
   * apart as well is how a rope starts vibrating along its own length.
   */
  private repel() {
    const r = this.o.thickness;
    if (r <= 0) return;
    const cell = r;
    const grid = new Map<number, number[]>();
    const key = (cx: number, cy: number) => cx * 73856093 + cy * 19349663;

    for (let i = 0; i < this.n; i++) {
      const k = key(Math.floor(this.x[i] / cell), Math.floor(this.y[i] / cell));
      const bucket = grid.get(k);
      if (bucket) bucket.push(i);
      else grid.set(k, [i]);
    }

    for (let i = 0; i < this.n; i++) {
      const cx = Math.floor(this.x[i] / cell);
      const cy = Math.floor(this.y[i] / cell);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = grid.get(key(cx + ox, cy + oy));
          if (!bucket) continue;
          for (const j of bucket) {
            if (j <= i + 2) continue;
            let dx = this.x[j] - this.x[i];
            let dy = this.y[j] - this.y[i];
            const d2 = dx * dx + dy * dy;
            if (d2 >= r * r) continue;
            let d = Math.sqrt(d2);
            if (d < 1e-4) {
              // Exactly coincident points have no direction to separate along;
              // a deterministic one keeps the heap identical across reloads.
              dx = (i % 2 ? 1 : -1) * 0.01;
              dy = 0.01;
              d = 0.0141;
            }
            const moveI = this.held !== i;
            const moveJ = this.held !== j;
            if (!moveI && !moveJ) continue;
            const push = ((r - d) / d) * (moveI && moveJ ? 0.5 : 1);
            if (moveI) {
              this.x[i] -= dx * push;
              this.y[i] -= dy * push;
            }
            if (moveJ) {
              this.x[j] += dx * push;
              this.y[j] += dy * push;
            }
          }
        }
      }
    }
  }

  private measure() {
    const { floorY } = this.o.bounds;
    let low = -Infinity;
    let energy = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.y[i] > low) low = this.y[i];
      energy += (this.x[i] - this.px[i]) ** 2 + (this.y[i] - this.py[i]) ** 2;
    }
    if (low > this.maxY) this.maxY = low;
    if (!this.landed && low >= floorY - 0.5) this.landed = true;
    if (energy / this.n < 0.0016 && this.held < 0) this.quiet++;
    else this.quiet = 0;
  }

  /**
   * The rope as one stroke.
   *
   * Through the points themselves rather than between them: a polyline of
   * sixty links reads as bent wire, and quadratics anchored at the midpoints
   * pass through every point while keeping the tangent continuous. Same
   * treatment as the cords in Education, and the same reason.
   */
  path() {
    if (this.n < 2) return "";
    let d = "M " + this.x[0].toFixed(1) + " " + this.y[0].toFixed(1);
    for (let i = 1; i < this.n - 1; i++) {
      const mx = (this.x[i] + this.x[i + 1]) / 2;
      const my = (this.y[i] + this.y[i + 1]) / 2;
      d +=
        " Q " +
        this.x[i].toFixed(1) +
        " " +
        this.y[i].toFixed(1) +
        " " +
        mx.toFixed(1) +
        " " +
        my.toFixed(1);
    }
    d += " L " + this.x[this.n - 1].toFixed(1) + " " + this.y[this.n - 1].toFixed(1);
    return d;
  }
}

/**
 * Sample an SVG path into rope points about `spacing` apart.
 *
 * `upTo` is how much of the path has actually been drawn: what falls is what
 * is on the screen, never the part of the stroke the pen has not reached.
 */
export function sampleRope(path: SVGPathElement, spacing = 11, upTo?: number): RopePoint[] {
  const total = Math.min(upTo ?? Infinity, path.getTotalLength());
  const count = Math.max(8, Math.min(140, Math.round(total / spacing)));
  return sampleCount(path, count + 1, total);
}

/** The same stroke as exactly `count` points — the shape a reel-in aims at. */
export function sampleCount(path: SVGPathElement, count: number, upTo?: number): RopePoint[] {
  const total = Math.max(0, Math.min(upTo ?? Infinity, path.getTotalLength()));
  const pts: RopePoint[] = [];
  for (let i = 0; i < count; i++) {
    const p = path.getPointAtLength(count > 1 ? (total * i) / (count - 1) : 0);
    pts.push({ x: p.x, y: p.y });
  }
  return pts;
}
