import { db, type ItineraryItem } from "../supabase";
import { askJSON, MODELS } from "./claude";
import { describe, loadContext } from "./context";
import { lookupPlace, mapsUrl } from "../places";

type PlannedItem = {
  day_label: string; day_index: number; start_time?: string; title: string;
  place?: string; place_query?: string; notes?: string;
  category?: string; est_cost_per_person?: number;
};
const CATEGORIES = ["stays", "food", "activities", "transport", "nightlife"];
type Plan = { destination_query?: string; items: PlannedItem[]; summary: string };

/**
 * Turns everything the group has settled so far into a day-by-day itinerary with real places,
 * then decorates each stop with a photo and links. Replaces any previous itinerary for the trip.
 * Posts a two-line summary to the chat so the group knows the plan changed.
 */
export async function buildItinerary(tripId: string): Promise<{ items: ItineraryItem[]; summary: string }> {
  const ctx = await loadContext(tripId);
  const s = db();

  const plan = await askJSON<Plan>(
    {
      model: MODELS.agent,
      webSearch: true,
      maxTokens: 3000,
      system: `You are the planner inside Huddle, a group trip planner. Turn what this group has decided and asked for into a concrete day-by-day itinerary.

Rules:
- Only include days the trip actually covers. Use what people said about arrival and departure.
- Every item is a real, specific place or action with a time. "Lunch somewhere" is not an item; "lunch at Gjelina, Abbot Kinney" is.
- Respect decided items exactly. For open decisions, pick the option that best fits the group's stated preferences and say so in notes.
- Keep travel time realistic. Do not schedule two things across town within 30 minutes.
- 4 to 7 items per day. Include getting around when it matters (airport transfer, a long drive).
- notes: one short line, the practical detail that matters (cost, how to get there, why this one). No fluff.
- place_query: the name Wikipedia would know, for a photo. For a landmark or neighbourhood use its proper name ("Griffith Observatory", "Venice Beach"). For a hotel or restaurant leave it out.
- destination_query: the city's proper name for a hero photo ("Los Angeles").
- category: one of stays, food, activities, transport, nightlife.
- est_cost_per_person: a realistic number in dollars for this stop, per person. 0 if free. Split shared costs (a hotel room, an uber) across the group size you can see. Use real prices from search where you can.
- summary: two short lines for the group chat announcing the plan, no preamble.

Reply with JSON only:
{"destination_query": "Los Angeles", "summary": "plan's up: sat is venice + the pier, sun is griffith + weho\\nfull timeline is on the dashboard",
 "items": [{"day_label": "Saturday, Sep 19", "day_index": 0, "start_time": "1:00pm", "title": "Land at LAX", "place": "Los Angeles International Airport", "place_query": "Los Angeles International Airport", "notes": "uber to santa monica is 25 to 40 min, about $35", "category": "transport", "est_cost_per_person": 18}]}`,
      prompt: describe(ctx),
    },
    { items: [], summary: "" }
  );

  if (!plan.items.length) return { items: [], summary: "" };

  // Photos and links, resolved once and stored so the page never has to fetch them
  const near = plan.destination_query ?? ctx.trip.title ?? undefined;
  const rows = await Promise.all(
    plan.items.map(async (it, i) => {
      const info = it.place_query ? await lookupPlace(it.place_query) : { image: null, wiki: null, caption: null };
      return {
        trip_id: tripId,
        day_label: it.day_label,
        day_index: it.day_index ?? 0,
        start_time: it.start_time ?? null,
        title: it.title,
        place: it.place ?? null,
        notes: it.notes ?? null,
        maps_url: it.place ? mapsUrl(it.place, near) : null,
        wiki_url: info.wiki,
        image_url: info.image,
        category: CATEGORIES.includes(it.category ?? "") ? it.category : null,
        est_cost_per_person: typeof it.est_cost_per_person === "number" && it.est_cost_per_person >= 0 ? Math.round(it.est_cost_per_person) : null,
        sort: i,
      };
    })
  );

  await s.from("itinerary_items").delete().eq("trip_id", tripId);
  const { data: inserted, error } = await s.from("itinerary_items").insert(rows).select();
  if (error) console.error("[planner] could not save itinerary", error.message);

  // Hero photo for the trip page
  if (plan.destination_query) {
    const hero = await lookupPlace(plan.destination_query);
    if (hero.image) {
      const settings = { ...(ctx.trip.settings ?? {}), hero_image: hero.image, hero_wiki: hero.wiki, hero_caption: hero.caption };
      await s.from("trips").update({ settings }).eq("id", tripId);
    }
  }

  if (plan.summary) {
    await s.from("speak_candidates").insert({
      trip_id: tripId, speaker: "huddle", trigger: "decision_ready", urgency: 2, content: plan.summary, seq: 0,
    });
  }

  return { items: (inserted ?? []) as ItineraryItem[], summary: plan.summary };
}
