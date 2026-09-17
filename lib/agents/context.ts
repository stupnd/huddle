import { db, type Agent, type Decision, type Message, type Participant, type Preference, type Trip } from "../supabase";

export type TripContext = {
  trip: Trip;
  participants: Participant[];
  messages: Message[];
  preferences: Preference[];
  decisions: Decision[];
  agents: Agent[];
};

export async function loadContext(tripId: string, messageLimit = 40): Promise<TripContext> {
  const s = db();
  const [trip, participants, messages, preferences, decisions, agents] = await Promise.all([
    s.from("trips").select("*").eq("id", tripId).single(),
    s.from("participants").select("*").eq("trip_id", tripId),
    s.from("messages").select("*").eq("trip_id", tripId).order("created_at", { ascending: false }).limit(messageLimit),
    s.from("preferences").select("*").eq("trip_id", tripId),
    s.from("decisions").select("*").eq("trip_id", tripId),
    s.from("agents").select("*").eq("trip_id", tripId).eq("status", "active"),
  ]);
  return {
    trip: trip.data as Trip,
    participants: (participants.data ?? []) as Participant[],
    messages: ((messages.data ?? []) as Message[]).reverse(),
    preferences: (preferences.data ?? []) as Preference[],
    decisions: (decisions.data ?? []) as Decision[],
    agents: (agents.data ?? []) as Agent[],
  };
}

/** Human-readable transcript. Private preferences are summarized without values unless includePrivate is true. */
export function describe(ctx: TripContext, { includePrivate = false } = {}) {
  const nameOf = (id: string | null) =>
    ctx.participants.find((p) => p.id === id)?.display_name ?? ctx.participants.find((p) => p.id === id)?.address ?? "someone";
  const agentName = (persona: string | null) => {
    if (persona === "huddle") return "Huddle";
    if (persona === "budget") return "Penny (budget)";
    const a = ctx.agents.find((x) => x.id === persona);
    return a ? `${a.persona_name} (${a.role} agent)` : "an agent";
  };

  const transcript = ctx.messages
    .map((m) => `${m.sender_type === "human" ? nameOf(m.participant_id) : agentName(m.persona)}: ${m.content}`)
    .join("\n");

  const prefs = ctx.participants
    .map((p) => {
      const mine = ctx.preferences.filter((x) => x.participant_id === p.id);
      const lines = mine.map((x) =>
        x.visibility === "private" && !includePrivate ? `- ${x.category}: (private)` : `- ${x.category}: ${x.value}`
      );
      return `${p.display_name ?? p.address}:\n${lines.join("\n") || "- nothing yet"}`;
    })
    .join("\n");

  // Costs have to survive into the prompt or the budget agent has nothing to do its math on.
  const decisions = ctx.decisions
    .map((d) => {
      const options = d.options
        .map((o) => `${o.label}${o.est_cost_per_person ? ` (about $${o.est_cost_per_person} per person)` : ""}`)
        .join(" / ");
      return `- [${d.status}] ${d.topic}${d.chosen ? ` -> ${d.chosen}` : ""} options: ${options || "none"}`;
    })
    .join("\n");

  const agents = ctx.agents.map((a) => `- ${a.persona_name} (${a.role}): ${a.task}${a.champions ? `, champions "${a.champions}"` : ""}`).join("\n");

  return `TRIP: ${ctx.trip.title ?? "untitled trip"}
PEOPLE AND PREFERENCES:
${prefs}

DECISIONS:
${decisions || "- none yet"}

CHILD AGENTS IN CHAT:
${agents || "- none"}

RECENT GROUP CHAT:
${transcript}`;
}
