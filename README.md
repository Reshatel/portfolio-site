# Maksym Ostapchuk — Portfolio

An animated, motion-driven portfolio site. Built with Next.js (App Router),
TypeScript, Tailwind CSS, GSAP (ScrollTrigger, SplitText, DrawSVGPlugin),
and Lenis for smooth scroll.

The full design plan (palette, typography, motion language, and a
section-by-section content spec) lives in the attached Claude Project as
`design-plan.md` and `content-source.md` — read those before making design
decisions, they're the source of truth.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Status

**Fully built, with real motion:**
- Preloader (counter + wipe transition)
- Hero — kinetic "invisible pen" headline reveal, hand-drawn signature
  (DrawSVGPlugin), abstract decorative line-figures, cursor parallax across
  depth layers, magnetic CTA/social links

**Structured with real content, not yet animated (next up):**
- About, Stack, Experience, Projects, Education, Featured Collaboration,
  Contact, Footer

Each of those has a `TODO` comment at the top of its JSX pointing to the
relevant spec in `design-plan.md` — e.g. Stack should become a hand-drawn
icon grid, Experience a zig-zag timeline with a drawn spine, Projects a
pinned horizontal-scroll gallery, Education a "Credential Wall" with
stamp-seal reveals, and Contact/Footer the closing bookend to the Hero.

## Open items (don't block continued work, just need real assets)

- Real photo/avatar for About
- A set of line-style tech icons for Stack
- Screenshots/GIFs for each project in Projects
- Exact copy + final stack for the Digital Footprint Simulator project
- Flight Academy logo (tinted mono version) for Featured Collaboration
- Any additional projects for the gallery

## Project structure

```
src/
  app/
    layout.tsx       — fonts, metadata, root layout
    page.tsx          — composes all sections
    globals.css        — Tailwind v4 theme tokens (Warm Paper palette)
  components/
    providers/
      SmoothScrollProvider.tsx  — Lenis + GSAP ticker/ScrollTrigger sync
    sections/          — one component per site section
    ui/
      MagneticLink.tsx  — reusable magnetic hover link
  lib/
    gsap.ts            — registers GSAP plugins once (client-side)
```

## Deploy

Deployment (GitHub + Vercel) is intentionally left for later, once more
sections are built out.
