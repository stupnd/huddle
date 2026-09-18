import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

/**
 * Settle a thread from the dashboard. Marks it decided and queues a one-line note
 * from Huddle so the group chat hears about it at the next lull.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { decisionId, chosen, reopen } = await req.json();
  if (!decisionId) return NextResponse.json({ error: "decisionId is required" }, { status: 400 });
  const s = db();

  if (reopen) {
    const { error } = await s.from("decisions").update({ status: "open", chosen: null, updated_at: new Date().toISOString() }).eq("id", decisionId).eq("trip_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const pick = String(chosen ?? "").trim().slice(0, 200);
  if (!pick) return NextResponse.json({ error: "chosen is required" }, { status: 400 });

  const { data: decision, error } = await s
    .from("decisions")
    .update({ status: "decided", chosen: pick, updated_at: new Date().toISOString() })
    .eq("id", decisionId)
    .eq("trip_id", id)
    .select("topic")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await s.from("speak_candidates").insert({
    trip_id: id,
    speaker: "huddle",
    trigger: "decision_ready",
    urgency: 2,
    content: `settled on the dashboard: ${decision.topic.toLowerCase()} is ${pick.toLowerCase()}. replan when you want it on the timeline.`,
  });

  return NextResponse.json({ ok: true });
}
