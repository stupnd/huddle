import { db } from "@/lib/supabase";
import { hasSupabase } from "./read";

export type TripListRow = {
  id: string;
  title: string | null;
  provider: string;
  createdAt: string;
  lastAgentPostAt: string | null;
  memberCount: number;
  stopCount: number;
};

/** recent trips for the home page, newest first. server only. */
export async function listTrips(limit = 12): Promise<TripListRow[]> {
  if (!hasSupabase()) return [];
  const s = db();
  const { data: trips } = await s.from("trips").select("id,title,provider,created_at,last_agent_post_at").order("created_at", { ascending: false }).limit(limit);
  if (!trips?.length) return [];
  const ids = trips.map((t) => t.id);
  const [people, stops] = await Promise.all([
    s.from("participants").select("trip_id").in("trip_id", ids),
    s.from("itinerary_items").select("trip_id").in("trip_id", ids),
  ]);
  const count = (rows: { trip_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.trip_id === id).length;
  return trips.map((t) => ({
    id: t.id,
    title: t.title,
    provider: t.provider,
    createdAt: t.created_at,
    lastAgentPostAt: t.last_agent_post_at,
    memberCount: count(people.data, t.id),
    stopCount: count(stops.error ? null : stops.data, t.id),
  }));
}
