"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import Matter from "matter-js";

const { Engine, Bodies, Body, Composite, Mouse, MouseConstraint } = Matter;

/* ------------------------------------------------------------------ */
/*  Types & palette                                                    */
/* ------------------------------------------------------------------ */

type Kind = "circle" | "square" | "capsule" | "triangle" | "hexagon" | "diamond";

type Fig = {
  kind: Kind;
  filled: boolean;
  tone: number; // palette index
  r: number; // base radius, in px
  col: number;
  row: number;
  jx: number; // grid jitter, -1..1 of half a cell
  jy: number;
  angle0: number;
  // ambient float parameters
  ax: number;
  ay: number;
  sx: number;
  sy: number;
  px: number;
  py: number;
  spin: number;
};

const PALETTE = [
  { stroke: "#C1652F", fill: "rgba(193, 101, 47, 0.14)" }, // accent
  { stroke: "#E8836A", fill: "rgba(232, 131, 106, 0.16)" }, // accent light
  { stroke: "#355E56", fill: "rgba(53, 94, 86, 0.12)" }, // illustration teal
];

const COLS = 5;
const ROWS = 6;
const WALL = 600; // wall thickness / length padding
const FLOOR_INSET = 5;

/* ------------------------------------------------------------------ */
/*  Geometry helpers — one source of truth for SVG *and* physics       */
/* ------------------------------------------------------------------ */

function polyVerts(sides: number, radius: number, rot: number) {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i * Math.PI * 2) / sides;
    out.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius });
  }
  return out;
}

function squareSide(f: Fig) {
  return f.r * 1.62;
}
function capsuleSize(f: Fig) {
  return { w: f.r * 2.3, h: f.r * 0.92 };
}

/** Half-size of the DOM wrapper: must cover the shape at any rotation. */
function boundRadius(f: Fig) {
  switch (f.kind) {
    case "square": {
      const s = squareSide(f);
      return (s * Math.SQRT2) / 2 + 4;
    }
    case "capsule": {
      const { w, h } = capsuleSize(f);
      return Math.hypot(w, h) / 2 + 4;
    }
    default:
      return f.r + 4;
  }
}

function createBody(f: Fig, x: number, y: number) {
  const opts: Matter.IBodyDefinition = {
    restitution: 0.3,
    friction: 0.22,
    frictionAir: 0.055,
    density: 0.0013,
    angle: f.angle0,
  };

  switch (f.kind) {
    case "circle":
      return Bodies.circle(x, y, f.r, opts);
    case "square": {
      const s = squareSide(f);
      return Bodies.rectangle(x, y, s, s, { ...opts, chamfer: { radius: 5 } });
    }
    case "capsule": {
      const { w, h } = capsuleSize(f);
      return Bodies.rectangle(x, y, w, h, {
        ...opts,
        chamfer: { radius: h / 2 - 2 },
      });
    }
    case "triangle":
      return Bodies.fromVertices(x, y, [polyVerts(3, f.r, -Math.PI / 2)], opts);
    case "hexagon":
      return Bodies.fromVertices(x, y, [polyVerts(6, f.r, -Math.PI / 2)], opts);
    case "diamond":
      return Bodies.fromVertices(x, y, [polyVerts(4, f.r, -Math.PI / 2)], opts);
  }
}

/* ------------------------------------------------------------------ */
/*  Layout — 5x6 grid, every column carries at least one figure        */
/* ------------------------------------------------------------------ */

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function makeFig(kind: Kind, col: number, row: number, small: boolean): Fig {
  const base = small ? 20 : 28;
  const span = small ? 12 : 44;
  return {
    kind,
    filled: Math.random() < 0.45,
    tone: Math.floor(Math.random() * PALETTE.length),
    r: base + Math.random() * span,
    col,
    row,
    jx: rand(-0.5, 0.5),
    jy: rand(-0.45, 0.45),
    angle0: rand(-Math.PI, Math.PI),
    ax: rand(10, 26),
    ay: rand(8, 22),
    sx: rand(0.16, 0.34),
    sy: rand(0.14, 0.3),
    px: rand(0, Math.PI * 2),
    py: rand(0, Math.PI * 2),
    spin: rand(-0.004, 0.004),
  };
}

function buildFigures(small: boolean): Fig[] {
  const kinds: Kind[] = shuffle([
    "circle",
    "square",
    "capsule",
    "triangle",
    "hexagon",
    "diamond",
    "circle",
    "triangle",
    "square",
  ]);

  const figs: Fig[] = [];
  const used = new Set<string>();

  // One guaranteed figure per grid column, on a random (distinct) row.
  const rows = shuffle([...Array(ROWS).keys()]).slice(0, COLS);
  for (let col = 0; col < COLS; col++) {
    const row = rows[col];
    used.add(`${col}:${row}`);
    figs.push(makeFig(kinds[figs.length % kinds.length], col, row, small));
  }

  // A few extras so the field doesn't read as a single tidy line.
  const extras = small ? 1 : 4;
  let guard = 0;
  while (figs.length < COLS + extras && guard++ < 80) {
    const col = Math.floor(Math.random() * COLS);
    const row = Math.floor(Math.random() * ROWS);
    if (used.has(`${col}:${row}`)) continue;
    used.add(`${col}:${row}`);
    figs.push(makeFig(kinds[figs.length % kinds.length], col, row, small));
  }

  return figs;
}

function homePos(f: Fig, W: number, H: number) {
  const cw = W / COLS;
  const ch = H / ROWS;
  const pad = boundRadius(f) + 6;
  return {
    x: Math.min(W - pad, Math.max(pad, (f.col + 0.5 + f.jx * 0.5) * cw)),
    y: Math.min(H - pad, Math.max(pad, (f.row + 0.5 + f.jy * 0.5) * ch)),
  };
}

/* ------------------------------------------------------------------ */
/*  SVG for one figure                                                 */
/* ------------------------------------------------------------------ */

function FigureSvg({
  fig,
  shapeRef,
}: {
  fig: Fig;
  shapeRef: (el: SVGGeometryElement | null) => void;
}) {
  const R = boundRadius(fig);
  const tone = PALETTE[fig.tone];
  const common = {
    ref: shapeRef as never,
    stroke: tone.stroke,
    strokeWidth: 2,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
    fill: fig.filled ? tone.fill : "none",
  };

  let shape: React.ReactNode;
  switch (fig.kind) {
    case "circle":
      shape = <circle {...common} cx={0} cy={0} r={fig.r} />;
      break;
    case "square": {
      const s = squareSide(fig);
      shape = (
        <rect {...common} x={-s / 2} y={-s / 2} width={s} height={s} rx={5} />
      );
      break;
    }
    case "capsule": {
      const { w, h } = capsuleSize(fig);
      shape = (
        <rect
          {...common}
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          rx={h / 2}
        />
      );
      break;
    }
    default: {
      const sides = fig.kind === "triangle" ? 3 : fig.kind === "diamond" ? 4 : 6;
      const pts = polyVerts(sides, fig.r, -Math.PI / 2)
        .map((v) => `${v.x.toFixed(2)},${v.y.toFixed(2)}`)
        .join(" ");
      shape = <polygon {...common} points={pts} />;
    }
  }

  return (
    <svg
      width={R * 2}
      height={R * 2}
      viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`}
      aria-hidden
      className="block overflow-visible"
    >
      {shape}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function HeroFigures({ loaded }: { loaded: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapRefs = useRef<(HTMLDivElement | null)[]>([]);
  const shapeRefs = useRef<(SVGGeometryElement | null)[]>([]);
  const bodiesRef = useRef<Matter.Body[]>([]);
  const droppedRef = useRef(false);

  const [figures, setFigures] = useState<Fig[] | null>(null);

  // Generated on the client only — keeps the arrangement fresh per visit
  // without risking a hydration mismatch.
  useEffect(() => {
    const small = window.matchMedia("(max-width: 767px)").matches;
    // Deliberate client-only init: the arrangement is random per visit and
    // depends on viewport size, so it cannot be produced during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFigures(buildFigures(small));
  }, []);

  // Hide every stroke the moment the nodes exist, so nothing flashes
  // under the preloader wipe.
  useLayoutEffect(() => {
    if (!figures) return;
    const els = shapeRefs.current.filter(Boolean) as SVGGeometryElement[];
    if (els.length) gsap.set(els, { drawSVG: "0%", fillOpacity: 0 });
  }, [figures]);

  /* ---------------- physics world ---------------- */
  useEffect(() => {
    const container = containerRef.current;
    if (!figures || !container) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = container.clientWidth;
    let H = container.clientHeight;

    const engine = Engine.create();
    engine.gravity.y = 0; // weightless until the user scrolls away
    engine.positionIterations = 8;
    engine.velocityIterations = 8;

    let homes = figures.map((f) => homePos(f, W, H));
    const radii = figures.map((f) => boundRadius(f));

    const bodies = figures.map((f, i) => {
      const b = createBody(f, homes[i].x, homes[i].y);
      Body.setStatic(b, true); // released once its stroke is drawn
      return b;
    });
    bodiesRef.current = bodies;

    const wallOpts: Matter.IChamferableBodyDefinition = {
      isStatic: true,
      friction: 0.4,
      restitution: 0.2,
    };
    const floor = Bodies.rectangle(W / 2, H - FLOOR_INSET + WALL / 2, 6000, WALL, wallOpts);
    const ceiling = Bodies.rectangle(W / 2, -WALL / 2, 6000, WALL, wallOpts);
    const left = Bodies.rectangle(-WALL / 2, H / 2, WALL, 6000, wallOpts);
    const right = Bodies.rectangle(W + WALL / 2, H / 2, WALL, 6000, wallOpts);

    Composite.add(engine.world, [...bodies, floor, ceiling, left, right]);

    /* ---- cursor interaction (fine pointers only) ---- */
    let mouseConstraint: Matter.MouseConstraint | null = null;
    let unbindMouse = () => {};

    if (window.matchMedia("(pointer: fine)").matches) {
      const mouse = Mouse.create(container);
      const m = mouse as unknown as Record<string, EventListener>;

      // Matter binds its own listeners on the element, including a wheel
      // handler that calls preventDefault — that would kill Lenis. Drop
      // them all and re-bind the three we want on window instead, so a
      // drag keeps tracking even when the cursor passes over the headline.
      const el = container;
      el.removeEventListener("mousedown", m.mousedown);
      el.removeEventListener("mousemove", m.mousemove);
      el.removeEventListener("mouseup", m.mouseup);
      el.removeEventListener("mousewheel", m.mousewheel);
      el.removeEventListener("DOMMouseScroll", m.mousewheel);
      el.removeEventListener("touchstart", m.mousedown);
      el.removeEventListener("touchmove", m.mousemove);
      el.removeEventListener("touchend", m.mouseup);

      // Pressing on a figure must not start a text selection on whatever
      // copy happens to sit above it.
      const onDown = (e: MouseEvent) => {
        m.mousedown(e);
        if (Matter.Query.point(bodies, mouse.position).length) {
          e.preventDefault();
          document.body.style.userSelect = "none";
        }
      };
      const onUp = (e: MouseEvent) => {
        m.mouseup(e);
        document.body.style.userSelect = "";
      };

      window.addEventListener("mousedown", onDown);
      window.addEventListener("mousemove", m.mousemove);
      window.addEventListener("mouseup", onUp);
      unbindMouse = () => {
        window.removeEventListener("mousedown", onDown);
        window.removeEventListener("mousemove", m.mousemove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.userSelect = "";
      };

      mouseConstraint = MouseConstraint.create(engine, {
        mouse,
        constraint: {
          stiffness: 0.14,
          damping: 0.22,
          render: { visible: false },
        },
      });
      Composite.add(engine.world, mouseConstraint);
    }

    /* ---- the drop ---- */
    const drop = () => {
      if (droppedRef.current) return;
      droppedRef.current = true;

      engine.gravity.y = 2.05;
      bodies.forEach((b) => {
        Body.setStatic(b, false);
        b.restitution = 0.3; // soft rubber bounce
        b.friction = 0.32;
        b.frictionStatic = 0.66;
        b.frictionAir = 0.009;
        Body.setAngularVelocity(b, rand(-0.09, 0.09));
        Body.setVelocity(b, { x: rand(-1.2, 1.2), y: rand(0.2, 0.9) });
      });
      engine.enableSleeping = true;
    };

    /* ---- ticker ---- */
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 1000;

      if (!droppedRef.current) {
        const grabbed = mouseConstraint?.body ?? null;
        bodies.forEach((b, i) => {
          if (b.isStatic) return;
          const f = figures[i];
          const home = homes[i];
          const tx = home.x + Math.sin(t * f.sx + f.px) * f.ax;
          const ty = home.y + Math.cos(t * f.sy + f.py) * f.ay;
          const k = 0.00006 * b.mass;
          Body.applyForce(b, b.position, {
            x: (tx - b.position.x) * k,
            y: (ty - b.position.y) * k,
          });
          if (b !== grabbed) Body.setAngularVelocity(b, f.spin);
        });
      }

      Engine.update(engine, 1000 / 60);

      for (let i = 0; i < bodies.length; i++) {
        const el = wrapRefs.current[i];
        if (!el) continue;
        const b = bodies[i];
        el.style.transform = `translate3d(${b.position.x - radii[i]}px, ${
          b.position.y - radii[i]
        }px, 0) rotate(${b.angle}rad)`;
      }
    };

    if (!reduced) gsap.ticker.add(tick);
    else tick(); // one static frame at the grid positions

    /* ---- scroll hand-off: fires once the hero is half off-screen ---- */
    let st: ScrollTrigger | null = null;
    if (!reduced) {
      st = ScrollTrigger.create({
        trigger: container,
        start: "bottom 55%",
        once: true,
        onEnter: drop,
      });
      // Deep-link / restored scroll position: already past the line.
      if (window.scrollY > window.innerHeight * 0.45) drop();
    }

    /* ---- resize ---- */
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        W = container.clientWidth;
        H = container.clientHeight;
        homes = figures.map((f) => homePos(f, W, H));
        Body.setPosition(floor, { x: W / 2, y: H - FLOOR_INSET + WALL / 2 });
        Body.setPosition(ceiling, { x: W / 2, y: -WALL / 2 });
        Body.setPosition(left, { x: -WALL / 2, y: H / 2 });
        Body.setPosition(right, { x: W + WALL / 2, y: H / 2 });
        if (!droppedRef.current) {
          bodies.forEach((b, i) => Body.setPosition(b, homes[i]));
        }
      });
    };
    window.addEventListener("resize", onResize);

    return () => {
      gsap.ticker.remove(tick);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
      st?.kill();
      unbindMouse();
      Composite.clear(engine.world, false);
      Engine.clear(engine);
      bodiesRef.current = [];
    };
  }, [figures]);

  /* ---------------- draw-in, then release each figure ---------------- */
  useEffect(() => {
    if (!loaded || !figures) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tl = gsap.timeline();

    figures.forEach((f, i) => {
      const el = shapeRefs.current[i];
      if (!el) return;
      const at = i * 0.13;

      tl.to(
        el,
        {
          drawSVG: "100%",
          duration: reduced ? 0.01 : 1.15,
          ease: "power2.inOut",
          onComplete: () => {
            const b = bodiesRef.current[i];
            if (b && !reduced) Body.setStatic(b, false);
          },
        },
        at,
      );

      if (f.filled) {
        tl.to(
          el,
          { fillOpacity: 1, duration: reduced ? 0.01 : 0.7, ease: "power1.out" },
          at + 0.5,
        );
      }
    });

    return () => {
      tl.kill();
    };
  }, [loaded, figures]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="absolute inset-0 -z-10 select-none overflow-hidden"
    >
      {figures?.map((f, i) => {
        const R = boundRadius(f);
        return (
          <div
            key={i}
            ref={(el) => {
              wrapRefs.current[i] = el;
            }}
            className="absolute left-0 top-0 cursor-grab active:cursor-grabbing"
            style={{ width: R * 2, height: R * 2, willChange: "transform" }}
          >
            <FigureSvg
              fig={f}
              shapeRef={(el) => {
                shapeRefs.current[i] = el;
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
