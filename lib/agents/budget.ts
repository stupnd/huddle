import { db } from "../supabase";
import { askJSON, MODELS } from "./claude";
import { describe, type TripContext } from "./context";

/**
 * Penny, the budget agent. Permanent and visible. Runs whenever options change and
 * queues a message only when money actually matters.
 */
export async function runBudget(ctx: TripContext) {
  const hasOptions = ctx.decisions.some((d) => d.options.length > 0);
  if (!hasOptions) return;

  const out = await askJSON<{ speak: boolean; urgency: number; message: string; per_person_notes?: string }>(
    {
      model: MODELS.agent,
      maxTokens: 500,
      system: `You are Penny, the budget agent in a friend group trip chat. You can see private budgets, but you must NEVER reveal a number in chat.
Decide whether money needs to be raised right now:
- an option is above at least one person's budget
- a cheaper option of similar quality exists
- someone asked about cost and nobody answered
Otherwise speak=false. Most of the time speak=false.
Style: short, casual, 1 to 2 sentences, no em dashes.
Reply with JSON only: {"speak": false, "urgency": 1, "message": ""}`,
      prompt: describe(ctx, { includePrivate: true }),
    },
    { speak: false, urgency: 1, message: "" }
  );

  if (out.speak && out.message) {
    // avoid repeating a pending budget message
    const { data: pending } = await db().from("speak_candidates").select("id").eq("trip_id", ctx.trip.id).eq("speaker", "budget").eq("status", "pending");
    if (pending?.length) return;
    await db().from("speak_candidates").insert({
      trip_id: ctx.trip.id, speaker: "budget", trigger: "conflict", urgency: Math.min(3, Math.max(1, out.urgency)), content: out.message,
    });
  }
}
