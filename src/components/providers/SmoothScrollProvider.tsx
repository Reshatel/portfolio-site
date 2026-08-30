"use client";

import { ReactLenis, useLenis } from "lenis/react";
import { useEffect } from "react";
import { gsap, ScrollTrigger } from "@/lib/gsap";

/**
 * Wires Lenis' scroll updates into GSAP's ticker + ScrollTrigger.
 * Must render as a descendant of <ReactLenis root> so useLenis() resolves.
 */
function LenisGsapSync() {
  const lenis = useLenis();

  useEffect(() => {
    if (!lenis) return;

    lenis.on("scroll", ScrollTrigger.update);

    const update = (time: number) => {
      // gsap.ticker time is in seconds, lenis.raf expects milliseconds
      lenis.raf(time * 1000);
    };

    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(update);
    };
  }, [lenis]);

  return null;
}

/**
 * Guarantees every page load starts at the very top, whatever scroll offset
 * the browser (or bfcache) tries to restore.
 */
function ScrollReset() {
  const lenis = useLenis();

  useEffect(() => {
    if (!lenis) return;

    const toTop = () => {
      lenis.scrollTo(0, { immediate: true, force: true });
      window.scrollTo(0, 0);
      ScrollTrigger.refresh();
    };

    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    toTop();
    // Some browsers restore the offset after `load`; re-assert once more.
    const onLoad = () => toTop();
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) toTop();
    };

    window.addEventListener("load", onLoad);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      window.removeEventListener("load", onLoad);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [lenis]);

  return null;
}

export default function SmoothScrollProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ReactLenis
      root
      options={{
        lerp: 0.1,
        duration: 1.2,
        smoothWheel: true,
        // We drive Lenis manually from gsap.ticker for perfect sync with ScrollTrigger
        autoRaf: false,
      }}
    >
      <LenisGsapSync />
      <ScrollReset />
      {children}
    </ReactLenis>
  );
}
