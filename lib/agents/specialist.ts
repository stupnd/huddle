import { db, type Agent } from "../supabase";
import { ask, askJSON, MODELS } from "./claude";
import { describe, loadContext } from "./context";
import { describePlaces, describeRoutes, getRoutes, googleEnabled, searchPlaces, type Place } from "../tools/google";
import { verifyDraft } from "./monitor";
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
/**
 * What each role looks up before it speaks. This is the difference between agents: the stays
 * agent asks Places for hotels, the transport agent asks Directions for travel times, and each
 * gets back facts the others do not have. Without a key, everything falls back to web search.
 */
async function gatherFacts(agent: Agent, context: string): Promise<{ facts: string; places: Place[] }> {
  if (!googleEnabled()) return { facts: "", places: [] };

  // A cheap call to turn the trip state into the two or three concrete lookups this role needs
  const plan = await askJSON<{ searches?: string[]; routes?: { from: string; to: string }[]; near?: string }>(
    {
      model: MODELS.listener,
      maxTokens: 400,
      system: `You turn a trip's state into lookups for a ${agent.role} specialist working on: ${agent.task}.
Reply with JSON only. searches: up to 3 Google Places text queries, specific and local ("cheap hostel near Santa Monica Pier", "brunch on Abbot Kinney Blvd"). Use the group's stated area, budget, and taste.
routes: up to 3 {from, to} pairs for travel times, only if this role is transport or getting around matters (airport to hotel, hotel to the main activity). Use full place names.
near: the city or neighbourhood to anchor searches.
{"searches": [], "routes": [], "near": ""}`,
      prompt: context,
    },
    { searches: [], routes: [], near: "" }
  );

  const places = (await Promise.all((plan.searches ?? []).slice(0, 3).map((q) => searchPlaces(q, { near: plan.near, max: 5 })))).flat();
  const routeLines = await Promise.all(
    (plan.routes ?? []).slice(0, 3).map(async (r) => describeRoutes(r.from, r.to, await getRoutes(r.from, r.to)))
  );

  const facts = [
    places.length ? `REAL PLACES (from Google, with ratings and price level):\n${describePlaces(places)}` : "",
    routeLines.length ? `REAL TRAVEL TIMES (from Google Directions):\n${routeLines.join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
  return { facts, places };
}

export async function runSpecialist(agent: Agent) {
  const ctx = await loadContext(agent.trip_id);
  const s = db();
  const context = describe(ctx);
  const { facts, places } = await gatherFacts(agent, context);
  const grounded = facts.length > 0;

  const research = await askJSON<{ options: { label: string; details: string; est_cost_per_person?: number; maps_url?: string; photo_url?: string }[]; message: string }>(
    {
      model: MODELS.agent,
      webSearch: !grounded,
      maxTokens: 2000,
      system: `You are ${agent.persona_name}, the ${agent.role} specialist in a friend group chat, working on: ${agent.task}.
${grounded
  ? "Pick 2 or 3 options ONLY from the REAL PLACES and REAL TRAVEL TIMES below. Quote their actual ratings, price levels, addresses and times. Never invent a place that is not listed."
  : "Use web search to find 2 or 3 real options that fit everyone's preferences."}
${STYLE}
Reply with JSON only: {"options": [{"label": "exact place name", "details": "", "est_cost_per_person": 0}], "message": "your top two picks with the specific detail that makes each one right for this group, for example a price, a walk time, or a distance"}`,
      prompt: grounded ? `${context}\n\n${facts}` : context,
    },
    { options: [], message: "" }
  );

  // Attach the real links and photos to options that match a looked-up place
  for (const o of research.options) {
    const hit = places.find((p) => p.name.toLowerCase() === o.label.toLowerCase()) ??
      places.find((p) => o.label.toLowerCase().includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(o.label.toLowerCase()));
    if (hit) { o.maps_url = hit.mapsUrl; if (hit.photoUrl) o.photo_url = hit.photoUrl; }
  }

  if (agent.decision_id && research.options.length) {
    await s.from("decisions").update({ options: research.options, status: "proposed" }).eq("id", agent.decision_id);
  }
  if (research.message) {
    // Re-load so options just written are in ground truth for the monitor
    const fresh = await loadContext(agent.trip_id);
    const message = await verifyDraft(
      fresh,
      { name: agent.persona_name, role: `${agent.role} agent` },
      research.message
    );
    await s.from("speak_candidates").insert({
      trip_id: agent.trip_id, speaker: agent.id, trigger: "intro", urgency: 2, content: message, seq: 0,
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
      const draft = await ask({
        model: MODELS.agent,
        // Enough room for a short answer. The line cap in formatFor keeps it short in the chat;
        // a tight token cap here just produced sentences cut off mid-word.
        maxTokens: 400,
        system: `You are ${agent.persona_name}, a ${agent.role} agent in a friend group chat, arguing that the group should pick "${agent.champions}" for ${topic}.
${r === 0 ? "Open with your single strongest concrete point. Do not introduce yourself." : "Rebut the other agent directly, using what people in the chat actually said they want."}
Be playful and a little competitive, but fair. ${STYLE}`,
        prompt: `${describe(ctx)}\n\nDEBATE SO FAR:\n${soFar || "(you go first)"}`,
      });
      const text = await verifyDraft(ctx, { name: agent.persona_name, role: `${agent.role} agent` }, draft);
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
