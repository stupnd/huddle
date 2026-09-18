"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TripSnapshot } from "@/lib/domain/types";
import type { TripApi } from "@/lib/trip/api";
import { adaptTrip } from "@/lib/domain/adapt";

const POLL_MS = 4000;

/**
 * Keeps a server-rendered snapshot fresh by polling GET /api/trip/[id].
 * The first paint uses the snapshot the layout loaded, so there is no client
 * loading state; later reads swap in silently. Polling pauses while the tab is hidden.
 */
export function useLiveTrip(tripId: string, initial: TripSnapshot) {
  const [snapshot, setSnapshot] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const inFlight = useRef(false);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    const load = async (force = false) => {
      if (inFlight.current || (!force && document.visibilityState === "hidden")) return;
      inFlight.current = true;
      try {
        const res = await fetch(`/api/trip/${tripId}`, { cache: "no-store" });
        const body = (await res.json().catch(() => null)) as (TripApi & { error?: string }) | null;
        if (cancelled) return;
        if (!res.ok || !body) {
          setError(body?.error ?? `could not refresh the trip (${res.status})`);
          return;
        }
        setSnapshot(adaptTrip(body));
        setError(null);
      } catch {
        if (!cancelled) setError("could not reach the server. is npm run dev still running?");
      } finally {
        inFlight.current = false;
      }
    };

    const timer = setInterval(() => load(), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    if (nonce > 0) load(true);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tripId, nonce]);

  return { snapshot, error, refresh };
}
