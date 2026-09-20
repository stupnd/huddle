import { db, type Preference } from "@/lib/supabase";
import { latestJob } from "@/lib/jobs";
import type { TripApi } from "./api";

/**
 * One server-side read of everything the dashboard needs. Used by the trip layout
 * (first paint) and by GET /api/trip/[id] (polling). Never import from a client component.
 *
 * Tables added after the MVP (itinerary_items, decision_votes, the itinerary status
 * columns) are read tolerantly: a missing table turns into a capability flag, not a 500.
 */

export type ReadResult = { ok: true; data: TripApi } | { ok: false; status: number; error: string };

export function hasSupabase() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function readTrip(id: string): Promise<ReadResult> {
  if (!hasSupabase()) {
    return {
      ok: false,
      status: 500,
      error: "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local, then restart npm run dev.",
    };
  }

  const s = db();
  const [trip, participants, messages, preferences, decisions, agents, candidates, itinerary, votes] = await Promise.all([
    s.from("trips").select("*").eq("id", id).maybeSingle(),
    s.from("participants").select("*").eq("trip_id", id).order("created_at"),
    s.from("messages").select("*").eq("trip_id", id).order("created_at"),
    s.from("preferences").select("*").eq("trip_id", id).order("updated_at"),
    s.from("decisions").select("*").eq("trip_id", id).order("created_at"),
    s.from("agents").select("*").eq("trip_id", id).order("created_at"),
    s.from("speak_candidates").select("*").eq("trip_id", id).order("created_at", { ascending: false }).limit(50),
    s.from("itinerary_items").select("*").eq("trip_id", id).order("day_index").order("sort"),
    s.from("decision_votes").select("*").eq("trip_id", id),
  ]);

  const failed = [trip, participants, messages, preferences, decisions, agents, candidates].find((r) => r.error);
  if (failed?.error) {
    return {
      ok: false,
      status: 500,
      error: `Could not read the trip from Supabase: ${failed.error.message}. If the tables are missing, run supabase/schema.sql in the Supabase SQL editor.`,
    };
  }
  if (!trip.data) {
    return { ok: false, status: 404, error: "That trip does not exist. Check the link, or start a new chat in the simulator." };
  }

  // Private values stay on the server. The dashboard shows a locked chip from the visibility flag.
  const safePreferences = ((preferences.data ?? []) as Preference[]).map((p) => (p.visibility === "private" ? { ...p, value: "" } : p));

  const itineraryRows = itinerary.error ? [] : (itinerary.data ?? []);
  const stopStatusReady = !itinerary.error && itineraryRows.length > 0 ? "status" in itineraryRows[0] : false;

  return {
    ok: true,
    data: {
      trip: trip.data,
      participants: participants.data ?? [],
      messages: messages.data ?? [],
      preferences: safePreferences,
      decisions: decisions.data ?? [],
      agents: agents.data ?? [],
      candidates: candidates.data ?? [],
      itinerary: itineraryRows,
      itineraryReady: !itinerary.error,
      votes: votes.error ? [] : (votes.data ?? []),
      votesReady: !votes.error,
      stopStatusReady,
      planJob: await latestJob(id).catch(() => null),
      loadedAt: new Date().toISOString(),
    },
  };
}
