const marks = require('/home/claude/gen/marks.json');
const ACCENT = '#C1652F';

const DRAWN = {
  'REST API': [
    "M18 12 C14 12 16 21 12 24 C16 27 14 36 18 36",
    "M30 12 C34 12 32 21 36 24 C32 27 34 36 30 36",
    "M21 20 H27 M25 18 L27 20 L25 22",
    "M27 29 H21 M23 27 L21 29 L23 31",
  ],
  OAuth: [
    "M7 24 A9 9 0 1 1 25 24 A9 9 0 1 1 7 24",
    "M25 24 H42",
    "M35 24 V31",
    "M40 24 V29",
  ],
};

const BLURBS = {
  Frontend: 'The everyday tools — components, types, and the CSS that holds it together.',
  'Animation & 3D': 'Where most of my time goes — motion that has to stay smooth at 60fps.',
  'CMS & Backend': 'The commercial half — a real site, real integrations, real users.',
  Tools: 'Version control, design hand-off, and the editor I live in.',
};

const ORDER = ['Frontend', 'Animation & 3D', 'CMS & Backend', 'Tools'];
const EXTRA = { 'CMS & Backend': ['REST API', 'OAuth'] };

const q = (s) => JSON.stringify(s);

let out = `/**
 * Technology marks for the Stack section.
 *
 * GENERATED, mostly. The 17 brand marks are Simple Icons path data baked into
 * this file at author time rather than pulled from a CDN — same call as the
 * fonts: nothing this site draws should depend on a third-party host being up
 * when a recruiter opens the page. Regenerate by re-running the emitter in
 * docs/ against a newer \`simple-icons\`; do not hand-edit the \`path\` strings.
 *
 * Simple Icons ships FILLED marks in a 24x24 box, which is at odds with a
 * section whose whole language is a line being drawn. Resolved the way Hero
 * already resolves it for its physics figures: the same path is first stroked
 * on (DrawSVG), then the fill rises into the finished outline and the stroke
 * retires. The mark ends up exactly as its owner drew it, but it arrives by
 * hand.
 *
 * REST API and OAuth stay hand-drawn: they are standards, not products, and
 * have no mark to borrow. VS Code's mark was pulled from Simple Icons over
 * trademark, so the VSCodium silhouette — the same shape, it is the fork —
 * stands in.
 *
 * \`brand\` is the owner's official colour, used only on hover. Marks whose
 * brand colour is effectively black (Next.js, Three.js, GitHub) would make
 * hover invisible against ink, so they take the site accent instead.
 */

export type StackIcon =
  | {
      kind: "mark";
      name: string;
      /** Simple Icons title this came from — differs from \`name\` for VS Code. */
      source: string;
      /** Hover colour: the owner's brand hex, or the accent when that is black. */
      brand: string;
      /** Single filled path in a 24x24 box. */
      path: string;
    }
  | {
      kind: "drawn";
      name: string;
      brand: string;
      /** Stroke-only sub-paths in a 48x48 box, in drawing order. */
      paths: string[];
    };

export type StackCategory = {
  title: string;
  blurb: string;
  items: StackIcon[];
};

export const STACK_CATEGORIES: StackCategory[] = [
`;

for (const cat of ORDER) {
  out += `  {\n    title: ${q(cat)},\n    blurb: ${q(BLURBS[cat])},\n    items: [\n`;
  for (const m of marks[cat]) {
    const brand = m.dark ? ACCENT : m.hex;
    out += `      {\n        kind: "mark",\n        name: ${q(m.name)},\n        source: ${q(m.source)},\n        brand: ${q(brand)},\n        path: ${q(m.path)},\n      },\n`;
  }
  for (const name of EXTRA[cat] ?? []) {
    out += `      {\n        kind: "drawn",\n        name: ${q(name)},\n        brand: ${q(ACCENT)},\n        paths: [\n`;
    for (const p of DRAWN[name]) out += `          ${q(p)},\n`;
    out += `        ],\n      },\n`;
  }
  out += `    ],\n  },\n`;
}
out += `];\n`;
process.stdout.write(out);
