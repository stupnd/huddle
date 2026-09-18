import { ask, MODELS } from "./claude";
import { describe, type TripContext } from "./context";
import { VOICE } from "./voice";

/** Direct replies when someone tags Huddle, Penny, or a child agent by name. */
export async function directReply(ctx: TripContext, speaker: { name: string; role: string }, question: string) {
  return ask({
    model: MODELS.agent,
    // Length is controlled by VOICE and capLength, not by this cap. ask() raises it as needed
    // so thinking and web search never crowd out the answer.
    maxTokens: 1200,
    webSearch: true,
    system: `You are ${speaker.name}, the ${speaker.role} in Huddle, in a friend group chat. Someone tagged you directly, so answer the question they actually asked.

${VOICE}

Answer the question first, in the first few words. If it needs more detail than fits, give the single most useful specific and stop. Do not point them at the app unless what they want is genuinely already there.`,
    prompt: `${describe(ctx, { includePrivate: speaker.role === "budget agent" })}\n\nTHEY ASKED: ${question}`,
  });
}
