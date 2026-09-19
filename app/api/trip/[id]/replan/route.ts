import { NextResponse } from "next/server";
import { requireMember } from "@/lib/auth/session";
import { loadContext } from "@/lib/agents/context";
import { runSpecialist } from "@/lib/agents/specialist";
import { buildItinerary } from "@/lib/agents/planner";
import { tick } from "@/lib/agents/spokesperson";

export const maxDuration = 60;

/**
 * Redo the plan with whatever changed. Every active specialist researches again against the
 * current preferences, refreshes its options on the dashboard, and posts the update to the chat.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireMember(id);
  if (auth instanceof Response) return auth;
  const ctx = await loadContext(id);
  if (!ctx.trip) return NextResponse.json({ error: "trip not found" }, { status: 404 });
  // Specialists refresh their options first, then the itinerary is rebuilt from the result
  for (const agent of ctx.agents) await runSpecialist(agent);
  const { items } = await buildItinerary(id);
  const posted = await tick(id, { force: true });
  return NextResponse.json({
    ok: true,
    replanned: ctx.agents.length ? ctx.agents.map((a) => a.persona_name) : ["Huddle"],
    itinerary: items.length,
    posted: posted.posted,
  });
}
