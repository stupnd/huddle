import { adapterFor, type SendOptions } from "../messaging";
import { db, type Agent, type Trip } from "../supabase";
import { markDigestPosted } from "./digest-state";
import { BUDGET, HUDDLE, prefix } from "./personas";

const LULL = Number(process.env.LULL_SECONDS ?? 90) * 1000;
const COOLDOWN = Number(process.env.COOLDOWN_SECONDS ?? 1800) * 1000;
const STALE = 3 * 60 * 60 * 1000;
const RECLAIM_MS = 60 * 1000;
const LEVEL_FACTOR: Record<string, number> = { quiet: 2, normal: 1, active: 0.33, paused: Infinity };

/**
 * iMessage renders one bubble per send, so a blank line between a greeting and the content
 * turns a short message into a wall of text. Collapse blank lines, but keep single newlines:
 * a timestamped itinerary needs one line per stop, and flattening it makes it unreadable.
 */
function oneLine(content: string) {
  return content.replace(/[ \t]*\n\s*\n[\s]*/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}

// Prompts ask for short messages, and a chat bubble that is a wall of text is hard to read, so a
// long message goes out as several bubbles instead of being cut. Nothing is ever dropped: each part
// stays under both limits, split at a line boundary where possible, else a sentence, else a word.
// Six lines is enough for a timestamped day plan, and far more than a normal reply needs.
const MAX_LINES = 6;
const MAX_CHARS = 420;
const PART_GAP_MS = 1200; // feels like typing, keeps order

/** Breaks one over-long line at sentence ends, then at spaces, so every piece fits in a bubble. */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let rest = line;
  while (rest.length > MAX_CHARS) {
    const head = rest.slice(0, MAX_CHARS + 1);
    const sentence = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
    const at = sentence > 40 ? sentence + 1 : head.lastIndexOf(" ") > 0 ? head.lastIndexOf(" ") : MAX_CHARS;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Splits a message into bubbles that each fit the caps. A message that already fits is one part. */
export function splitMessage(content: string): string[] {
  const lines = oneLine(content).split("\n").flatMap(splitLine);
  const parts: string[][] = [];
  let cur: string[] = [];
  for (const line of lines) {
    const next = [...cur, line];
    if (cur.length && (next.length > MAX_LINES || next.join("\n").length > MAX_CHARS)) {
      parts.push(cur);
      cur = [line];
    } else cur = next;
  }
  if (cur.length) parts.push(cur);
  return parts.map((p) => p.join("\n"));
}

/** Formats an agent message as the bubbles to send. Huddle speaks from its own line, so it gets no prefix. */
export function formatParts(speaker: string, content: string, agents: Agent[]): string[] {
  const parts = splitMessage(content);
  if (speaker === HUDDLE.key) return parts;
  if (speaker === BUDGET.key) return parts.map((t) => `${prefix(BUDGET.emoji, BUDGET.name)}: ${t}`);
  const a = agents.find((x) => x.id === speaker);
  return a ? parts.map((t) => `${prefix(a.emoji, a.persona_name, a.role)}: ${t}`) : parts;
}

/**
 * Sends a message as one or more bubbles and records each one in the dashboard exactly as sent.
 * Stops at the first failed send and reports what is left, so a retry never repeats a bubble that arrived.
 * Only the first bubble is threaded under replyToMessageId.
 */
async function deliver(trip: Trip, speaker: string, content: string, agents: Agent[], opts?: SendOptions) {
  const s = db();
  const adapter = adapterFor(trip.provider);
  const raw = splitMessage(content);
  const sendable = formatParts(speaker, content, agents);
  const ids: (string | undefined)[] = [];
  for (let i = 0; i < sendable.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, PART_GAP_MS));
    let sent;
    try {
      sent = await adapter.sendToGroup(trip.provider_group_id, sendable[i], i === 0 ? opts : undefined);
    } catch (error) {
      return { ids, remaining: raw.slice(i), error };
    }
    ids.push(sent?.messageId);
    await s.from("messages").insert({
      trip_id: trip.id, sender_type: "agent", persona: speaker, content: raw[i], provider_message_id: sent?.messageId ?? null,
    });
  }
  return { ids, remaining: [] as string[], error: undefined };
}

/**
 * Sends one agent message right away (direct replies, intros, control confirmations).
 * Pass replyToMessageId to thread it under someone's message where the provider supports that.
 * Returns the provider's id for the bubble, so a later reply to it can be recognized.
 */
export async function postNow(trip: Trip, speaker: string, content: string, opts?: SendOptions): Promise<string | undefined> {
  // A model that returns no text must never surface as a bare name prefix in the chat.
  if (!content?.trim()) {
    console.warn(`[spokesperson] dropped an empty message from ${speaker}`);
    return undefined;
  }
  const { data: agents } = await db().from("agents").select("*").eq("trip_id", trip.id);
  const { ids, error } = await deliver(trip, speaker, content, (agents ?? []) as Agent[], opts);
  if (error) throw error;
  return ids[0];
}

/**
 * The speak-when-needed gate. Called after every message and by a cron / the simulator every ~15s.
 * Pending candidates post only when the chat has gone quiet and the group cooldown allows it.
 */
export async function tick(tripId: string, { force = false } = {}) {
  const s = db();
  const { data: trip } = await s.from("trips").select("*").eq("id", tripId).single();
  if (!trip) return { posted: 0, reason: "no trip" };

  // A worker that dies mid-send leaves rows claimed as "posting" forever, and the query below
  // only looks at "pending", so they would never be retried. Hand them back after a timeout.
  // posted_at doubles as the claim time: it is set when claiming and overwritten when posted.
  await s
    .from("speak_candidates")
    .update({ status: "pending" })
    .eq("trip_id", tripId)
    .eq("status", "posting")
    .lt("posted_at", new Date(Date.now() - RECLAIM_MS).toISOString());

  const { data: pendingRaw } = await s
    .from("speak_candidates").select("*").eq("trip_id", tripId).eq("status", "pending")
    .order("created_at", { ascending: true }).order("seq", { ascending: true });
  const pending = pendingRaw ?? [];
  if (!pending.length) return { posted: 0, reason: "nothing pending" };

  const now = Date.now();

  // Same guard as postNow: an empty candidate would post as just a name prefix
  for (const c of pending.filter((c) => !c.content?.trim())) {
    await s.from("speak_candidates").update({ status: "dropped", reason: "empty message" }).eq("id", c.id);
  }

  // Drop stale low-value candidates
  for (const c of pending) {
    if (now - new Date(c.created_at).getTime() > STALE && c.urgency < 3) {
      await s.from("speak_candidates").update({ status: "dropped", reason: "stale: the moment passed" }).eq("id", c.id);
    }
  }
  const live = pending.filter(
    (c) => c.content?.trim() && (now - new Date(c.created_at).getTime() <= STALE || c.urgency >= 3)
  );
  if (!live.length) return { posted: 0, reason: "only stale candidates" };

  const t = trip as Trip;
  const maxUrgency = Math.max(...live.map((c) => c.urgency));
  const sequenced = live.some((c) => ["intro", "debate", "signoff"].includes(c.trigger));

  if (!force) {
    if (t.activity_level === "paused") {
      return { posted: 0, reason: "paused by the group" };
    }
    const { data: lastHuman } = await s
      .from("messages").select("created_at").eq("trip_id", tripId).eq("sender_type", "human")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const sinceHuman = lastHuman ? now - new Date(lastHuman.created_at).getTime() : Infinity;
    const lullNeeded = maxUrgency >= 3 ? 15_000 : LULL;
    if (sinceHuman < lullNeeded) return { posted: 0, reason: "waiting for a lull" };

    const sinceAgent = t.last_agent_post_at ? now - new Date(t.last_agent_post_at).getTime() : Infinity;
    const cooldown = COOLDOWN * (LEVEL_FACTOR[t.activity_level] ?? 1);
    // Agents joining, debating, and signing off are part of an active task, so they skip the cooldown
    if (maxUrgency < 3 && !sequenced && sinceAgent < cooldown) return { posted: 0, reason: "cooldown" };
  }

  // Claim the candidates before sending. The inline tick at the end of handleInbound and the
  // every-15s tick can overlap, and without this they both read the same pending rows and post twice.
  const { data: claimedRaw } = await s
    .from("speak_candidates")
    .update({ status: "posting", posted_at: new Date().toISOString() })
    .in("id", live.map((c) => c.id))
    .eq("status", "pending")
    .select();
  const claimed = (claimedRaw ?? []).sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.seq - b.seq
  );
  if (!claimed.length) return { posted: 0, reason: "another tick is already posting" };

  const { data: agents } = await s.from("agents").select("*").eq("trip_id", tripId);

  let posted = 0;
  for (const c of claimed) {
    const { ids, remaining, error } = await deliver(t, c.speaker, c.content, (agents ?? []) as Agent[]);
    if (error) {
      // Put back only what has not arrived, so the next tick retries instead of losing or repeating it
      await s.from("speak_candidates").update({ status: "pending", content: remaining.join("\n") }).eq("id", c.id);
      console.error("[spokesperson] send failed, candidate returned to pending", error);
      continue;
    }
    if (c.trigger === "digest") await markDigestPosted(tripId, ids[0]);
    await s.from("speak_candidates").update({
      status: "posted", posted_at: new Date().toISOString(), reason: force ? "forced" : `trigger: ${c.trigger}`,
    }).eq("id", c.id);
    posted++;
    if (claimed.length > 1) await new Promise((r) => setTimeout(r, PART_GAP_MS));
  }
  await s.from("trips").update({ last_agent_post_at: new Date().toISOString() }).eq("id", tripId);
  return { posted, reason: "posted" };
}
