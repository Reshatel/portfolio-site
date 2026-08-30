"use client";

import { useEffect, useState, type RefObject } from "react";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import Matter from "matter-js";

const { Engine, Bodies, Body, Composite, Constraint, Mouse, MouseConstraint, Events } =
  Matter;

/* ------------------------------------------------------------------ */
/*  The rig: what actually hangs on the wall                           */
/*                                                                     */
/*  Each document's rod runs on PAST the paper — a dowel longer than    */
/*  the sheet, the way a hanging scroll is really made — and off that   */
/*  overhang hang two cords with a wax seal and a year tag. All of it   */
/*  is one connected physical assembly: static anchors on the arm, a    */
/*  chain of linked bodies per cord, a weight at the end, and the       */
/*  sheet itself as a pendulum that the charms can knock into.          */
/*                                                                     */
/*  Three rules this file follows, and they are the ones that keep it   */
/*  from breaking the rest of the section:                              */
/*                                                                     */
/*  1. NOTHING HERE TOUCHES A MEASURED BOX. The thread derives each     */
/*     scroll's stretch of pen travel from `.sc-sheet`; the sway is     */
/*     applied to `.sc-swing` INSIDE it, and a descendant's transform   */
/*     stays out of its parent's box.                                   */
/*  2. THE LAYOUT DECIDES, THE PHYSICS FOLLOWS. Anchors come from the   */
/*     arm's own measured box, so CSS can change the overhang and this  */
/*     file needs no edit — the same rule the geometry follows.          */
/*  3. IT IS GATED ON THE PEN. A cord hangs from a rod that has been    */
/*     hung: the charms are held at the arm until `data-tied`, and let  */
/*     go the moment the pen ties that document's knot. Scroll back up  */
/*     and they are held again.                                         */
/*                                                                     */
/*  Desktop only, and only for fine pointers and no reduced-motion      */
/*  preference: on a narrow screen the space this fills does not exist. */
/* ------------------------------------------------------------------ */

const SEGMENTS = 5;
/** Must outlast the rig's own opacity transition in `globals.css`. */
const FADE_OUT = 700;
/**
 * Where the cords hang from along the arm, and how long they are as fractions
 * of the sheet — one table per number of cords, because the section alternates
 * between two and three. Never the same height twice: two weights level with
 * each other is a washing line, two at different heights is a mobile.
 *
 * Keyed by how many charms the row actually renders, so the count lives in the
 * markup (where the charms are) and this file follows it.
 */
const CORDS: Record<number, { at: number; len: number }[]> = {
  1: [{ at: 0.94, len: 0.6 }],
  2: [
    { at: 0.5, len: 0.28 },
    { at: 0.96, len: 0.7 },
  ],
  3: [
    { at: 0.3, len: 0.46 },
    { at: 0.63, len: 0.22 },
    { at: 0.96, len: 0.68 },
  ],
};

type Cord = {
  path: SVGPathElement;
  segs: Matter.Body[];
  charm: Matter.Body;
  el: HTMLElement;
  hw: number;
  hh: number;
  anchor: { x: number; y: number };
  segLen: number;
};

type Rig = {
  li: HTMLElement;
  swing: HTMLElement | null;
  rig: HTMLElement;
  origin: { x: number; y: number };
  sheet: Matter.Body;
  cords: Cord[];
  /** The sheet's own pendulum: one angle, integrated by hand. */
  theta: number;
  omega: number;
  /** Bodies are dynamic and being simulated. */
  live: boolean;
  /** When to freeze and put them back, once the fade-out has finished. */
  parkAt: number;
};

export default function CredentialRig({
  sectionRef,
}: {
  sectionRef: RefObject<HTMLElement | null>;
}) {
  const [on, setOn] = useState(false);
  /* Anchors are measured once per build, so anything that moves the layout —
     a resize, the webfont landing — has to rebuild rather than patch: an
     anchor left at an old coordinate is a cord tied to nothing. */
  const [rev, setRev] = useState(0);

  /* Desktop, fine pointer, motion allowed. Watched rather than read once, so
     a resize across the breakpoint tears the world down instead of leaving
     bodies hanging over a layout that no longer has room for them. */
  useEffect(() => {
    const q = window.matchMedia(
      "(min-width: 768px) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    );
    const sync = () => setOn(q.matches);
    sync();
    q.addEventListener("change", sync);
    return () => q.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    let t = 0;
    const bump = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => setRev((n) => n + 1), 250);
    };
    window.addEventListener("resize", bump);
    document.fonts?.ready.then(bump).catch(() => {});
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", bump);
    };
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!on || !section) return;

    const rigEls = [...section.querySelectorAll<HTMLElement>("[data-rig]")];
    if (!rigEls.length) return;

    const engine = Engine.create();
    engine.gravity.y = 1;
    /* A chain is the hardest thing to ask of a sequential-impulse solver, and
       what it hates most is a heavy weight on light links: the error is pushed
       up the chain one joint per iteration, so too few iterations show up as a
       weight that wobbles instead of swinging. */
    engine.positionIterations = 12;
    engine.velocityIterations = 10;
    engine.constraintIterations = 4;

    const secBox = () => {
      const r = section.getBoundingClientRect();
      return { x: r.left + window.scrollX, y: r.top + window.scrollY };
    };

    const rigs: Rig[] = [];
    const charmBodies: Matter.Body[] = [];
    const add: Matter.Body[] = [];
    const constraints: Matter.Constraint[] = [];

    /* Everything lives in ONE world in SECTION coordinates, so a single mouse
       maps to every row. Each row remembers its own offset and converts back
       when it writes a transform. */
    const build = () => {
      const S = secBox();

      for (const rig of rigEls) {
        const li = rig.closest<HTMLElement>("[data-item]");
        const arm = li?.querySelector<HTMLElement>("[data-arm]");
        const sheetEl = li?.querySelector<HTMLElement>("[data-sheet]");
        const svg = rig.querySelector("svg");
        if (!li || !arm || !sheetEl || !svg) continue;

        const local = (el: Element) => {
          const r = el.getBoundingClientRect();
          return {
            x: r.left + window.scrollX - S.x,
            y: r.top + window.scrollY - S.y,
            w: r.width,
            h: r.height,
          };
        };

        const itemBox = local(li);
        const sheetBox = local(sheetEl);
        /* The rig's own origin is taken from LAYOUT, for the same reason the
           arm's length is — and this one bit twice. Everything the physics
           renders is drawn relative to this point, and the rig carries a
           `translateY(-16px)` whenever its rod has not been hung yet. Measured
           with `getBoundingClientRect()` the origin therefore came out 16px
           high exactly when the world happened to be built before the pen had
           tied that row — and the cords hung 16px below their rod, until a
           reload happened to land on the other side of the race. `offsetLeft`
           and `offsetTop` are what the layout assigned, whatever any transform
           is doing on top of it. */
        const rigBox = {
          x: itemBox.x + rig.offsetLeft,
          y: itemBox.y + rig.offsetTop,
          w: rig.offsetWidth,
          h: rig.offsetHeight,
        };
        const railEl = section.querySelector("[data-rail]");
        if (!railEl) continue;
        const railX = local(railEl).x;

        /* The arm is measured by LAYOUT, not by its rendered box.
           ------------------------------------------------------------------
           It draws itself with `scaleX`, and `getBoundingClientRect()` returns
           the TRANSFORMED box — so building the rig while that transition was
           running anchored the cords part-way along an arm that had not
           finished growing. `offsetWidth` is the width the layout gave it,
           whatever the transform is doing, and the rail element gives the root
           the same way the geometry gets it. */
        const armLen = arm.offsetWidth;
        const rodY = itemBox.y + arm.offsetTop + arm.offsetHeight / 2;
        // Which way the arm runs is read off the boxes: away from the sheet.
        const dir: 1 | -1 = sheetBox.x + sheetBox.w / 2 > railX ? -1 : 1;
        const root = railX;
        const armBox = { w: armLen };

        svg.setAttribute("viewBox", `0 0 ${rigBox.w} ${rigBox.h}`);

        // Static, and only a collider: the sway is integrated by hand so it
        // can be kept to the couple of degrees a hanging sheet actually moves.
        const sheet = Bodies.rectangle(
          sheetBox.x + sheetBox.w / 2,
          sheetBox.y + sheetBox.h / 2,
          sheetBox.w,
          sheetBox.h,
          { isStatic: true, friction: 0.4, restitution: 0.25 },
        );
        add.push(sheet);

        const paths = [...rig.querySelectorAll<SVGPathElement>("[data-cord]")];
        const charmEls = [...rig.querySelectorAll<HTMLElement>("[data-charm]")];
        const cords: Cord[] = [];
        const specs =
          CORDS[charmEls.length] ??
          charmEls.map((_, k) => ({
            at: 0.3 + (0.66 * k) / Math.max(1, charmEls.length - 1),
            len: k % 2 ? 0.3 : 0.72,
          }));

        specs.forEach((spec, ci) => {
          const path = paths[ci];
          const el = charmEls[ci];
          if (!path || !el) return;

          const ax = root + dir * armBox.w * spec.at;
          const total = Math.max(90, sheetBox.h * spec.len);
          const segLen = total / SEGMENTS;
          /* The body is the SHAPE THE ELEMENT ACTUALLY IS, so the cord meets
             its real top edge. A circle sized off the width leaves the cord
             ending in mid-air above a tag that is wider than it is tall. */
          const hw = el.offsetWidth / 2;
          const hh = el.offsetHeight / 2;
          const round = el.dataset.shape === "round";

          const segs: Matter.Body[] = [];
          let prev: Matter.Body | null = null;
          for (let k = 0; k < SEGMENTS; k++) {
            const b = Bodies.rectangle(ax, rodY + (k + 0.5) * segLen, 3, segLen * 0.92, {
              // Cords pass through everything — a rope that collides with
              // itself spends its whole life untangling instead of hanging.
              collisionFilter: { group: -1, category: 2, mask: 0 },
              frictionAir: 0.03,
              density: 0.0022,
            });
            segs.push(b);
            constraints.push(
              Constraint.create({
                bodyA: prev ?? undefined,
                pointA: prev ? { x: 0, y: segLen / 2 } : { x: ax, y: rodY },
                bodyB: b,
                pointB: { x: 0, y: -segLen / 2 },
                stiffness: 0.5,
                damping: 0.06,
                length: 0,
              }),
            );
            prev = b;
          }

          const opts: Matter.IChamferableBodyDefinition = {
            /* Metal, not paper — but the WEIGHT IS IN THE DAMPING, not in the
               density. A pendulum's period does not depend on its mass at all,
               so what reads as "heavy" is a swing that carries a long way and
               settles slowly; density only decides how hard the chain above it
               has to work. At 0.014 the weight was some twenty times the link
               it hung from and the solver could not keep up — the swing came
               out juddery. This is heavy enough to feel and light enough that
               the cord behaves like a cord. */
            frictionAir: 0.009,
            restitution: 0.4,
            density: 0.0042,
            /* 1 = the sheet it can knock into, 4 = the other charms, 8 = the
               cursor. Leave 8 out and the mouse constraint silently cannot
               pick anything up: Matter requires the mask to match BOTH ways. */
            collisionFilter: { category: 4, mask: 1 | 4 | 8 },
          };
          const cy = rodY + total + hh;
          const charm = round
            ? Bodies.circle(ax, cy, hw, opts)
            : Bodies.rectangle(ax, cy, hw * 2, hh * 2, opts);
          /* The weight does not spin. The cord is tied to a point on its body,
             so a body free to rotate drags that point round its own edge — the
             cord appeared to slide about the ball and to leave it at an angle
             it was never tied at. A hanging seal stays the way up it was hung,
             and the knot stays on top where it belongs. */
          Body.setInertia(charm, Infinity);
          constraints.push(
            Constraint.create({
              bodyA: prev ?? undefined,
              pointA: { x: 0, y: segLen / 2 },
              bodyB: charm,
              pointB: { x: 0, y: -hh },
              stiffness: 1,
              damping: 0.1,
              length: 0,
            }),
          );

          add.push(...segs, charm);
          charmBodies.push(charm);
          cords.push({ path, segs, charm, el, hw, hh, anchor: { x: ax, y: rodY }, segLen });
        });

        rigs.push({
          li,
          rig,
          swing: li.querySelector<HTMLElement>("[data-swing]"),
          origin: { x: rigBox.x, y: rigBox.y },
          sheet,
          cords,
          theta: 0,
          omega: 0,
          live: false,
          parkAt: 0,
        });
      }

      Composite.add(engine.world, [...add, ...constraints]);
    };

    build();
    if (!rigs.length) {
      Engine.clear(engine);
      return;
    }

    /* ---- holding, and letting go with the pen ---- */

    /** Put a rig away: bodies frozen back at the arm, ready to unfurl again. */
    const park = (r: Rig) => {
      r.live = false;
      r.parkAt = 0;
      /* `theta` is deliberately NOT reset. Snapping the sheet upright is a
         visible jerk; leaving it to the spring, which now has nothing pulling
         on it, lets it settle in its own time. */
      r.cords.forEach((c) => {
        c.segs.forEach((b, k) => {
          Body.setStatic(b, true);
          Body.setPosition(b, {
            x: c.anchor.x,
            y: c.anchor.y + (k + 0.5) * c.segLen * 0.3,
          });
          Body.setAngle(b, 0);
        });
        Body.setStatic(c.charm, true);
        Body.setPosition(c.charm, {
          x: c.anchor.x,
          y: c.anchor.y + SEGMENTS * c.segLen * 0.3 + c.hh,
        });
        Body.setAngle(c.charm, 0);
      });
    };

    const release = (r: Rig) => {
      r.live = true;
      r.parkAt = 0;
      r.cords.forEach((c) => {
        c.segs.forEach((b) => {
          Body.setStatic(b, false);
          Body.setVelocity(b, { x: 0, y: 0 });
        });
        Body.setStatic(c.charm, false);
        Body.setVelocity(c.charm, { x: 0, y: 0 });
      });
    };

    rigs.forEach(park);

    /* ---- a knock on the paper sets it swinging ---- */
    const onHit = (e: Matter.IEventCollision<Matter.Engine>) => {
      for (const pair of e.pairs) {
        for (const r of rigs) {
          const charm =
            pair.bodyA === r.sheet ? pair.bodyB : pair.bodyB === r.sheet ? pair.bodyA : null;
          if (!charm || !charmBodies.includes(charm)) continue;
          const push = charm.velocity.x * charm.mass * 0.9;
          r.omega += Math.max(-0.06, Math.min(0.06, push));
        }
      }
    };
    Events.on(engine, "collisionStart", onHit);

    /* ---- the cursor ---- */
    const mouse = Mouse.create(section);
    const m = mouse as unknown as Record<string, EventListener>;
    // Matter binds its own listeners, including a wheel handler that calls
    // preventDefault — that would kill Lenis. Same fix as HeroFigures.
    section.removeEventListener("mousedown", m.mousedown);
    section.removeEventListener("mousemove", m.mousemove);
    section.removeEventListener("mouseup", m.mouseup);
    section.removeEventListener("mousewheel", m.mousewheel);
    section.removeEventListener("DOMMouseScroll", m.mousewheel);
    section.removeEventListener("touchstart", m.mousedown);
    section.removeEventListener("touchmove", m.mousemove);
    section.removeEventListener("touchend", m.mouseup);

    const onDown = (e: MouseEvent) => {
      m.mousedown(e);
      if (Matter.Query.point(charmBodies, mouse.position).length) {
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

    const mc = MouseConstraint.create(engine, {
      mouse,
      // Only the charms are grabbable; the cord itself is not a handle.
      collisionFilter: { category: 8, mask: 4, group: 0 },
      constraint: { stiffness: 0.11, damping: 0.28, render: { visible: false } },
    });
    Composite.add(engine.world, mc);

    /* ---- run only while the section is anywhere near ---- */
    let live = false;
    const st = ScrollTrigger.create({
      trigger: section,
      start: "top bottom+=40%",
      end: "bottom top-=40%",
      onToggle: (self) => {
        live = self.isActive;
      },
    });

    /* ---- the loop ---- */

    /* A CORD HAS A LENGTH.
       ------------------------------------------------------------------
       Matter's constraints are springs, and a mouse pulling on the far end of
       five of them in series stretches the whole thing like elastic — grab the
       seal and you could drag it halfway down the page. Stiffness alone does
       not fix that; the fix is to state the length as a hard fact and enforce
       it after every solver step.

       One forward pass from the anchor: each link may sit at most its own
       length from the one above, and the weight at most half a link plus its
       own radius from the last. A correction also kills the OUTWARD half of
       that body's velocity — put a body back without doing that and it arrives
       at the limit again next step with the same speed, which is a body
       vibrating against a wall rather than a cord that has run out. */
    const enforceLength = () => {
      for (const r of rigs) {
        if (!r.live) continue;
        for (const c of r.cords) {
          let px = c.anchor.x;
          let py = c.anchor.y;
          const pin = (b: Matter.Body, max: number) => {
            const dx = b.position.x - px;
            const dy = b.position.y - py;
            const d = Math.hypot(dx, dy);
            if (d > max && d > 0.001) {
              const ux = dx / d;
              const uy = dy / d;
              Body.setPosition(b, { x: px + ux * max, y: py + uy * max });
              const out = b.velocity.x * ux + b.velocity.y * uy;
              if (out > 0) {
                Body.setVelocity(b, {
                  x: b.velocity.x - ux * out,
                  y: b.velocity.y - uy * out,
                });
              }
            }
            px = b.position.x;
            py = b.position.y;
          };
          for (const b of c.segs) pin(b, c.segLen);
          pin(c.charm, c.segLen / 2 + c.hh);
        }
      }
    };

    let lastY = window.scrollY;
    let smoothV = 0;
    let smoothA = 0;
    let acc = 0;
    let last = performance.now();

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!live) return;

      /* Scrolling changes what the cords feel: a hard flick makes everything
         bob on its cord, which is the honest version of "the page shook".

         Both derivatives are LOW-PASSED. A frame-to-frame acceleration is
         mostly timing noise — one long frame reads as a jolt that never
         happened — and feeding that straight into gravity is a world that
         shivers for no reason. */
      const y = window.scrollY;
      const v = (y - lastY) / Math.max(0.0001, dt);
      lastY = y;
      const prevV = smoothV;
      smoothV += (v - smoothV) * 0.25;
      smoothA += ((smoothV - prevV) / Math.max(0.0001, dt) - smoothA) * 0.2;
      engine.gravity.y = 1 + Math.max(-0.4, Math.min(0.4, smoothA * 0.00012));

      for (const r of rigs) {
        /* Scrolling back up used to freeze the weights and teleport them to
           the arm the instant the pen let go of the rod — a snap underneath a
           half-second fade. Now the rig only stops being SIMULATED once it has
           finished fading: it swings out of sight and is put back invisibly.
           Scroll down again mid-fade and it simply carries on. */
        const tied = r.li.hasAttribute("data-tied");
        if (tied) {
          if (!r.live) release(r);
          r.parkAt = 0;
        } else if (r.live && !r.parkAt) {
          r.parkAt = now + FADE_OUT;
        }
        if (!tied && r.parkAt && now >= r.parkAt) park(r);

        /* The sheet: a plain spring-damper, so its travel stays in the couple
           of degrees a hanging sheet really moves — forced by the WEIGHT
           HANGING OFF THE SAME ROD. That is the whole point of the assembly:
           the charms and the paper are on one dowel, so swinging a seal tips
           the rod and the document rocks with it. No collision needed, though
           a charm that does reach the paper adds its own knock. */
        let pull = 0;
        for (const c of r.cords) pull += c.charm.position.x - c.anchor.x;
        pull /= Math.max(1, r.cords.length);
        /* The weight sets a REST ANGLE for the sheet and the spring chases it,
           saturating rather than clipping: a hard clamp meant a big swing
           parked the sheet against its limit and let go with a jerk, which is
           what read as the paper twitching. `tanh` has no wall to hit. */
        const rest = Math.tanh(pull / 240) * 0.026;
        r.omega += ((rest - r.theta) * 26 - r.omega * 3.4) * dt;
        r.theta += r.omega * dt;
        r.theta = Math.max(-0.035, Math.min(0.035, r.theta));
      }

      /* A FIXED STEP.
         ---------------------------------------------------------------
         Springs integrated on a variable timestep are the other half of the
         judder: a frame that runs long makes every constraint overshoot, and
         a chain turns that into a whip. The loop below always advances the
         world by the same 1/60, at most three times per frame, and drops
         whatever it cannot catch up on. */
      acc = Math.min(acc + dt, 3 / 60);
      let steps = 0;
      while (acc >= 1 / 60 && steps < 3) {
        Engine.update(engine, 1000 / 60);
        acc -= 1 / 60;
        steps++;
        enforceLength();
      }

      /* A CORD HAS A LENGTH.
         ---------------------------------------------------------------
         Matter's constraints are springs, and a mouse pulling on the far
         end of five of them in series stretches the whole thing like
         elastic — grab the seal and you could drag it halfway down the
         page. Stiffness alone does not fix that; the fix is to state the
         length as a hard fact and enforce it after the solver.

         One forward pass from the anchor: each link may sit at most its own
         length from the one above, and the weight at most half a link plus
         its own radius from the last. Positions are corrected with the
         velocity carried along (`Body.setPosition` shifts positionPrev too),
         so nothing gains energy from being put back. */


      for (const r of rigs) {
        if (r.swing) {
          r.swing.style.transform =
            Math.abs(r.theta) < 0.0002 ? "" : `rotate(${r.theta.toFixed(5)}rad)`;
        }
        for (const c of r.cords) {
          /* Drawn through the JOINTS, not the link centres.
             ------------------------------------------------------------
             A link's centre is half a link away from where the cord is
             actually tied, so a chain whose links have rotated even slightly
             renders as a curve that misses both ends — most visibly right at
             the weight, where the last centre sits half a link off the knot
             and the line arrived into the ball at an angle. These are the
             points the constraints really hold, so the cord passes through
             them. Smoothed with quadratics: a five-point polyline reads as a
             folded wire, and a cord does not fold. */
          const jointAt = (b: Matter.Body, off: number) => ({
            x: b.position.x - Math.sin(b.angle) * off - r.origin.x,
            y: b.position.y + Math.cos(b.angle) * off - r.origin.y,
          });
          const p: { x: number; y: number }[] = [
            { x: c.anchor.x - r.origin.x, y: c.anchor.y - r.origin.y },
            // Each link's lower knot — which is the next link's upper one.
            ...c.segs.slice(0, -1).map((b) => jointAt(b, c.segLen / 2)),
            jointAt(c.charm, -c.hh),
          ];
          let d = `M ${p[0].x.toFixed(1)} ${p[0].y.toFixed(1)}`;
          for (let k = 1; k < p.length - 1; k++) {
            const mx = (p[k].x + p[k + 1].x) / 2;
            const my = (p[k].y + p[k + 1].y) / 2;
            d += ` Q ${p[k].x.toFixed(1)} ${p[k].y.toFixed(1)}, ${mx.toFixed(1)} ${my.toFixed(1)}`;
          }
          d += ` L ${p[p.length - 1].x.toFixed(1)} ${p[p.length - 1].y.toFixed(1)}`;
          c.path.setAttribute("d", d);
          c.el.style.transform = `translate3d(${(
            c.charm.position.x - r.origin.x - c.hw
          ).toFixed(1)}px, ${(c.charm.position.y - r.origin.y - c.hh).toFixed(
            1,
          )}px, 0) rotate(${c.charm.angle.toFixed(4)}rad)`;
        }
      }
    };

    gsap.ticker.add(tick);

    return () => {
      gsap.ticker.remove(tick);
      st.kill();
      Events.off(engine, "collisionStart", onHit);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", m.mousemove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      rigs.forEach((r) => {
        if (r.swing) r.swing.style.transform = "";
      });
      Composite.clear(engine.world, false);
      Engine.clear(engine);
    };
  }, [on, rev, sectionRef]);

  return null;
}
