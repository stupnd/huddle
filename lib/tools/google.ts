/**
 * Google Places and Directions, the tools that make the specialists actually different.
 * Without these every agent is the same web search in a different costume. With them the
 * stays agent knows real prices and walk times, the food agent knows real hours and ratings,
 * and the transport agent quotes real travel times instead of guesses.
 */

const KEY = process.env.GOOGLE_MAPS_API_KEY;
export const googleEnabled = () => Boolean(KEY);

export type Place = {
  name: string; address: string; rating: number | null; reviews: number | null;
  price: "free" | "$" | "$$" | "$$$" | "$$$$" | null; openNow: boolean | null; hours: string[];
  mapsUrl: string; website: string | null; photoUrl: string | null; lat: number; lng: number; types: string[];
};

const PRICE: Record<string, Place["price"]> = {
  PRICE_LEVEL_FREE: "free", PRICE_LEVEL_INEXPENSIVE: "$", PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$", PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

/** Text search: "cheap hostel near Santa Monica Pier", "brunch on Abbot Kinney". */
export async function searchPlaces(query: string, opts: { near?: string; max?: number } = {}): Promise<Place[]> {
  if (!KEY) return [];
  const textQuery = opts.near ? `${query} near ${opts.near}` : query;
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": KEY,
        "X-Goog-FieldMask": [
          "places.displayName", "places.formattedAddress", "places.rating", "places.userRatingCount",
          "places.priceLevel", "places.currentOpeningHours", "places.googleMapsUri", "places.websiteUri",
          "places.photos", "places.location", "places.types",
        ].join(","),
      },
      body: JSON.stringify({ textQuery, maxResultCount: Math.min(opts.max ?? 5, 10) }),
      signal: AbortSignal.timeout(8000),
    });
    const j: any = await res.json();
    if (!res.ok || !j.places) return [];
    return j.places.map((p: any): Place => ({
      name: p.displayName?.text ?? "",
      address: p.formattedAddress ?? "",
      rating: p.rating ?? null,
      reviews: p.userRatingCount ?? null,
      price: PRICE[p.priceLevel] ?? null,
      openNow: p.currentOpeningHours?.openNow ?? null,
      hours: p.currentOpeningHours?.weekdayDescriptions ?? [],
      mapsUrl: p.googleMapsUri ?? "",
      website: p.websiteUri ? p.websiteUri.split("?")[0] : null,
      photoUrl: p.photos?.[0]?.name
        ? `https://places.googleapis.com/v1/${p.photos[0].name}/media?maxWidthPx=800&key=${KEY}`
        : null,
      lat: p.location?.latitude ?? 0,
      lng: p.location?.longitude ?? 0,
      types: p.types ?? [],
    }));
  } catch {
    return [];
  }
}

export type Route = { mode: "driving" | "transit" | "walking"; minutes: number; miles: number; summary: string };

/** Travel time between two places for the modes a group actually considers. */
export async function getRoutes(origin: string, destination: string): Promise<Route[]> {
  if (!KEY) return [];
  const modes: Route["mode"][] = ["driving", "transit", "walking"];
  const out = await Promise.all(modes.map(async (mode) => {
    try {
      const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
      url.searchParams.set("origin", origin);
      url.searchParams.set("destination", destination);
      url.searchParams.set("mode", mode);
      url.searchParams.set("key", KEY);
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const j: any = await res.json();
      if (j.status !== "OK") return null;
      const leg = j.routes[0].legs[0];
      return {
        mode,
        minutes: Math.round(leg.duration.value / 60),
        miles: Math.round(leg.distance.value / 160.9) / 10,
        summary: j.routes[0].summary || "",
      } as Route;
    } catch {
      return null;
    }
  }));
  // Walking over 45 minutes is not a real option for a group
  return out.filter((r): r is Route => !!r && !(r.mode === "walking" && r.minutes > 45));
}

/** A compact, model-readable line per place, so the model reports facts instead of guessing them. */
export function describePlaces(places: Place[]) {
  return places.map((p) => {
    const bits = [
      p.rating ? `${p.rating}★${p.reviews ? ` (${p.reviews})` : ""}` : null,
      p.price, p.openNow === false ? "closed now" : null,
      p.address.split(",").slice(0, 2).join(","),
    ].filter(Boolean).join(" · ");
    return `- ${p.name}: ${bits}${p.website ? ` · ${p.website}` : ""}`;
  }).join("\n");
}

export function describeRoutes(from: string, to: string, routes: Route[]) {
  if (!routes.length) return `${from} -> ${to}: no route found`;
  return `${from} -> ${to}: ` + routes.map((r) => `${r.mode} ${r.minutes} min${r.mode === "driving" ? ` (${r.miles} mi)` : ""}`).join(", ");
}
