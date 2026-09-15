"use client";

/**
 * Floating scroll control for the long public pages.
 *
 * Hidden at rest: it only appears once the reader has actually scrolled, so it
 * never covers hero content or competes with the first CTA. The down arrow
 * drops out near the end of the page rather than sitting there inert, because a
 * control that cannot do anything is worse than no control.
 *
 * Scroll position is read through requestAnimationFrame rather than on every
 * scroll event, and the listener is passive, so this cannot make scrolling
 * janky on the pages whose whole job is to feel smooth.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";

/** Far enough down that the control never overlaps the hero. */
const SHOW_AFTER_PX = 400;
/** Within this much of the bottom, "jump to end" has nothing left to do. */
const BOTTOM_SLACK_PX = 120;

export function ScrollTop() {
  const [visible, setVisible] = useState(false);
  const [canGoDown, setCanGoDown] = useState(true);
  const ticking = useRef(false);

  useEffect(() => {
    const read = () => {
      ticking.current = false;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setVisible(y > SHOW_AFTER_PX);
      setCanGoDown(max - y > BOTTOM_SLACK_PX);
    };
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      window.requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  /**
   * Honor the reduced-motion preference explicitly. A CSS `scroll-behavior`
   * rule would be overridden by this programmatic call, so the choice has to
   * be made here rather than left to the stylesheet.
   */
  const scrollTo = useCallback((top: number) => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
  }, []);

  return (
    <div
      className={
        "fixed bottom-6 right-4 z-40 flex flex-col gap-1 rounded-full border bg-background/90 p-1 shadow-lg backdrop-blur transition-all duration-200 sm:right-6 " +
        (visible
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0")
      }
      // Hidden from assistive tech while it is visually hidden, so a screen
      // reader never lands on a control the page is not currently offering.
      aria-hidden={!visible}
    >
      <button
        type="button"
        onClick={() => scrollTo(0)}
        tabIndex={visible ? 0 : -1}
        aria-label="Scroll back to top"
        className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ArrowUp className="h-4 w-4" aria-hidden />
      </button>
      {canGoDown && (
        <button
          type="button"
          onClick={() => scrollTo(document.documentElement.scrollHeight)}
          tabIndex={visible ? 0 : -1}
          aria-label="Scroll to the end of the page"
          className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ArrowDown className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
