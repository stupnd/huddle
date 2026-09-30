import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { simulatorEnabled } from "@/lib/messaging/simulator";

/** Looks up the trip for a simulator group so the sim page can subscribe to it. */
export async function GET(req: Request) {
  if (!simulatorEnabled()) return NextResponse.json({ error: "The simulator is off" }, { status: 403 });
  const groupId = new URL(req.url).searchParams.get("groupId");
  const { data } = await db().from("trips").select("id").eq("provider", "simulator").eq("provider_group_id", groupId).eq("status", "active").maybeSingle();
  return NextResponse.json({ tripId: data?.id ?? null });
}
