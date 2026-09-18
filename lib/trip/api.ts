import type { Agent, Decision, ItineraryItem, Message, Participant, Preference, Trip } from "@/lib/supabase";

/**
 * The JSON shape of GET /api/trip/[id]. Shared by the server reader, the route,
 * the client poller and the adapter. No server imports here so the browser can use it.
 */

export type SpeakCandidate = {
  id: string;
  speaker: string;
  trigger: string;
  urgency: number;
  content: string;
  status: "pending" | "posted" | "dropped";
  reason: string | null;
  created_at: string;
  posted_at: string | null;
};

/** one row of decision_votes. absent until schema.sql has been re-run */
export type VoteRow = {
  id: string;
  trip_id: string;
  decision_id: string;
  participant_id: string;
  option_label: string;
  created_at: string;
};

/** itinerary_items plus the optional status columns added by the dashboard migration */
export type ItineraryRow = ItineraryItem & {
  created_at: string;
  status?: "locked" | "proposed" | "contested" | "dropped" | null;
  dropped_reason?: string | null;
  dropped_by?: string | null;
  dropped_at?: string | null;
};

export type TripApi = {
  trip: Trip & { settings?: Trip["settings"] & { group_size?: number } };
  participants: Participant[];
  messages: Message[];
  preferences: Preference[];
  decisions: (Decision & { created_at: string; updated_at: string })[];
  agents: (Agent & { created_at: string })[];
  candidates: SpeakCandidate[];
  itinerary: ItineraryRow[];
  itineraryReady: boolean;
  votes: VoteRow[];
  votesReady: boolean;
  stopStatusReady: boolean;
  loadedAt: string;
};
