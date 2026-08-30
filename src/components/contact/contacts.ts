/**
 * The contact lines, in the order the landing writes them.
 *
 * The count is free — add or remove a line and nothing else has to change.
 * The thread comes to rest on the FIRST rule, so the list can grow downwards
 * without moving the point it lands on; the reveal stagger is `nth-child` in
 * CSS, and a fifth line would simply want one more delay pair there.
 */
export type ContactLine = {
  /** The small label on the left. */
  label: string;
  /** What is actually printed — the address, not a euphemism for it. */
  value: string;
  href: string;
  external?: boolean;
  /** The affordance on the right. `copy` also puts the value on the clipboard. */
  action: "copy" | "call" | "open";
};

export const CONTACT_LINES: ContactLine[] = [
  {
    label: "Email",
    value: "ipadair.maxim@gmail.com",
    href: "mailto:ipadair.maxim@gmail.com",
    action: "copy",
  },
  {
    label: "Phone",
    value: "+380 66 975 4291",
    href: "tel:+380669754291",
    action: "call",
  },
  {
    label: "GitHub",
    value: "github.com/Reshatel",
    href: "https://github.com/Reshatel",
    external: true,
    action: "open",
  },
  {
    label: "Djinni",
    value: "djinni.co/q/16ed9430a8",
    href: "https://djinni.co/q/16ed9430a8/",
    external: true,
    action: "open",
  },
];

export const CONTACT_COPY = {
  eyebrow: "Contact",
  heading: "Let’s build something worth scrolling for.",
  lead: "Open to frontend roles — remote or on-site. The fastest way to reach me is the first line below.",
};
