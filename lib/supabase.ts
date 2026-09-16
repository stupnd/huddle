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

/** Browser client with the anon key, for realtime subscriptions. */
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
  activity_level: "quiet" | "normal" | "active" | "paused";
  debate_mode: "off" | "highlights" | "full";
  last_agent_post_at: string | null;
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
