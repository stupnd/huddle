/**
 * Free place lookups with no API key.
 * Wikipedia's summary endpoint gives a thumbnail and page URL for landmarks, neighbourhoods,
 * and cities. It knows nothing about most hotels and restaurants, and that is fine: those get
 * a maps link and a coloured tile instead of a broken image.
 */

const UA = "Huddle/0.1 (trip planner; contact via github.com/stupnd/huddle)";

export type PlaceInfo = { image: string | null; wiki: string | null; caption: string | null };

const cache = new Map<string, PlaceInfo>();

export async function lookupPlace(query: string): Promise<PlaceInfo> {
  const key = query.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  const empty: PlaceInfo = { image: null, wiki: null, caption: null };
  try {
    const title = encodeURIComponent(query.trim().replace(/\s+/g, "_"));
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}?redirect=true`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) { cache.set(key, empty); return empty; }
    const j: any = await res.json();
    // Disambiguation pages have no useful image and would mislead
    if (j.type === "disambiguation") { cache.set(key, empty); return empty; }
    const info: PlaceInfo = {
      image: j.originalimage?.source ?? j.thumbnail?.source ?? null,
      wiki: j.content_urls?.desktop?.page ?? null,
      caption: j.description ?? null,
    };
    cache.set(key, info);
    return info;
  } catch {
    cache.set(key, empty);
    return empty;
  }
}

export function mapsUrl(place: string, near?: string | null) {
  const q = near ? `${place}, ${near}` : place;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
