import { NextResponse } from "next/server";
import { db, type Preference } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Everything the dashboard and the simulator need, in one read.
 *
 * The browser never talks to Supabase directly. RLS is on, so anon reads return nothing,
 * and this route is the only way trip data reaches the page. Private preference values are
 * blanked here so a private budget never leaves the server.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local, then restart npm run dev." },
      { status: 500 }
    );
  }

  const s = db();
  const [trip, participants, messages, preferences, decisions, agents, candidates] = await Promise.all([
    s.from("trips").select("*").eq("id", id).maybeSingle(),
    s.from("participants").select("*").eq("trip_id", id).order("created_at"),
    s.from("messages").select("*").eq("trip_id", id).order("created_at"),
    s.from("preferences").select("*").eq("trip_id", id).order("updated_at"),
    s.from("decisions").select("*").eq("trip_id", id).order("created_at"),
    s.from("agents").select("*").eq("trip_id", id).order("created_at"),
    s.from("speak_candidates").select("*").eq("trip_id", id).order("created_at", { ascending: false }).limit(50),
  ]);

  const failed = [trip, participants, messages, preferences, decisions, agents, candidates].find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json(
      { error: `Could not read the trip from Supabase: ${failed.error.message}. If the tables are missing, run supabase/schema.sql in the Supabase SQL editor.` },
      { status: 500 }
    );
  }

  if (!trip.data) {
    return NextResponse.json({ error: "That trip does not exist. Check the link, or start a new chat in the simulator." }, { status: 404 });
  }

  // Private values stay on the server. The dashboard shows "set privately" from the visibility flag.
  const safePreferences = ((preferences.data ?? []) as Preference[]).map((p) =>
    p.visibility === "private" ? { ...p, value: "" } : p
  );

  return NextResponse.json({
    trip: trip.data,
    participants: participants.data ?? [],
    messages: messages.data ?? [],
    preferences: safePreferences,
    decisions: decisions.data ?? [],
    agents: agents.data ?? [],
    candidates: candidates.data ?? [],
  });
}
