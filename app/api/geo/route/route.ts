import { NextResponse } from "next/server";

/**
 * Route between two points via the public OSRM demo server.
 * Returns duration (seconds), distance (meters), and a geojson line for the map.
 * Falls back to a straight line + haversine estimate if OSRM is down.
 */

export const runtime = "nodejs";

type Mode = "foot" | "car";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const from = parsePair(sp.get("from"));
  const to = parsePair(sp.get("to"));
  const mode = (sp.get("mode") === "car" ? "car" : "foot") as Mode;
  if (!from || !to) return NextResponse.json({ error: "need from & to as lat,lng" }, { status: 400 });

  const profile = mode === "car" ? "driving" : "foot";
  const path = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  try {
    const url = `https://router.project-osrm.org/route/v1/${profile}/${path}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const j = (await res.json()) as {
        code?: string;
        routes?: { duration: number; distance: number; geometry: { coordinates: [number, number][] } }[];
      };
      const route = j.routes?.[0];
      if (route) {
        const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
        return NextResponse.json({
          durationSec: Math.round(route.duration),
          distanceM: Math.round(route.distance),
          mode,
          coords,
          source: "osrm",
        });
      }
    }
  } catch {
    /* fall through to estimate */
  }

  const km = haversineKm(from, to);
  const durationSec = Math.round((mode === "car" ? km / 28 : km / 4.5) * 3600);
  return NextResponse.json({
    durationSec,
    distanceM: Math.round(km * 1000),
    mode,
    coords: [
      [from.lat, from.lng],
      [to.lat, to.lng],
    ] as [number, number][],
    source: "estimate",
  });
}

function parsePair(raw: string | null) {
  if (!raw) return null;
  const [a, b] = raw.split(",").map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { lat: a, lng: b };
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
