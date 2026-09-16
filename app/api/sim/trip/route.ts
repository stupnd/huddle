import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

/** Looks up the trip for a simulator group so the sim page can subscribe to it. */
export async function GET(req: Request) {
  const groupId = new URL(req.url).searchParams.get("groupId");
  const { data } = await db().from("trips").select("id").eq("provider", "simulator").eq("provider_group_id", groupId).maybeSingle();
  return NextResponse.json({ tripId: data?.id ?? null });
}
