/**
 * The wall's contents.
 *
 * Same rule as `projects.ts`: adding a certificate is an edit to THIS file and
 * nothing else. The layout flows it, the thread threads it (the route is built
 * from measured boxes, not from a count), and the bands that drive the reveal
 * are generated per card — so a third credential needs no code.
 */
export type Credential = {
  kind: "diploma" | "badge";
  /** Issuer for a badge, award for a diploma — the small line above the title. */
  kicker: string;
  title: string;
  org: string;
  meta: string;
  /** One line of substance, so the wall says something rather than just listing. */
  note?: string;
  /** A public credential page, when there is one. */
  href?: string;
};

export const CREDENTIALS: Credential[] = [
  {
    kind: "diploma",
    kicker: "Bachelor's Degree · 2022 — 2026",
    title: "Computer Science",
    org: "Central Ukrainian State University named after Volodymyr Vynnychenko",
    meta: "Kropyvnytskyi, Ukraine",
    note: "Thesis: an interactive graph visualisation of a personal digital footprint — built as a real frontend application, not a write-up.",
  },
  {
    kind: "badge",
    kicker: "Cisco Networking Academy",
    title: "Ethical Hacker",
    org: "Certificate",
    meta: "Issued May 2025",
    note: "Recon, scanning and vulnerability assessment — enough of the offensive side to write safer code on the defensive one.",
  },
];
