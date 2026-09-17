import { db, type Agent } from "../supabase";
import { askJSON, MODELS } from "./claude";
import { describe, findDecision, loadContext, type TripContext } from "./context";
import { pickChildPersona } from "./personas";

type Plan = {
  action: "none" | "spawn_specialist" | "start_debate" | "retire_agents";
  role?: string;              // stays | flights | transport | food | activities | nightlife
  topic?: string;             // the decision topic
  reason?: string;
  sides?: string[];           // for debates: 2 options to champion
  retire_agent_ids?: string[];
};

const SYSTEM = `You are the Orchestrator inside Huddle, a group trip planner in an iMessage group chat. You never talk in the chat.
You decide whether the group needs a specialist agent right now.

Choose ONE action:
- "none": nothing needed. This is the right answer most of the time.
- "spawn_specialist": the group is going back and forth on a topic (where to stay, how to get there, where to eat) and nobody has concrete options. Provide role, topic, reason.
- "start_debate": there is a contested decision with 2 clear sides that people disagree on. Provide role, topic, reason, and sides (exactly 2 short option labels).
- "retire_agents": a decision is done and child agents working on it should leave. Provide retire_agent_ids.

Never spawn an agent for a topic that already has an active agent. Max 2 active child agents (3 during a debate).
Reply with JSON only: {"action": "none"}`;

/**
 * The model names roles freely ("Lodging Specialist"), but the emoji map and the
 * duplicate-agent guard both key off a fixed set, so fold synonyms back onto it.
 */
const ROLE_SYNONYMS: [RegExp, string][] = [
  [/stay|lodg|hotel|hostel|airbnb|accom/, "stays"],
  [/flight|airfare|airline/, "flights"],
  [/transport|transit|train|bus|getting around|rental car/, "transport"],
  [/nightlife|bar|club|party/, "nightlife"],
  [/food|eat|restaurant|dining|brunch|cafe/, "food"],
  [/activit|thing to do|attraction|sightsee|itinerar/, "activities"],
  [/weather|forecast/, "weather"],
  [/destination|where to go|city|country/, "destination"],
  [/guide|local|itinerary|planner/, "activities"],
];

function normalizeRole(raw: string) {
  const r = raw.toLowerCase();
  return ROLE_SYNONYMS.find(([re]) => re.test(r))?.[1] ?? r.trim();
}

/** The plan, plus any agents it just spawned so the pipeline can run them. */
type PlanResult = Plan & { agents?: Agent[] };

export async function runOrchestrator(ctx: TripContext, depth = 0): Promise<PlanResult> {
  if (ctx.trip.activity_level === "paused") return { action: "none" } as Plan;

  const plan = await askJSON<Plan>(
    {
      model: MODELS.agent,
      system: SYSTEM,
      prompt: `${describe(ctx)}\n\nACTIVE CHILD AGENT IDS: ${ctx.agents.map((a) => `${a.id}=${a.persona_name}/${a.role}`).join(", ") || "none"}`,
      maxTokens: 500,
    },
    { action: "none" }
  );

  if (plan.role) plan.role = normalizeRole(plan.role);

  const s = db();
  // Includes agents that already left. Reusing a retired name reads as one agent
  // saying goodbye and immediately coming back as somebody else.
  const { data: everSpawned } = await s.from("agents").select("persona_name").eq("trip_id", ctx.trip.id);
  const taken = (everSpawned ?? []).map((a) => a.persona_name);

  if (plan.action === "retire_agents" && plan.retire_agent_ids?.length) {
    for (const id of plan.retire_agent_ids) {
      const agent = ctx.agents.find((a) => a.id === id);
      if (!agent) continue;
      await s.from("agents").update({ status: "left" }).eq("id", id);
      await s.from("speak_candidates").insert({
        trip_id: ctx.trip.id, speaker: id, trigger: "signoff", urgency: 1,
        content: "That's settled, so I'm heading out. Details are in the app. Bye!",
      });
    }
    // Retiring frees a slot. Without this, a request that arrives while the agent cap is
    // full gets silently dropped instead of spawning the specialist it asked for.
    if (depth === 0) {
      const next = await runOrchestrator(await loadContext(ctx.trip.id), 1);
      if (next.action !== "none") return next;
    }
    return plan;
  }

  if (!plan.role || !plan.topic) return plan;
  if (ctx.agents.some((a) => a.role === plan.role)) return { action: "none" } as Plan;

  let decision = findDecision(ctx.decisions, plan.topic);
  if (!decision) {
    const { data } = await s.from("decisions").insert({ trip_id: ctx.trip.id, topic: plan.topic, status: "open" }).select().single();
    decision = data as any;
  }

  if (plan.action === "spawn_specialist" && ctx.agents.length < 2) {
    const persona = pickChildPersona(taken, plan.role);
    const { data: agent } = await s.from("agents").insert({
      trip_id: ctx.trip.id, kind: "child", role: plan.role, persona_name: persona.name, emoji: persona.emoji,
      task: `Find options for: ${plan.topic}`, decision_id: decision!.id,
    }).select().single();
    return { ...plan, agents: [agent] };
  }

  if (plan.action === "start_debate" && plan.sides?.length === 2 && ctx.trip.debate_mode !== "off" && ctx.agents.length < 2) {
    const spawned = [];
    for (const side of plan.sides) {
      const persona = pickChildPersona([...taken, ...spawned.map((a: any) => a.persona_name)], plan.role);
      const { data: agent } = await s.from("agents").insert({
        trip_id: ctx.trip.id, kind: "child", role: plan.role, persona_name: persona.name, emoji: persona.emoji,
        task: `Argue for "${side}" in the debate about: ${plan.topic}`, champions: side, decision_id: decision!.id,
      }).select().single();
      spawned.push(agent);
    }
    await s.from("decisions").update({ status: "debating", options: plan.sides.map((label) => ({ label })) }).eq("id", decision!.id);
    return { ...plan, agents: spawned };
  }

  return plan;
}
