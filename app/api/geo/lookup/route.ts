import { NextResponse } from "next/server";

/**
 * Geocode a place name via Nominatim. Cached in-memory so the map can resolve
 * a day's stops without hammering OSM. Query should include the city when known.
 */

export const runtime = "nodejs";

type Hit = { lat: number; lng: number; label: string };
const cache = new Map<string, Hit | null>();
const UA = "Huddle/0.1 (trip planner; https://github.com/stupnd/huddle)";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ error: "missing q" }, { status: 400 });

  const key = q.toLowerCase();
  if (cache.has(key)) {
    const hit = cache.get(key);
    return hit ? NextResponse.json(hit) : NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 60 * 60 * 24 * 7 },
    });
    if (!res.ok) {
      cache.set(key, null);
      return NextResponse.json({ error: "upstream" }, { status: 502 });
    }
    const rows = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    if (!rows[0]) {
      cache.set(key, null);
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const hit: Hit = {
      lat: Number(rows[0].lat),
      lng: Number(rows[0].lon),
      label: rows[0].display_name,
    };
    cache.set(key, hit);
    return NextResponse.json(hit);
  } catch {
    return NextResponse.json({ error: "lookup failed" }, { status: 502 });
  }
}
