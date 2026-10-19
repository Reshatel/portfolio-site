import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./globals.css";
import SmoothScrollProvider from "@/components/providers/SmoothScrollProvider";
import { SITE_URL } from "@/lib/site";
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const TITLE = "Maksym Ostapchuk — Frontend Developer";
const DESCRIPTION =
  "Frontend developer building fast, interactive interfaces with React, Next.js, TypeScript and GSAP.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Maksym Ostapchuk — Portfolio",
  authors: [{ name: "Maksym Ostapchuk" }],
  creator: "Maksym Ostapchuk",
  keywords: [
    "frontend developer",
    "React",
    "Next.js",
    "TypeScript",
    "GSAP",
    "Three.js",
    "portfolio",
  ],
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: TITLE,
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

// Runs before the browser gets a chance to restore the previous scroll
// position on reload, so the page always starts at the hero.
const NO_SCROLL_RESTORE = `
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
window.scrollTo(0, 0);
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${bricolage.variable} ${inter.variable}`}>
      <body className="bg-paper text-ink font-body antialiased">
        <script dangerouslySetInnerHTML={{ __html: NO_SCROLL_RESTORE }} />
        <SmoothScrollProvider>{children}</SmoothScrollProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
