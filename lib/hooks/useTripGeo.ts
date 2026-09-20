"use client";
import { useEffect, useMemo, useState } from "react";
import type { Stop } from "@/lib/domain/types";

export type LatLng = { lat: number; lng: number; label?: string };

export type StopPin = {
  stop: Stop;
  coord: LatLng;
  /** 1-based index within the filtered sequence */
  n: number;
};

export type Leg = {
  fromId: string;
  toId: string;
  durationSec: number;
  distanceM: number;
  mode: "foot" | "car";
  coords: [number, number][];
  source: string;
};

/**
 * Resolve map pins for stops (Nominatim) and legs between consecutive stops (OSRM).
 * Walk under ~1.4km, otherwise drive — keeps downtown hops on foot.
 */
export function useTripGeo(stops: Stop[], near: string) {
  const [pins, setPins] = useState<StopPin[]>([]);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = useMemo(
    () => stops.map((s) => `${s.id}:${s.place.name}`).join("|") + `::${near}`,
    [stops, near],
  );

  useEffect(() => {
    if (stops.length === 0) {
      setPins([]);
      setLegs([]);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const resolved: StopPin[] = [];
        for (let i = 0; i < stops.length; i++) {
          const stop = stops[i];
          if (stop.place.lat != null && stop.place.lng != null) {
            resolved.push({
              stop,
              n: i + 1,
              coord: { lat: stop.place.lat, lng: stop.place.lng, label: stop.place.name },
            });
            continue;
          }
          const q = near ? `${stop.place.name}, ${near}` : stop.place.name;
          const res = await fetch(`/api/geo/lookup?q=${encodeURIComponent(q)}`);
          if (!res.ok) continue;
          const hit = (await res.json()) as LatLng;
          if (cancelled) return;
          resolved.push({ stop, n: i + 1, coord: hit });
        }
        if (cancelled) return;

        // A name-based geocode can land on the wrong continent. Anything more than 150 km from
        // the median of the other pins is a wrong guess, not a real stop, so drop it from the map.
        const sane = dropOutliers(resolved, 150);
        setPins(sane);

        const nextLegs: Leg[] = [];
        for (let i = 0; i < sane.length - 1; i++) {
          const a = sane[i];
          const b = sane[i + 1];
          const km = haversineKm(a.coord, b.coord);
          const mode: "foot" | "car" = km < 1.4 ? "foot" : "car";
          const res = await fetch(
            `/api/geo/route?from=${a.coord.lat},${a.coord.lng}&to=${b.coord.lat},${b.coord.lng}&mode=${mode}`,
          );
          if (!res.ok) continue;
          const body = (await res.json()) as Omit<Leg, "fromId" | "toId">;
          if (cancelled) return;
          // Six hours or 300 km between two stops on one day means the routing is wrong, not the plan
          if (body.durationSec > 6 * 3600 || body.distanceM > 300_000) continue;
          nextLegs.push({ ...body, fromId: a.stop.id, toId: b.stop.id });
        }
        if (cancelled) return;
        setLegs(nextLegs);
      } catch {
        if (!cancelled) setError("could not place stops on the map");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed by stop list + near

  return { pins, legs, loading, error };
}

export function formatTravel(durationSec: number, distanceM: number, mode: "foot" | "car") {
  const mins = Math.max(1, Math.round(durationSec / 60));
  const dist =
    distanceM < 1000 ? `${Math.round(distanceM)} m` : `${(distanceM / 1000).toFixed(distanceM < 10000 ? 1 : 0)} km`;
  const verb = mode === "foot" ? "walk" : "drive";
  return { mins, dist, verb, label: `${mins} min ${verb} · ${dist}` };
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Pins further than `km` from the median of the others are treated as failed geocodes. */
function dropOutliers(pins: StopPin[], km: number): StopPin[] {
  if (pins.length < 3) return pins;
  const lats = pins.map((p) => p.coord.lat).sort((a, b) => a - b);
  const lngs = pins.map((p) => p.coord.lng).sort((a, b) => a - b);
  const mid = { lat: lats[Math.floor(lats.length / 2)], lng: lngs[Math.floor(lngs.length / 2)] };
  return pins.filter((p) => haversineKm(p.coord, mid) <= km);
}
