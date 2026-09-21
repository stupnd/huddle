import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { DigestState } from "./agents/digest-state";

let admin: SupabaseClient | null = null;

/** Server-side client with the service role key. Never import in client components. */
export function db(): SupabaseClient {
  if (!admin) {
    admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
  }
  return admin;
}

/**
 * Browser client with the anon key. Unused: RLS is on and no policies are defined, so reads
 * through this return nothing. The dashboard and simulator go through /api/trip/[id] instead.
 */
export function browserDb(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export type Trip = {
  id: string;
  provider: string;
  provider_group_id: string;
  title: string | null;
  status: "active" | "archived";
  activity_level: "quiet" | "normal" | "active" | "paused";
  debate_mode: "off" | "highlights" | "full";
  last_agent_post_at: string | null;
  settings?: {
    penny?: boolean;
    hero_image?: string | null;
    hero_wiki?: string | null;
    hero_caption?: string | null;
    mention_mode?: "call_out" | "listen_in";
    budget_check?: { signature: string; flagged_at: string }; // the last plan-over-budget alert, so the same one is not repeated
    digest?: DigestState; // the numbered open-decisions list, so a later answer can be matched to an item
    monitor?: {
      last_checked_at?: string;
      issues?: { claim: string; contradicts: string; severity: 1 | 2 | 3; at: string; speaker?: string }[];
    };
  };
  created_at: string;
};

export type Participant = { id: string; trip_id: string; address: string; display_name: string | null };
export type Message = {
  id: string; trip_id: string; participant_id: string | null;
  sender_type: "human" | "agent"; persona: string | null; content: string; created_at: string;
};
export type Preference = {
  id: string; trip_id: string; participant_id: string; category: string; value: string;
  visibility: "private" | "group"; source_message_id: string | null; confirmed: boolean; updated_at: string;
};
export type Decision = {
  id: string; trip_id: string; topic: string; status: "open" | "debating" | "proposed" | "decided";
  options: { label: string; details?: string; est_cost_per_person?: number }[]; chosen: string | null;
  created_at: string; updated_at: string;
};
export type Agent = {
  id: string; trip_id: string; kind: string; role: string; persona_name: string; emoji: string;
  task: string; champions: string | null; decision_id: string | null; status: "active" | "left";
};

export type ItineraryItem = {
  id: string; trip_id: string; day_label: string; day_index: number; start_time: string | null;
  title: string; place: string | null; notes: string | null;
  maps_url: string | null; wiki_url: string | null; image_url: string | null;
  category: string | null; est_cost_per_person: number | null; lat: number | null; lng: number | null;
  duration_min: number | null; travel_from_prev_min: number | null; sort: number;
};

export type Job = {
  id: string; trip_id: string; kind: "plan" | "replan"; status: "queued" | "running" | "done" | "failed";
  announce: boolean; error: string | null; created_at: string; started_at: string | null; finished_at: string | null;
};
