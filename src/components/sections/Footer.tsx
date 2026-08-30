"use client";

import { useLenis } from "lenis/react";

/* ------------------------------------------------------------------ */
/*  Footer                                                             */
/*                                                                     */
/*  It draws no rule of its own, and it does not need one: the thread   */
/*  that has been running since the hero comes loose in the section     */
/*  above and lands in a heap on the edge between the two. That heap is */
/*  the rule — the only one on the site put there by gravity rather     */
/*  than by the pen.                                                    */
/*                                                                     */
/*  Its arrival is caused by the fall as well: Contact flags itself     */
/*  `data-landed` the moment the rope touches down, and the CSS carries */
/*  that across the sibling boundary. Deliberately quiet after all the  */
/*  motion above it — the loudest thing here is a monogram.             */
/* ------------------------------------------------------------------ */

export default function Footer() {
  const lenis = useLenis();

  return (
    <footer className="ft">
      <div className="ft-inner ft-rise">
        <div className="ft-id">
          <span className="ft-mark font-display">M.O.</span>
          <span className="ft-place font-body">Kropyvnytskyi, Ukraine</span>
        </div>

        <p className="ft-note font-body">
          © 2026 Maksym Ostapchuk
          <span aria-hidden className="ft-dot" />
          Built with Next.js, GSAP, and probably too many easing curves.
        </p>

        <div className="ft-side">
          <a
            className="ft-link font-body"
            href="https://github.com/Reshatel"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <a
            className="ft-link font-body"
            href="https://djinni.co/q/16ed9430a8/"
            target="_blank"
            rel="noreferrer"
          >
            Djinni
          </a>
          <button
            type="button"
            className="ft-top font-body"
            onClick={() => lenis?.scrollTo(0, { duration: 1.4 })}
          >
            <span aria-hidden className="ft-top-arrow">
              <svg viewBox="0 0 14 22" fill="none">
                <path d="M7 21 C 8 14 6 8 7 1 M7 1 L2 6 M7 1 L12 6" />
              </svg>
            </span>
            Back to top
          </button>
        </div>
      </div>
    </footer>
  );
}
