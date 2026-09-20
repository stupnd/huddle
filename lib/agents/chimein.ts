import { db } from "../supabase";
import { askJSON, MODELS } from "./claude";
import { describe, type TripContext } from "./context";
import { verifyDraft } from "./monitor";
import { VOICE } from "./voice";

/**
 * "Chime in" mode. A group can ask Huddle to read every message instead of only replying when
 * tagged (the "call me or chime in?" onboarding question, trips.settings.mention_mode). This is
 * the other half of that promise: without it, "listen_in" was recorded but changed nothing.
 *
 * Runs once per untagged message, but only actually queues something rarely — silence stays the
 * default. tick()'s lull/cooldown gate is the second line of defense if this fires too often.
 */
const SYSTEM = `You are Huddle, the host agent in a friend group's trip-planning chat. This group asked you to read every message and speak up on your own judgment sometimes, instead of only when tagged.

Speak only when it is genuinely useful and nobody else already covered it:
- a question was asked and several messages have gone by with no answer
- the group is visibly stuck going in circles on something you can actually resolve
- someone states something that contradicts a decision or preference already on record

Stay silent otherwise. Silence is still the default outcome for most messages — jokes, banter, small talk, a question someone already answered, anything better suited to a specialist agent, or anything you are not confident about.

${VOICE}
Reply with JSON only: {"speak": false, "urgency": 1, "message": ""}`;

export async function runChimeIn(ctx: TripContext) {
  if (ctx.trip.settings?.mention_mode !== "listen_in") return;
  if (ctx.trip.activity_level === "paused") return;

  // Don't pile a second one on top of an unposted nudge
  const { data: pending } = await db()
    .from("speak_candidates").select("id").eq("trip_id", ctx.trip.id).eq("speaker", "huddle").eq("trigger", "chime_in").eq("status", "pending");
  if (pending?.length) return;

  const out = await askJSON<{ speak: boolean; urgency: number; message: string }>(
    { model: MODELS.listener, maxTokens: 500, system: SYSTEM, prompt: describe(ctx) },
    { speak: false, urgency: 1, message: "" }
  );
  if (!out.speak || !out.message) return;

  const message = await verifyDraft(ctx, { name: "Huddle", role: "host" }, out.message);
  await db().from("speak_candidates").insert({
    trip_id: ctx.trip.id, speaker: "huddle", trigger: "chime_in", urgency: Math.min(3, Math.max(1, out.urgency || 1)), content: message,
  });
}
