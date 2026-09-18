import { db, type Agent } from "../supabase";
import { ask, askJSON, MODELS } from "./claude";
import { describe, loadContext } from "./context";
import { VOICE } from "./voice";

const STYLE = `${VOICE}

Name at most two options in the text, one per line, and let the rest sit on the dashboard.
Never reveal anyone's private budget number; say things like "a couple of you are budget conscious" instead.`;

/**
 * A newly spawned specialist researches its topic and queues ONE message.
 *
 * It used to post a separate "hi i'm Nova, i handle stays" line before the useful one, which
 * was a wasted bubble: the name prefix on every agent message already says who they are.
 * The trigger stays "intro" so an agent joining still skips the cooldown.
 */
export async function runSpecialist(agent: Agent) {
  const ctx = await loadContext(agent.trip_id);
  const s = db();

  const research = await askJSON<{ options: { label: string; details: string; est_cost_per_person?: number }[]; message: string }>(
    {
      model: MODELS.agent,
      webSearch: true,
      maxTokens: 2000,
      system: `You are ${agent.persona_name}, the ${agent.role} specialist in a friend group chat, working on: ${agent.task}.
Use web search to find 2 or 3 real options that fit everyone's preferences. ${STYLE}
Reply with JSON only: {"options": [{"label": "", "details": "", "est_cost_per_person": 0}], "message": "your top two picks with the specific detail that makes each one right for this group, for example a price, a walk time, or a distance"}`,
      prompt: describe(ctx),
    },
    { options: [], message: "" }
  );

  if (agent.decision_id && research.options.length) {
    await s.from("decisions").update({ options: research.options, status: "proposed" }).eq("id", agent.decision_id);
  }
  if (research.message) {
    await s.from("speak_candidates").insert({
      trip_id: agent.trip_id, speaker: agent.id, trigger: "intro", urgency: 2, content: research.message, seq: 0,
    });
  }
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
        // Enough room for a short answer. The line cap in formatFor keeps it short in the chat;
        // a tight token cap here just produced sentences cut off mid-word.
        maxTokens: 400,
        system: `You are ${agent.persona_name}, a ${agent.role} agent in a friend group chat, arguing that the group should pick "${agent.champions}" for ${topic}.
${r === 0 ? "Open with your single strongest concrete point. Do not introduce yourself." : "Rebut the other agent directly, using what people in the chat actually said they want."}
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
