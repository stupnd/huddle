import { db } from "../supabase";
import { askJSON, MODELS } from "./claude";
import { describe, type TripContext } from "./context";
import { verifyDraft } from "./monitor";
import { VOICE } from "./voice";

/**
 * Decisions nobody has assigned an agent to just sit in the "needs you" bucket on the
 * dashboard forever if nobody happens to open it. Instead, Huddle judges for itself whether
 * one is worth re-raising in the chat, given the trip's timeline — and if so, asks there
 * instead of waiting for a human to notice a bucket on a screen.
 */
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

const SYSTEM = `You are Huddle, the host agent in a friend group's trip-planning chat.
One or more decisions are open with nobody looking into them — no specialist agent assigned, no options back yet.

For each one, judge whether it is worth nudging the group about right now, based on the trip's dates (if known) and how close the group is cutting it. Not urgent yet (trip is weeks out, nothing depends on it) means stay silent — most of the time that is the right call.

If any genuinely need a nudge, write ONE short message covering all of them together, not one per decision. Ask directly: should Huddle look into it, or does someone want to own it. Do not restate the whole list if only one matters.

${VOICE}
Reply with JSON only: {"speak": false, "urgency": 1, "message": ""}`;

export async function runStuckCheck(ctx: TripContext) {
  if (ctx.trip.activity_level === "paused") return;

  const stuck = ctx.decisions.filter((d) => d.status !== "decided" && (!d.options || d.options.length === 0));
  if (!stuck.length) return;

  const nudged = ctx.trip.settings?.stuck_nudges ?? {};
  const due = stuck.filter((d) => {
    const last = nudged[d.id];
    return !last || Date.now() - new Date(last).getTime() > COOLDOWN_MS;
  });
  if (!due.length) return;

  const s = db();
  const { data: pending } = await s
    .from("speak_candidates").select("id").eq("trip_id", ctx.trip.id).eq("speaker", "huddle").eq("trigger", "stuck").eq("status", "pending");
  if (pending?.length) return;

  const list = due.map((d) => `- ${d.topic} (open since ${d.created_at})`).join("\n");
  const out = await askJSON<{ speak: boolean; urgency: number; message: string }>(
    { model: MODELS.listener, maxTokens: 500, system: SYSTEM, prompt: `${describe(ctx)}\n\nOPEN, UNASSIGNED DECISIONS:\n${list}` },
    { speak: false, urgency: 1, message: "" }
  );

  // Whether or not it decided to speak, these were evaluated — don't re-evaluate every message.
  const nextNudged = { ...nudged };
  for (const d of due) nextNudged[d.id] = new Date().toISOString();
  await s.from("trips").update({ settings: { ...ctx.trip.settings, stuck_nudges: nextNudged } }).eq("id", ctx.trip.id);

  if (!out.speak || !out.message) return;

  const message = await verifyDraft(ctx, { name: "Huddle", role: "host" }, out.message);
  await s.from("speak_candidates").insert({
    trip_id: ctx.trip.id, speaker: "huddle", trigger: "stuck", urgency: Math.min(3, Math.max(1, out.urgency || 1)), content: message,
  });
}
