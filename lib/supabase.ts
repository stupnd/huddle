import { createClient, SupabaseClient } from "@supabase/supabase-js";

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
};
export type Agent = {
  id: string; trip_id: string; kind: string; role: string; persona_name: string; emoji: string;
  task: string; champions: string | null; decision_id: string | null; status: "active" | "left";
};

export type ItineraryItem = {
  id: string; trip_id: string; day_label: string; day_index: number; start_time: string | null;
  title: string; place: string | null; notes: string | null;
  maps_url: string | null; wiki_url: string | null; image_url: string | null;
  category: string | null; est_cost_per_person: number | null; sort: number;
};
