"use client";

import { useRef } from "react";
import { gsap } from "@/lib/gsap";

type MagneticLinkProps = {
  href: string;
  children: React.ReactNode;
  className?: string;
  strength?: number;
  external?: boolean;
  /** Passed through to the anchor: a filename, or `true` for the default one. */
  download?: boolean | string;
};

/**
 * A link that gently pulls toward the cursor while hovered, and springs
 * back to rest on leave. Used for CTAs and social links across the site.
 */
export default function MagneticLink({
  href,
  children,
  className = "",
  strength = 0.35,
  external = false,
  download,
}: MagneticLinkProps) {
  const ref = useRef<HTMLAnchorElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    gsap.to(el, {
      x: x * strength,
      y: y * strength,
      duration: 0.4,
      ease: "power3.out",
    });
  };

  const handleMouseLeave = () => {
    const el = ref.current;
    if (!el) return;
    gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(1, 0.4)" });
  };

  return (
    <a
      ref={ref}
      href={href}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      {...(download ? { download: download === true ? "" : download } : {})}
    >
      {children}
    </a>
  );
}
