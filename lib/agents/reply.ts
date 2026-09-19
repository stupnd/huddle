import { ask, MODELS } from "./claude";
import { describe, type TripContext } from "./context";
import { VOICE } from "./voice";
import { db, type ItineraryItem } from "../supabase";
import { describeRoutes, getRoutes, googleEnabled } from "../tools/google";

/**
 * Penny's ledger, computed rather than estimated. The itinerary already carries a per-person
 * cost on every stop, so the totals are arithmetic. Claude only phrases them.
 */
async function ledgerFor(tripId: string, people: number) {
  const { data } = await db().from("itinerary_items").select("*").eq("trip_id", tripId).order("day_index").order("sort");
  const items = (data ?? []) as ItineraryItem[];
  if (!items.length) return "";
  const cat = new Map<string, number>();
  const day = new Map<string, number>();
  let total = 0;
  for (const it of items) {
    const c = it.est_cost_per_person ?? 0;
    total += c;
    cat.set(it.category ?? "other", (cat.get(it.category ?? "other") ?? 0) + c);
    day.set(it.day_label, (day.get(it.day_label) ?? 0) + c);
  }
  const top = [...items].filter((i) => (i.est_cost_per_person ?? 0) > 0).sort((a, b) => (b.est_cost_per_person ?? 0) - (a.est_cost_per_person ?? 0)).slice(0, 3);
  return `LEDGER (computed from the plan, per person unless noted):
total: $${total} per person, $${total * people} for ${people}
by category: ${[...cat].map(([k, v]) => `${k} $${v}`).join(", ")}
by day: ${[...day].map(([k, v]) => `${k.split(",")[0]} $${v}`).join(", ")}
biggest line items: ${top.map((i) => `${i.title} $${i.est_cost_per_person}`).join(", ")}
Use these exact numbers. Do not estimate anything the ledger already answers.`;
}

/** Transport questions get real travel times when the question names two places. */
async function routesFor(question: string) {
  if (!googleEnabled()) return "";
  const m = question.match(/(?:from|between)\s+(.+?)\s+(?:to|and)\s+(.+?)(?:\?|$|,)/i);
  if (!m) return "";
  const routes = await getRoutes(m[1].trim(), m[2].trim());
  return routes.length ? `REAL TRAVEL TIMES: ${describeRoutes(m[1].trim(), m[2].trim(), routes)}` : "";
}

/** Direct replies when someone tags Huddle, Penny, or a child agent by name. */
export async function directReply(ctx: TripContext, speaker: { name: string; role: string }, question: string) {
  const isBudget = speaker.role === "budget agent";
  const facts = [
    isBudget ? await ledgerFor(ctx.trip.id, Math.max(1, ctx.participants.length)) : "",
    /transport|host/.test(speaker.role) ? await routesFor(question) : "",
  ].filter(Boolean).join("\n\n");

  return ask({
    model: MODELS.agent,
    // Length is controlled by VOICE and capLength, not by this cap. ask() raises it as needed
    // so thinking and web search never crowd out the answer.
    maxTokens: 1200,
    webSearch: true,
    system: `You are ${speaker.name}, the ${speaker.role} in Huddle, in a friend group chat. Someone tagged you directly, so answer the question they actually asked.

${VOICE}

Answer the question first, in the first few words. If it needs more detail than fits, give the single most useful specific and stop. Do not point them at the app unless what they want is genuinely already there.`,
    prompt: `${describe(ctx, { includePrivate: isBudget })}${facts ? `\n\n${facts}` : ""}\n\nTHEY ASKED: ${question}`,
  });
}
