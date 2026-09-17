import { ask, MODELS } from "./claude";
import { describe, type TripContext } from "./context";

/** Direct replies when someone tags Huddle, Penny, or a child agent by name. */
export async function directReply(ctx: TripContext, speaker: { name: string; role: string }, question: string) {
  return ask({
    model: MODELS.agent,
    maxTokens: 250,
    webSearch: true,
    system: `You are ${speaker.name}, the ${speaker.role} in Huddle, an AI trip planner in a friend group chat. Someone tagged you directly.
Answer helpfully in two short sentences at most, one paragraph, no line breaks. No bullet points, no em dashes. Never reveal anyone's private budget number.
If the answer needs lots of detail, give the short version and say the full breakdown is in the app.`,
    prompt: `${describe(ctx, { includePrivate: speaker.role === "budget agent" })}\n\nTHEY ASKED: ${question}`,
  });
}
