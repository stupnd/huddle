"use client";
import { useSyncExternalStore } from "react";
import { breakpointVar, type Breakpoint } from "@/lib/design/tokens";

/**
 * True when the viewport is at least the named Tailwind breakpoint.
 * The width is read from the stylesheet's --breakpoint-* token so CSS stays the only place a size is written.
 * Returns false during SSR and the first client render so markup matches.
 */
export function useBreakpoint(bp: Breakpoint): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = mediaQuery(bp);
      if (!mql) return () => {};
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => mediaQuery(bp)?.matches ?? false,
    () => false,
  );
}

const cache = new Map<Breakpoint, MediaQueryList>();

function mediaQuery(bp: Breakpoint): MediaQueryList | null {
  if (typeof window === "undefined") return null;
  const hit = cache.get(bp);
  if (hit) return hit;
  const width = getComputedStyle(document.documentElement).getPropertyValue(breakpointVar[bp]).trim();
  const mql = window.matchMedia(`(min-width: ${width || "0px"})`);
  cache.set(bp, mql);
  return mql;
}
