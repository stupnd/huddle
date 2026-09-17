import { adapterFor } from "../messaging";
import { db, type Agent, type Trip } from "../supabase";
import { BUDGET, HUDDLE, prefix } from "./personas";

const LULL = Number(process.env.LULL_SECONDS ?? 90) * 1000;
const COOLDOWN = Number(process.env.COOLDOWN_SECONDS ?? 1800) * 1000;
const STALE = 3 * 60 * 60 * 1000;
const RECLAIM_MS = 60 * 1000;
const LEVEL_FACTOR: Record<string, number> = { quiet: 2, normal: 1, active: 0.33, paused: Infinity };

/**
 * iMessage renders one bubble per send, so a blank line inside a message turns it into a
 * wall of text. Collapse internal breaks into a single flow regardless of what the model wrote.
 * The stored copy keeps its formatting for the dashboard.
 */
function oneLine(content: string) {
  return content.replace(/\s*\n+\s*/g, " ").replace(/[ \t]{2,}/g, " ").trim();
}

/** Formats an agent message. Huddle speaks from its own line, so it gets no prefix. */
export function formatFor(speaker: string, content: string, agents: Agent[]) {
  const text = oneLine(content);
  if (speaker === HUDDLE.key) return text;
  if (speaker === BUDGET.key) return `${prefix(BUDGET.emoji, BUDGET.name)}: ${text}`;
  const a = agents.find((x) => x.id === speaker);
  return a ? `${prefix(a.emoji, a.persona_name, a.role)}: ${text}` : text;
}

/** Sends one agent message right away (direct replies, intros, control confirmations). */
export async function postNow(trip: Trip, speaker: string, content: string) {
  const s = db();
  const { data: agents } = await s.from("agents").select("*").eq("trip_id", trip.id);
  await adapterFor(trip.provider).sendToGroup(trip.provider_group_id, formatFor(speaker, content, (agents ?? []) as Agent[]));
  await s.from("messages").insert({ trip_id: trip.id, sender_type: "agent", persona: speaker, content });
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

  // Drop stale low-value candidates
  for (const c of pending) {
    if (now - new Date(c.created_at).getTime() > STALE && c.urgency < 3) {
      await s.from("speak_candidates").update({ status: "dropped", reason: "stale: the moment passed" }).eq("id", c.id);
    }
  }
  const live = pending.filter((c) => now - new Date(c.created_at).getTime() <= STALE || c.urgency >= 3);
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
  const adapter = adapterFor(t.provider);

  let posted = 0;
  for (const c of claimed) {
    const text = formatFor(c.speaker, c.content, (agents ?? []) as Agent[]);
    try {
      await adapter.sendToGroup(t.provider_group_id, text);
    } catch (err) {
      // Put it back so the next tick retries instead of losing the message
      await s.from("speak_candidates").update({ status: "pending" }).eq("id", c.id);
      console.error("[spokesperson] send failed, candidate returned to pending", err);
      continue;
    }
    await s.from("messages").insert({ trip_id: tripId, sender_type: "agent", persona: c.speaker, content: c.content });
    await s.from("speak_candidates").update({
      status: "posted", posted_at: new Date().toISOString(), reason: force ? "forced" : `trigger: ${c.trigger}`,
    }).eq("id", c.id);
    posted++;
    if (claimed.length > 1) await new Promise((r) => setTimeout(r, 1200)); // feels like typing, keeps order
  }
  await s.from("trips").update({ last_agent_post_at: new Date().toISOString() }).eq("id", tripId);
  return { posted, reason: "posted" };
}
