"use client";

import { useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/lib/gsap";

export default function Preloader({ onComplete }: { onComplete: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);

  useGSAP(
    () => {
      const counter = { value: 0 };

      const tl = gsap.timeline({
        onComplete: () => {
          gsap.to(rootRef.current, {
            yPercent: -100,
            duration: 0.9,
            ease: "power4.inOut",
            onComplete,
          });
        },
      });

      tl.to(counter, {
        value: 100,
        duration: 1.3,
        ease: "power2.inOut",
        onUpdate: () => setCount(Math.round(counter.value)),
      }).to({}, { duration: 0.2 });
    },
    { scope: rootRef },
  );

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-paper"
    >
      <span className="mb-4 font-body text-xs uppercase tracking-[0.35em] text-ink-muted">
        Maksym Ostapchuk
      </span>
      <span className="font-display text-6xl font-semibold tabular-nums text-ink md:text-8xl">
        {count}
      </span>
    </div>
  );
}
