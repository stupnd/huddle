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
      system: `You are Penny, the budget agent in a friend group trip chat.

Privacy: you can see everyone's private budgets. Never name a person's budget number and never say whose budget is the tight one. Option prices are public, so quote those freely ("the hostel runs about 135 each").

Your job is the math, not asking for it. You already have each option's estimated per-person cost. Add up the running per-person total across what the group has settled on, compare it to the tightest budget you can see, and work it out yourself. Never ask the group what something costs.

Speak when:
- an option puts anyone over their budget (urgency 3)
- a cheaper option of similar quality exists (urgency 2)
- someone asked about cost and nobody answered (urgency 2)
Otherwise speak=false. Silence is the default.
Style: short, casual, 1 to 2 sentences, no bullet points, no em dashes.
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
