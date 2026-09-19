import { NextResponse } from "next/server";
import { requireMember } from "@/lib/auth/session";
import { db } from "@/lib/supabase";

const MIGRATION_HINT = "voting needs the decision_votes table. run supabase/schema.sql in the Supabase SQL editor, then try again.";

/** Place or move one person's vote on a thread. One vote per person per thread. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireMember(id);
  if (auth instanceof Response) return auth;
  const { decisionId, participantId, optionLabel } = await req.json();
  if (!decisionId || !participantId || !optionLabel) return NextResponse.json({ error: "decisionId, participantId and optionLabel are required" }, { status: 400 });

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
  const { decisionId, participantId } = await req.json();
  const { error } = await db().from("decision_votes").delete().eq("trip_id", id).eq("decision_id", decisionId).eq("participant_id", participantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
