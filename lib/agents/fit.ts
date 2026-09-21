import { createHash } from "node:crypto";
import { db, type Agent } from "../supabase";
import { askJSON, MODELS } from "./claude";
import { loadContext, type TripContext } from "./context";
import { HUDDLE } from "./personas";
import { VOICE } from "./voice";

/**
 * Do the parts of the plan fit the people going? Every agent sees the same preferences, but each one
 * builds its own piece (Nova picks a dinner, the planner lays out the day) and nothing checked the
 * pieces against each other: a steakhouse dinner for a group with a vegetarian went straight through.
 *
 * This looks at the whole plan against everyone's hard constraints (diet, allergies, mobility,
 * dislikes) and, once per problem, has Huddle name it and tag the agent who owns that piece.
 */

const MIN_GAP_MS = 30 * 60 * 1000;   // never raise problems more often than this
const KEEP_FLAGGED = 30;             // remembered problems, so the same one is not raised twice

export type Conflict = { stop: string; day?: string; constraint: string; message: string; fix_role?: string };

const SYSTEM = `You are the plan checker inside Huddle, a group trip planner. You never talk in the chat.
You get the current plan (itinerary stops and the options on open decisions) and what each person needs.
Find stops or options that clearly clash with a hard constraint someone has: a dietary need or allergy against a place that is unlikely to serve them, a mobility limit against something strenuous, a stated dislike or "no X" against the thing itself.

Only flag a clash the group would obviously want fixed. Skip anything a venue plausibly handles (most restaurants have some vegetarian dish, but a steakhouse or a barbecue place is a real clash for a vegetarian). Skip anything the notes already say is handled. Skip taste, price and timing. An extra alarm is worse than silence, so return none when unsure. At most 2.

For each clash:
- "stop": the stop or option name as written in the plan
- "day": its day label, or "" if it has none
- "constraint": the need it clashes with, in a few words ("one of you is vegetarian")
- "message": one short casual sentence for the chat saying what clashes with what. Never mention prices or budgets.
- "fix_role": which specialist owns it: food, activities, stays, transport, flights, or nightlife

${VOICE}
Reply with JSON only: {"conflicts": []}`;

/** Everyone's constraints as text. Budgets and dates are handled elsewhere, and private notes stay private. */
export function constraintLines(ctx: TripContext): string {
  return ctx.participants
    .map((p) => {
      const mine = ctx.preferences.filter(
        (x) => x.participant_id === p.id && x.visibility !== "private" && !["budget", "dates"].includes(x.category)
      );
      return mine.length ? `${p.display_name ?? p.address}:\n${mine.map((x) => `- ${x.category}: ${x.value}`).join("\n")}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

/** A short stable id for a problem, so the same stop against the same need is only raised once. */
export function conflictKey(c: Pick<Conflict, "stop" | "constraint">): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return createHash("sha1").update(`${norm(c.stop)}|${norm(c.constraint)}`).digest("hex").slice(0, 10);
}

/** The first conflict that has not been raised before. */
export function firstNew(conflicts: Conflict[], flagged: string[]): Conflict | undefined {
  return conflicts.find((c) => c?.stop?.trim() && c?.message?.trim() && !flagged.includes(conflictKey(c)));
}

/** Who fixes it: the specialist whose role matches, else the activities agent that laid the plan out, else any. */
export function pickFixer(agents: Agent[], role?: string): Agent | undefined {
  return agents.find((a) => a.role === role) ?? agents.find((a) => a.role === "activities") ?? agents[0];
}

export function composeFitMessage(c: Conflict, fixer?: Agent): string {
  const text = c.message.trim().replace(/[.!\s]+$/, "");
  return fixer
    ? `${text}. @${fixer.persona_name} can you swap it for something that works for everyone?`
    : `${text}. want me to swap it?`;
}

export async function checkPlanFit(tripId: string) {
  const ctx = await loadContext(tripId);
  const settings = ctx.trip.settings ?? {};
  // Speaking up on its own is only for groups that asked Huddle to read along
  if (ctx.trip.activity_level === "paused" || settings.mention_mode !== "listen_in") return;

  const constraints = constraintLines(ctx);
  if (!constraints) return;

  const prev = settings.fit_check;
  if (prev && Date.now() - new Date(prev.flagged_at).getTime() < MIN_GAP_MS) return;

  const { data: items } = await db()
    .from("itinerary_items").select("day_label,day_index,start_time,title,place,category,notes,sort")
    .eq("trip_id", tripId).order("day_index").order("sort");
  const stops = (items ?? []).map((i) => `- ${i.day_label}${i.start_time ? ` ${i.start_time}` : ""}: ${i.title}${i.place ? ` at ${i.place}` : ""}${i.category ? ` [${i.category}]` : ""}${i.notes ? ` (${i.notes})` : ""}`).join("\n");
  const options = ctx.decisions
    .filter((d) => d.options.length)
    .map((d) => `- ${d.topic}${d.chosen ? ` -> ${d.chosen}` : ""}: ${d.options.map((o) => o.label).join(" / ")}`).join("\n");
  if (!stops && !options) return;

  const out = await askJSON<{ conflicts: Conflict[] }>(
    {
      model: MODELS.agent,
      maxTokens: 700,
      system: SYSTEM,
      prompt: `WHAT EACH PERSON NEEDS:\n${constraints}\n\nITINERARY:\n${stops || "- none yet"}\n\nOPEN DECISION OPTIONS:\n${options || "- none"}`,
    },
    { conflicts: [] }
  );

  const flagged = prev?.flagged ?? [];
  const conflict = firstNew(out.conflicts ?? [], flagged);
  if (!conflict) return;

  const { data: pending } = await db().from("speak_candidates").select("id").eq("trip_id", tripId).eq("speaker", HUDDLE.key).eq("trigger", "conflict").eq("status", "pending");
  if (pending?.length) return;

  await db().from("speak_candidates").insert({
    trip_id: tripId, speaker: HUDDLE.key, trigger: "conflict", urgency: 2,
    content: composeFitMessage(conflict, pickFixer(ctx.agents, conflict.fix_role)),
  });
  await db().from("trips").update({
    settings: { ...settings, fit_check: { flagged: [...flagged, conflictKey(conflict)].slice(-KEEP_FLAGGED), flagged_at: new Date().toISOString() } },
  }).eq("id", tripId);
}
