import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { tick } from "@/lib/agents/spokesperson";
import { simulatorEnabled } from "@/lib/messaging/simulator";

export const maxDuration = 60;

/**
 * Runs the speak gate for every trip with pending messages.
 * Call every 15 to 30 seconds from Supabase pg_cron (production) or the simulator page (dev).
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const isSim = simulatorEnabled();
  // An unset or empty TICK_SECRET never authorizes anything
  const secret = process.env.TICK_SECRET;
  const hasSecret = Boolean(secret) && req.headers.get("x-tick-secret") === secret;
  if (!isSim && !hasSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const force = url.searchParams.get("force") === "1" && isSim;
  const onlyTrip = url.searchParams.get("trip");

  const { data } = await db().from("speak_candidates").select("trip_id").eq("status", "pending");
  const tripIds = [...new Set((data ?? []).map((r) => r.trip_id))].filter((id) => !onlyTrip || id === onlyTrip);
  const results = [];
  for (const id of tripIds) results.push({ trip: id, ...(await tick(id, { force })) });
  return NextResponse.json({ results });
}
