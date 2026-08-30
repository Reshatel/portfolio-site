"use client";

import { useEffect, useState } from "react";
import { useLenis } from "lenis/react";
import { ScrollTrigger } from "@/lib/gsap";
import { ThreadProvider } from "@/components/thread/SiteThread";
import Preloader from "@/components/sections/Preloader";
import Hero from "@/components/sections/Hero";
import About from "@/components/sections/About";
import Stack from "@/components/sections/Stack";
import Experience from "@/components/sections/Experience";
import Projects from "@/components/sections/Projects";
import Education from "@/components/sections/Education";
import FeaturedCollaboration from "@/components/sections/FeaturedCollaboration";
import Contact from "@/components/sections/Contact";
import Footer from "@/components/sections/Footer";

export default function Home() {
  const [loaded, setLoaded] = useState(false);
  const lenis = useLenis();

  // Keep the page pinned to the hero while the preloader is up, then hand
  // scrolling back over and let ScrollTrigger re-measure the final layout.
  useEffect(() => {
    if (!lenis) return;

    if (loaded) {
      lenis.start();
      ScrollTrigger.refresh();
      return;
    }

    lenis.scrollTo(0, { immediate: true, force: true });
    lenis.stop();
  }, [lenis, loaded]);

  return (
    <ThreadProvider>
      {!loaded && <Preloader onComplete={() => setLoaded(true)} />}
      <main>
        <Hero loaded={loaded} />
        <About />
        <Stack />
        <Experience />
        <Projects />
        <Education />
        <FeaturedCollaboration />
        <Contact />
      </main>
      <Footer />
    </ThreadProvider>
  );
}
