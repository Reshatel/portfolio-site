/**
 * The projects, in the order they appear on the page.
 *
 * Adding one is a change to THIS FILE AND NOTHING ELSE. The section alternates
 * sides by index, the thread's geometry is measured off whatever boxes the
 * layout ends up producing, and the pen's exit is pinned to the left rail
 * however many rows there turn out to be — so a sixth project needs no code.
 */

export type Project = {
  name: string;
  /** Second line of the title, when the full name is too long to set as one. */
  subtitle?: string;
  /** The small label in the card's corner — "Live", "Diploma project", … */
  status: string;
  href: string;
  /** What types itself into the sketched address bar. Host only, no scheme. */
  domain: string;
  hook: string;
  body: string;
  tags: string[];
  /**
   * Screenshots, in the order they should be seen.
   *
   * Drop the files in `public/projects/` and list their paths here. What the
   * card does follows from how many there are, with no other change anywhere:
   *   none  -> the wireframe placeholder, drifting as it does now
   *   one   -> that screenshot, held still
   *   two+  -> a filmstrip inside the browser frame: scrolling the row walks
   *            through them, resting on each one before sliding to the next
   *
   * Shape them like a browser viewport (roughly 16:8.6 — the window they sit
   * in is set to 1.85, which is what these are). Anything wider or taller is
   * centre-cropped rather than squashed, so it still looks right, it just
   * loses a sliver.
   */
  shots?: string[];
};

export const PROJECTS: Project[] = [
  {
    name: "Chess School",
    status: "Live",
    href: "https://chess-school-five.vercel.app/",
    domain: "chess-school-five.vercel.app",
    hook: "A premium-feeling booking site for a chess school — built to actually feel like chess.",
    body: "A polished booking experience with chess.js powering a fully interactive board, where visitors solve three real puzzles before they even sign up. Every transition is tuned to feel expensive — smooth, considered, unhurried.",
    tags: ["React", "Next.js", "TypeScript", "GSAP", "chess.js", "Tailwind"],
    shots: [
      "/projects/chess-school-1.png",
      "/projects/chess-school-2.png",
      "/projects/chess-school-3.png",
    ],
  },



  
  {
    name: "Entropy",
    subtitle: "A Study in Order and Decay",
    status: "Live",
    href: "https://entropy-scroll-qizm.vercel.app/",
    domain: "entropy-scroll-qizm.vercel.app",
    hook: "A scroll-driven descent from geometric perfection into chaos.",
    body: "An experimental 3D piece — an icosahedron that deforms and shatters as you scroll, driven by simplex-noise and rendered with React Three Fiber, choreographed alongside GSAP-mapped SVG paths. Built to stay smooth: GPU-conditional rendering, deformations that pause off-screen.",
    tags: ["React", "Vite", "TypeScript", "Three.js", "React Three Fiber", "GSAP"],
    shots: [
      "/projects/entropy-1.png",
      "/projects/entropy-2.png",
      "/projects/entropy-3.png",
    ],
  },
  {
    name: "DevScope",
    status: "Live",
    href: "https://devscope-topaz.vercel.app/",
    domain: "devscope-topaz.vercel.app",
    hook: "Compare any two GitHub profiles, side by side, in seconds.",
    body: "A fast GitHub analyzer — debounced search, language-distribution breakdowns, head-to-head comparison charts. Built to show real product engineering: a live REST API, caching, strict typing, tests, and a command palette for power users.",
    tags: ["Next.js 15", "TypeScript", "TanStack Query", "Zustand", "Recharts", "Vitest"],
    shots: [
      "/projects/dig1.png",
      "/projects/dig2.png",
      "/projects/dig3.png",
    ],
  },
  {
    name: "Digital Footprint Simulator",
    status: "Diploma project",
    href: "https://reshatel.github.io/diploma-project/",
    domain: "reshatel.github.io/diploma-project",
    hook: "A graph visualization of your digital footprint — with a bit of jelly physics.",
    body: "My degree thesis: an interactive graph visualizing a person's digital footprint, with soft jelly-like physics driving how the nodes move and settle.",
    tags: ["JavaScript", "React", "Vite", "CSS"],
    shots: [
      "/projects/dip1.png",
      "/projects/dip2.png",
      "/projects/dip3.png",
    ],
  },
  {
    name: "Virtual Guitar",
    subtitle: "React",
    status: "Live",
    href: "https://reshatel.github.io/Virtual-Guitar-React/",
    domain: "reshatel.github.io/Virtual-Guitar-React",
    hook: "A meditative, playable guitar — right in the browser.",
    body: "An atmospheric app that turns the browser into a calm, playable instrument: a real chord-playing fretboard, built-in beginner theory tips, and an ambient interface for quiet practice as much as discovery.",
    tags: ["React", "Custom CSS animation", "Audio playback"],
    shots: [
      "/projects/git1.png",
      "/projects/git2.png",

    ],
  },
];
