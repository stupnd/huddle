import { NextResponse } from "next/server";
import { requireMember } from "@/lib/auth/session";

async function participantFor(tripId: string, phone: string) {
  const { data } = await db().from("participants").select("id").eq("trip_id", tripId).eq("address", phone).maybeSingle();
  return data?.id ?? null;
}
import { db } from "@/lib/supabase";

const MIGRATION_HINT = "voting needs the decision_votes table. run supabase/schema.sql in the Supabase SQL editor, then try again.";

/** Place or move one person's vote on a thread. One vote per person per thread. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireMember(id);
  if (auth instanceof Response) return auth;
  const { decisionId, optionLabel } = await req.json();
  if (!decisionId || !optionLabel) return NextResponse.json({ error: "decisionId and optionLabel are required" }, { status: 400 });
  // The voter is the signed-in person. Trusting a participantId from the browser let any member vote as any other.
  const participantId = await participantFor(id, auth.phone);
  if (!participantId) return NextResponse.json({ error: "Only people in this trip can vote." }, { status: 403 });

  const { error } = await db()
    .from("decision_votes")
    .upsert({ trip_id: id, decision_id: decisionId, participant_id: participantId, option_label: optionLabel, created_at: new Date().toISOString() }, { onConflict: "decision_id,participant_id" });
  if (error) {
    const missing = /relation|schema cache|does not exist/i.test(error.message);
    return NextResponse.json({ error: missing ? MIGRATION_HINT : error.message }, { status: missing ? 409 : 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Take a vote back. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireMember(id);
  if (auth instanceof Response) return auth;
  const { decisionId } = await req.json();
  const participantId = await participantFor(id, auth.phone);
  if (!participantId) return NextResponse.json({ error: "Only people in this trip can vote." }, { status: 403 });
  const { error } = await db().from("decision_votes").delete().eq("trip_id", id).eq("decision_id", decisionId).eq("participant_id", participantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
