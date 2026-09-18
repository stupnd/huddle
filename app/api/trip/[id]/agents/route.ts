import { NextResponse } from "next/server";
import { loadContext } from "@/lib/agents/context";
import { dismissAgent, spawnSpecialist } from "@/lib/agents/orchestrator";
import { runSpecialist } from "@/lib/agents/specialist";
import { tick } from "@/lib/agents/spokesperson";

export const maxDuration = 60;

const ROLES = ["stays", "food", "activities", "transport", "flights", "nightlife"];
const TOPIC: Record<string, string> = {
  stays: "where to stay", food: "where to eat", activities: "what to do",
  transport: "getting around", flights: "flights", nightlife: "going out",
};

/**
 * Bring a specialist into the chat from the dashboard. Same path as "@huddle find us a hotel".
 * Pass `topic` to point it at an existing thread; otherwise it gets the generic one for its role.
 * Pass `retry` with an agentId to run an existing agent again after a failure.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role, topic, retry } = await req.json();

  const ctx = await loadContext(id);
  if (!ctx.trip) return NextResponse.json({ error: "trip not found" }, { status: 404 });

  if (retry) {
    const agent = ctx.agents.find((a) => a.id === retry);
    if (!agent) return NextResponse.json({ error: "that agent is not on the trip any more" }, { status: 404 });
    await runSpecialist(agent);
    await tick(id, { force: true });
    return NextResponse.json({ ok: true, agent });
  }

  if (!ROLES.includes(role)) return NextResponse.json({ error: `role must be one of ${ROLES.join(", ")}` }, { status: 400 });
  if (ctx.agents.length >= 3) return NextResponse.json({ error: "three agents is the limit. dismiss one first." }, { status: 409 });

  const agent = await spawnSpecialist(ctx, role, typeof topic === "string" && topic.trim() ? topic.trim().slice(0, 200) : TOPIC[role]);
  if (!agent) return NextResponse.json({ error: `there is already a ${role} agent in the chat.` }, { status: 409 });

  await runSpecialist(agent);       // researches and queues its first message
  await tick(id, { force: true });  // and posts it now rather than waiting for a lull
  return NextResponse.json({ ok: true, agent });
}

/** Send an agent home from the dashboard. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { agentId } = await req.json();
  if (!agentId) return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  await dismissAgent(id, agentId);
  await tick(id, { force: true });
  return NextResponse.json({ ok: true });
}
