import { NextResponse } from "next/server";
import { requireMember } from "@/lib/auth/session";
import { db } from "@/lib/supabase";

/** Per-trip switches: whether Penny the budget agent is in the chat, and the group size every cost divides by. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireMember(id);
  if (auth instanceof Response) return auth;
  const patch = await req.json();
  const s = db();
  const { data: trip, error: readErr } = await s.from("trips").select("settings").eq("id", id).maybeSingle();
  if (readErr) {
    const hint = /settings/.test(readErr.message) ? " Run supabase/schema.sql in the Supabase SQL editor to add the settings column." : "";
    return NextResponse.json({ error: readErr.message + hint }, { status: 500 });
  }
  if (!trip) return NextResponse.json({ error: "trip not found" }, { status: 404 });
  const groupSize = Number(patch.group_size);
  const settings = {
    ...(trip.settings ?? {}),
    ...(typeof patch.penny === "boolean" ? { penny: patch.penny } : {}),
    ...(Number.isInteger(groupSize) && groupSize >= 1 && groupSize <= 20 ? { group_size: groupSize } : {}),
  };
  const { error } = await s.from("trips").update({ settings }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, settings });
}
