"use client";
import { useCallback, useEffect, useState } from "react";

/**
 * A per-viewer convenience stored in localStorage: a pinned drawer, a collapsed
 * section. Never for shared state. Reads and writes are wrapped because storage
 * can be blocked, full, or absent in a private window.
 */
export function useLocalPref<T extends string | boolean | number>(key: string, fallback: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`huddle:${key}`);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      /* storage unavailable: keep the fallback */
    }
  }, [key]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(`huddle:${key}`, JSON.stringify(next));
      } catch {
        /* storage unavailable: state still updates for this session */
      }
    },
    [key],
  );

  return [value, update];
}
