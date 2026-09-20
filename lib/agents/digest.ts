import { db, type Message } from "../supabase";
import { askJSON, MODELS } from "./claude";
import { describe, findDecision, type TripContext } from "./context";
import {
  ANSWERABLE_MS, CHECK_EVERY_MS, MAX_ITEMS, REPOST_AFTER_MS, applyVerdicts, composeReply, mightAnswer, openItems,
  readDigest, renderDigest, writeDigest, type DigestItem, type DigestState, type Verdict,
} from "./digest-state";
import { HUDDLE } from "./personas";
import { postNow } from "./spokesperson";

/**
 * Open decisions used to come up as one free-text nudge each ("banff day trip is still open, ..."),
 * over and over. A real chat found that robotic and overwhelming. Now there is one short numbered
 * list, most important first. People answer items separately, and Huddle replies under each answer
 * (a threaded reply where the provider supports it) to confirm it or ask for a clearer one.
 */

const BUILD_SYSTEM = `You are Huddle, the host of a friend group's trip-planning chat. List what the group still has to settle, most important first.

Rank by importance:
1. Things other choices depend on, or that can sell out or need booking soon: dates, where to stay, how to get there, the big paid activities.
2. Things that cost the most.
3. Nice-to-haves last: food, small stops.

Only include something that is genuinely unsettled. Skip anything the chat shows the group already agreed on, anything marked decided, and requests for plans or information (those are not decisions).
At most ${MAX_ITEMS} items. Fewer is better. Return none if nothing real is open.

For each item write "topic" (2 to 5 words) and "question": one plain question a friend would ask, under 60 characters, no jargon.
Examples: "Skiing - is it happening?", "Johnston Canyon tour - which date?", "Where to stay - Fairmont or the brother's place?"
If the item matches a decision in the DECISIONS list, copy that decision's exact topic into "decision_topic", otherwise null.

Reply with JSON only: {"items":[{"topic":"","question":"","decision_topic":null}]}`;

const ANSWER_SYSTEM = `You match one chat message against a numbered list of open trip questions.

For each item the message answers, or clearly tries to answer, return one verdict:
- "clear": specific enough to record ("yes, skiing on jan 4", "friday", "the fairmont"). Put the answer in "answer", under 8 words.
- "unclear": they responded but it is vague ("maybe", "sometime that week", "whatever works"). Put the one short question that would make it clear in "follow_up", under 60 characters, plain words.

Only include items the message speaks to. Banter, or a message about something else, returns {"answers":[]}.
A bare "yes" or "no" counts only when it plainly answers one item. If several items could fit, mark the most likely one unclear and ask which one they mean.
A number-led message ("2: friday") refers to that item number.

Reply with JSON only: {"answers":[{"n":1,"status":"clear","answer":"","follow_up":""}]}`;

type BuiltItem = { topic?: string; question?: string; decision_topic?: string | null };

const topicKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Asks the model what is still open and turns it into numbered items. Empty when nothing is. */
async function buildItems(ctx: TripContext): Promise<DigestItem[]> {
  const out = await askJSON<{ items: BuiltItem[] }>(
    { model: MODELS.listener, maxTokens: 700, system: BUILD_SYSTEM, prompt: describe(ctx) },
    { items: [] }
  );
  const seen = new Set<string>();
  const items: DigestItem[] = [];
  for (const raw of out.items ?? []) {
    if (!raw?.topic?.trim() || !raw?.question?.trim()) continue;
    const key = topicKey(raw.topic);
    if (seen.has(key)) continue;
    seen.add(key);
    const decision = raw.decision_topic ? findDecision(ctx.decisions, raw.decision_topic) : undefined;
    if (decision?.status === "decided") continue; // the model can miss that one is already locked
    items.push({ n: items.length + 1, topic: raw.topic.trim(), question: raw.question.trim(), decision_id: decision?.id, status: "open" });
    if (items.length === MAX_ITEMS) break;
  }
  return items;
}

/**
 * Queues the digest for the normal speak gate (quiet chat, cooldown) when there is something worth
 * raising. Rarely fires on purpose: a list at most every few hours, never the same list twice in a day.
 */
export async function runDigest(ctx: TripContext) {
  if (ctx.trip.activity_level === "paused" || ctx.trip.settings?.mention_mode === "call_out") return;
  if (ctx.messages.length < 12) return; // not enough said yet to know what is open

  const state = ctx.trip.settings?.digest;
  const now = Date.now();
  if (state?.checked_at && now - new Date(state.checked_at).getTime() < CHECK_EVERY_MS) return;
  if (state?.posted_at && now - new Date(state.posted_at).getTime() < REPOST_AFTER_MS) return;

  const { data: pending } = await db()
    .from("speak_candidates").select("id").eq("trip_id", ctx.trip.id).eq("speaker", "huddle").eq("trigger", "digest").eq("status", "pending");
  if (pending?.length) return;

  const items = await buildItems(ctx);
  const checkedAt = new Date().toISOString();
  const empty: DigestState = state ?? { items: [], created_at: checkedAt };

  // The same open items again within a day is exactly the nagging this replaces
  const prev = openItems(state).map((i) => topicKey(i.topic)).sort().join("|");
  const next = items.map((i) => topicKey(i.topic)).sort().join("|");
  const sameAsBefore = prev === next && state?.posted_at && now - new Date(state.posted_at).getTime() < ANSWERABLE_MS;
  if (!items.length || sameAsBefore) {
    await writeDigest(ctx.trip.id, { ...empty, checked_at: checkedAt });
    return;
  }

  await writeDigest(ctx.trip.id, { items, created_at: checkedAt, checked_at: checkedAt });
  await db().from("speak_candidates").insert({
    trip_id: ctx.trip.id, speaker: "huddle", trigger: "digest", urgency: 1, content: renderDigest(items),
  });
}

/** "@huddle what's left?" builds and posts the list right away, threaded under the question. */
export async function postDigestNow(ctx: TripContext, replyToMessageId?: string) {
  const items = await buildItems(ctx);
  if (!items.length) {
    await postNow(ctx.trip, HUDDLE.key, "nothing open right now", { replyToMessageId });
    return;
  }
  const messageId = await postNow(ctx.trip, HUDDLE.key, renderDigest(items), { replyToMessageId });
  const at = new Date().toISOString();
  await writeDigest(ctx.trip.id, { items, created_at: at, checked_at: at, posted_at: at, message_id: messageId });
}

/** Records a clear answer as a decision, so the dashboard and the planner see it. */
async function lockDecision(ctx: TripContext, item: DigestItem) {
  const s = db();
  const row = (item.decision_id && ctx.decisions.find((d) => d.id === item.decision_id)) || findDecision(ctx.decisions, item.topic);
  const patch = { status: "decided", chosen: item.answer ?? null, updated_at: new Date().toISOString() };
  const { error } = row
    ? await s.from("decisions").update(patch).eq("id", row.id)
    : await s.from("decisions").insert({ trip_id: ctx.trip.id, topic: item.topic, options: [], ...patch });
  if (error) console.error("[digest] could not record the answer", item.topic, error.message);
}

/**
 * If this message answers items on the live list, confirm what was clear and ask again about what was
 * not, in one reply under their message. Returns true when it replied, so nothing else talks over it.
 */
export async function answerDigestItems(
  ctx: TripContext,
  message: Message,
  inbound: { text: string; providerMessageId?: string; replyToMessageId?: string },
  senderLabel: string
): Promise<boolean> {
  const state = ctx.trip.settings?.digest;
  if (!state || !mightAnswer(state, inbound.text, { replyToMessageId: inbound.replyToMessageId })) return false;

  const open = openItems(state);
  const out = await askJSON<{ answers: Verdict[] }>(
    {
      model: MODELS.listener,
      maxTokens: 500,
      system: ANSWER_SYSTEM,
      prompt: `OPEN LIST:\n${open.map((i) => `${i.n}. ${i.question}`).join("\n")}\n\nNEWEST MESSAGE from ${senderLabel}:\n${message.content}`,
    },
    { answers: [] }
  );
  const verdicts = (out.answers ?? []).filter(
    (v) => open.some((i) => i.n === v.n) && (v.status === "clear" || v.status === "unclear")
  );
  if (!verdicts.length) return false;

  const applied = applyVerdicts(state, verdicts);
  if (!applied.confirmed.length && !applied.unclear.length) return false;

  for (const item of applied.confirmed) await lockDecision(ctx, item);
  const fresh = (await readDigest(ctx.trip.id)) ?? state; // a concurrent answer may have landed first
  await writeDigest(ctx.trip.id, {
    ...fresh,
    items: fresh.items.map((it) => applied.state.items.find((x) => x.n === it.n && x.status === "answered") ?? it),
  });

  const stillOpen = open.length - applied.confirmed.length;
  await postNow(ctx.trip, HUDDLE.key, composeReply(applied.confirmed, applied.unclear, stillOpen), {
    replyToMessageId: inbound.providerMessageId,
  });
  return true;
}
