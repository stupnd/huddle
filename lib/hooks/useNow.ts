"use client";
import { useEffect, useState } from "react";

/** a ticking clock for relative timestamps. one interval per component, cleaned up on unmount */
export function useNow(everyMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
