import { createHash } from "node:crypto";
import { db } from "../supabase";
import { askJSON, MODELS } from "./claude";
import { describe, loadContext, type TripContext } from "./context";
import { HUDDLE } from "./personas";
import { VOICE } from "./voice";

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

Stay silent when:
- the latest human message asks a question that nobody has answered yet. Money can wait, let them get their answer first.
- someone has said to deal with money later, or told you to drop it
- nothing about the cost picture has changed since you last spoke
Otherwise speak=false. Silence is the default and it is the right call most of the time.

${VOICE}
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

// ---- Huddle-detects: the plan against what people privately said they can spend ----
//
// No agent has to be watching. Whenever a message arrives or a plan is built, this does the arithmetic
// (no model call) and speaks only when the plan really is over. Penny raises it without saying whose
// budget is tight or how much, and tags a specialist to find cheaper swaps.

const OVER_TOLERANCE = 1.05;            // within 5% is not worth a message
const MIN_GAP_MS = 30 * 60 * 1000;      // and never nag more often than this
// A budget for one part of the trip ("$200 for food") cannot be compared with the whole plan
const PART_OF_TRIP = /\b(food|dinner|meals?|hotel|lodging|stay|flights?|airfare|activit\w*|gifts?|shopping|drinks?|souvenirs?)\b/;
const WHOLE_TRIP = /\b(total|overall|whole trip|all in|altogether)\b/;

/** A stated budget as a per-person trip total, or null when it cannot be compared with the plan. */
export function parseBudget(value: string, days: number): number | null {
  const t = value.toLowerCase();
  if (PART_OF_TRIP.test(t) && !WHOLE_TRIP.test(t)) return null;
  if (/\b(per|a|each|\/)\s*night\b/.test(t)) return null;
  const m = t.match(/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k\b)?/);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1);
  if (n < 20) return null;
  if (/(\bper|\ba|\beach|\/)\s*day\b|\bdaily\b/.test(t)) {
    if (!days) return null;
    n *= days;
  }
  return n;
}

type PlanItem = { title: string; est_cost_per_person: number | null; day_label: string };

/** How far the plan runs past the tightest budget, or null when it fits or nothing can be compared. */
export function budgetGap(items: PlanItem[], budgets: string[]) {
  const total = items.reduce((sum, i) => sum + (i.est_cost_per_person ?? 0), 0);
  if (!total) return null;
  const days = new Set(items.map((i) => i.day_label)).size;
  const caps = budgets.map((b) => parseBudget(b, days)).filter((n): n is number => n !== null);
  if (!caps.length) return null;
  const tightest = Math.min(...caps);
  if (total <= tightest * OVER_TOLERANCE) return null;
  const top = items.filter((i) => (i.est_cost_per_person ?? 0) > 0).sort((a, b) => (b.est_cost_per_person ?? 0) - (a.est_cost_per_person ?? 0)).slice(0, 2);
  return { total: Math.round(total), tightest, top };
}

/** Public numbers only: the plan's own prices, never anyone's budget. */
export function composeBudgetAlert(total: number, top: PlanItem[], callName: string) {
  const biggest = top.map((i) => `${i.title} $${Math.round(i.est_cost_per_person ?? 0)}`).join(", ");
  return `heads up: the plan runs about $${total} each, over what at least one of you has in mind. biggest: ${biggest}. @${callName} can you find cheaper swaps for those?`;
}

/**
 * Checks the current plan against everyone's private budgets and, once per change, queues one message
 * from Penny that tags who should fix it. Only groups that asked Huddle to read along get it.
 */
export async function checkBudget(tripId: string) {
  const ctx = await loadContext(tripId);
  const settings = ctx.trip.settings ?? {};
  if (ctx.trip.activity_level === "paused" || settings.mention_mode !== "listen_in" || settings.penny === false) return;

  const { data: items } = await db().from("itinerary_items").select("title,est_cost_per_person,day_label").eq("trip_id", tripId);
  const budgets = ctx.preferences.filter((p) => p.category === "budget").map((p) => p.value);
  const gap = budgetGap((items ?? []) as PlanItem[], budgets);
  if (!gap) return;

  // The signature depends on the tightest budget but must not reveal it, since settings reach the dashboard
  const signature = `${Math.round(gap.total / 10) * 10}:${createHash("sha1").update(String(gap.tightest)).digest("hex").slice(0, 8)}`;
  const prev = settings.budget_check;
  if (prev?.signature === signature) return;
  if (prev && Date.now() - new Date(prev.flagged_at).getTime() < MIN_GAP_MS) return;

  const { data: pending } = await db().from("speak_candidates").select("id").eq("trip_id", tripId).eq("speaker", "budget").eq("status", "pending");
  if (pending?.length) return;

  // Whoever knows the plan best fixes it: the activities agent, else any specialist, else Huddle
  const fixer = ctx.agents.find((a) => a.role === "activities") ?? ctx.agents[0];
  await db().from("speak_candidates").insert({
    trip_id: tripId, speaker: "budget", trigger: "conflict", urgency: 3,
    content: composeBudgetAlert(gap.total, gap.top, fixer ? fixer.persona_name : HUDDLE.name),
  });
  await db().from("trips").update({ settings: { ...settings, budget_check: { signature, flagged_at: new Date().toISOString() } } }).eq("id", tripId);
}
