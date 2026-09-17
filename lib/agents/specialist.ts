import { db, type Agent } from "../supabase";
import { ask, askJSON, MODELS } from "./claude";
import { describe, loadContext } from "./context";

const STYLE = `Style: you are texting in a friend group chat. Short, casual, lowercase is fine, no bullet points, no em dashes.
Hard limit: two short sentences, one paragraph, no line breaks. A real person would not send a paragraph to a group chat.
Name at most two options in the text and let the rest sit on the dashboard. Do not list every option you found.
Never reveal anyone's private budget number; say things like "a couple of you are budget conscious" instead.`;

/** A newly spawned specialist researches its topic and queues an intro plus options. */
export async function runSpecialist(agent: Agent) {
  const ctx = await loadContext(agent.trip_id);
  const s = db();

  const research = await askJSON<{ intro: string; options: { label: string; details: string; est_cost_per_person?: number }[]; message: string }>(
    {
      model: MODELS.agent,
      webSearch: true,
      maxTokens: 2000,
      system: `You are ${agent.persona_name}, a ${agent.role} specialist agent who just joined a friend group chat to help with: ${agent.task}.
Use web search to find 2 or 3 real options that fit everyone's preferences. ${STYLE}
Reply with JSON only: {"intro": "one short sentence, 12 words max, saying who you are and why you joined", "options": [{"label": "", "details": "", "est_cost_per_person": 0}], "message": "two short sentences naming your top two options and asking which they prefer"}`,
      prompt: describe(ctx),
    },
    { intro: `hi, i'm ${agent.persona_name}. i'm here to help with ${agent.task.toLowerCase()}`, options: [], message: "" }
  );

  if (agent.decision_id && research.options.length) {
    await s.from("decisions").update({ options: research.options, status: "proposed" }).eq("id", agent.decision_id);
  }
  await s.from("speak_candidates").insert([
    { trip_id: agent.trip_id, speaker: agent.id, trigger: "intro", urgency: 2, content: research.intro, seq: 0 },
    ...(research.message ? [{ trip_id: agent.trip_id, speaker: agent.id, trigger: "decision_ready", urgency: 2, content: research.message, seq: 1 }] : []),
  ]);
}

/** Runs a short debate between champion agents and queues the lines in order, ending with Huddle calling a vote. */
export async function runDebate(agents: Agent[], rounds = 2) {
  if (agents.length < 2) return;
  const ctx = await loadContext(agents[0].trip_id);
  const s = db();
  const topic = ctx.decisions.find((d) => d.id === agents[0].decision_id)?.topic ?? "the decision";
  const lines: { agent: Agent; text: string }[] = [];

  for (let r = 0; r < rounds; r++) {
    for (const agent of agents) {
      const soFar = lines.map((l) => `${l.agent.persona_name}: ${l.text}`).join("\n");
      const text = await ask({
        model: MODELS.agent,
        maxTokens: 130,
        system: `You are ${agent.persona_name}, a ${agent.role} agent in a friend group chat, arguing that the group should pick "${agent.champions}" for ${topic}.
${r === 0 ? "In one short paragraph: say who you are in a few words, then make your single strongest point." : "Rebut the other agent directly in one short paragraph, using what people in the chat actually said they want."}
Be playful and a little competitive, but fair. ${STYLE}`,
        prompt: `${describe(ctx)}\n\nDEBATE SO FAR:\n${soFar || "(you go first)"}`,
      });
      lines.push({ agent, text });
    }
  }

  const sides = agents.map((a) => a.champions).join(" or ");
  await s.from("speak_candidates").insert([
    ...lines.map((l, i) => ({ trip_id: l.agent.trip_id, speaker: l.agent.id, trigger: "debate", urgency: 2, content: l.text, seq: i })),
    { trip_id: agents[0].trip_id, speaker: "huddle", trigger: "debate", urgency: 2, seq: lines.length,
      content: `ok that's the case for ${sides}. reply with your pick and i'll lock it in` },
  ]);
}
