/**
 * The featured collaboration, as data.
 *
 * The section reads everything from here: the number of STAGES decides how
 * many waypoints the route flies (the thread's geometry is measured off the
 * marker boxes the layout ends up producing), and `shots` decides what the
 * browser window finally resolves into. Adding a stage or a screenshot is a
 * change to this file and nothing else.
 */

export type Stage = {
  /** The waypoint's own label — "WPT 01", and the code shown beside it. */
  code: string;
  title: string;
  body: string;
};

export type Collab = {
  eyebrow: string;
  name: string;
  meta: string;
  /** What types itself into the window's address bar. Host only, no scheme. */
  domain: string;
  href: string;
  /** The client's mark, tinted to the palette by CSS. Optional. */
  logo?: string;
  logoAlt?: string;
  lead: string;
  stages: Stage[];
  tags: string[];
  /**
   * The live site, in the order it should be seen. The window builds itself
   * out of a wireframe while the route flies the legs and resolves into the
   * FIRST of these at the last waypoint; any others follow as the section
   * finishes passing. With none listed the wireframe simply stays — it is a
   * real drawing of the layout, not a grey box, so nothing looks unfinished.
   *
   * Shape them like a browser viewport (the window is set to 1.85).
   */
  shots: string[];
  /** The stamp pressed into the corner when the section arrives. */
  stamp: { top: string; mid: string; bottom: string };
  /** The stub's fields, in the order they are printed on it. */
  pass: { label: string; value: string }[];
};

export const COLLAB: Collab = {
  eyebrow: "Real Users, Real Deadline",
  name: "Flight Academy",
  meta: "Corporate Website · WordPress · Jan–Apr 2026",
  domain: "usfa.edu.ua",
  href: "https://www.usfa.edu.ua/",
  logo: "/collab/usfa-logo.png",
  logoAlt: "Ukrainian State Flight Academy",
  lead:
    "One client, one deadline, one site still in service. I flew this one as second developer on a two-person build — here is the flight plan: what the academy needed, which half of it was mine, and where it landed.",
  stages: [
    {
      code: "BRIEF",
      title: "The Brief",
      body:
        "A flight academy needed a professional, modern corporate site their own team could actually maintain after launch — not just a one-off template.",
    },
    {
      code: "BUILD",
      title: "The Build",
      body:
        "I joined as the second developer, and my half was hands-on: building out pages, hand-coding reusable content blocks the academy's own team could keep using, and wiring up the integrations — OAuth sign-in, Google Classroom so students reach course material straight from the site, and a live Google Photos gallery. Then the work that decides whether a site survives contact with real users: mobile adaptation across the pages, a steady run of bug fixes, and the legwork on plugins — finding what could be bought instead of built, and checking it would not drag the site down.",
    },
    {
      code: "RESULT",
      title: "The Result",
      body:
        "A live, working commercial site shipped on schedule, currently serving real students and staff.",
    },
  ],
  tags: ["WordPress", "PHP", "OAuth", "Google Classroom", "SEO", "Responsive"],
  shots: ["/collab/usfa-2.png"],
  stamp: { top: "USFA · KROPYVNYTSKYI", mid: "JAN — APR 2026", bottom: "SHIPPED ON TIME" },
  pass: [
    { label: "Operator", value: "Ukrainian State Flight Academy" },
    { label: "Seat", value: "Second developer, team of two" },
    { label: "Dep — Arr", value: "Jan 2026 — Apr 2026" },
    { label: "Status", value: "Shipped · still flying" },
  ],
};
