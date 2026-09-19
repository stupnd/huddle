/**
 * Huddle's iMessage worker for Claw Messenger.
 *
 * Claw delivers inbound messages over a WebSocket, which serverless functions can't hold open,
 * so this small always-on process:
 *   1. keeps the Claw socket connected
 *   2. runs the agent pipeline for every group message
 *   3. handles DMs to Huddle, including starting a new trip group
 *   4. runs the speak-when-needed gate every 15 seconds
 *
 * Run locally:  npm run worker
 * Deploy:       any always-on Node host (Railway, Fly.io, Render background worker)
 */
import { claw, DM_TEST_MODE, parseClawMessage } from "../lib/messaging/claw";
import { handleInbound, parseTripTitle, startTrip } from "../lib/pipeline";
import { db } from "../lib/supabase";
import { loadContext } from "../lib/agents/context";
import { runMonitor } from "../lib/agents/monitor";
import { tick } from "../lib/agents/spokesperson";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const PHONE = /\+?\d[\d\s().-]{8,}\d/g;

function toE164(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;            // assume North America
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

// Process one message at a time per group so agents see messages in order
const queues = new Map<string, Promise<unknown>>();
function enqueue(key: string, job: () => Promise<unknown>) {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.then(job).catch((err) => console.error("[pipeline]", err));
  queues.set(key, next);
  return next;
}

const YES = /^\s*(yes|yeah|yep|yup|sure|do it|please|ok(ay)?|confirm)\b/i;
const NO = /^\s*(no|nah|nope|cancel|never ?mind)\b/i;
const CONFIRM_TTL_MS = 10 * 60_000;

/** Awaiting "yes"/"no" to "a trip already exists for you, start a new one?", keyed by the DM sender. */
type PendingNewTrip = { numbers: string[]; title: string | null; matchedTripId: string; expiresAt: number };
const pendingNewTrip = new Map<string, PendingNewTrip>();

/** Same address set (order-independent) as an already-active claw trip, if any. */
async function findTripForMembers(members: string[]): Promise<{ id: string; title: string | null } | null> {
  const s = db();
  const want = new Set(members.map((m) => m.toLowerCase()));
  const { data: trips } = await s.from("trips").select("id, title").eq("provider", "claw").eq("status", "active");
  for (const t of trips ?? []) {
    const { data: parts } = await s.from("participants").select("address").eq("trip_id", t.id);
    const have = new Set((parts ?? []).map((p) => p.address.toLowerCase()));
    if (have.size === want.size && [...want].every((a) => have.has(a))) return t;
  }
  return null;
}

/** Registers everyone, creates the iMessage group, and starts the trip. */
async function createTripGroup(from: string, numbers: string[], title: string | null) {
  for (const n of [from, ...numbers]) {
    const r = await claw.registerNumber(n);
    if (!r.ok) console.warn(`[claw] could not register ${n.slice(0, 5)}…`, r.body?.error ?? "");
  }

  const members = [from, ...numbers];
  const result = await claw.send({
    to: members,
    text: "hey everyone! i'm huddle 🧭 i'll read this chat to help plan your trip and mostly stay quiet. " +
      "i'll bring in specialist agents when you need them. text \"huddle chill\" or \"huddle pause\" anytime, or " +
      "\"huddle plan trip <id> instead\" to switch to a different trip in this chat.",
  });

  if (!result.ok || !result.chatId) {
    await claw.send({ to: from, text: `couldn't create the group (${result.error ?? result.errorCode ?? "unknown error"}). check your plan's registered number limit.` });
    return;
  }

  // Confirming "start a new one" for a group Claw/iMessage resolves back to an existing chatId
  // (same participant set) still needs its own trip: startTrip archives what's active there first.
  const s = db();
  const trip = await startTrip("claw", result.chatId, title);
  await s.from("participants").upsert(members.map((address) => ({ trip_id: trip.id, address })), { onConflict: "trip_id,address" });
  await s.from("messages").insert({ trip_id: trip.id, sender_type: "agent", persona: "huddle", content: "group created" });

  await claw.send({ chatId: result.chatId, text: `see where the plan stands anytime: ${APP_URL}/trip/${trip.id}` });
  console.log(`[huddle] trip ${trip.id} created for chat ${result.chatId}${title ? ` ("${title}")` : ""}`);
}

/** DMs: "start a trip with +1 613 555 0101, +1 613 555 0102" creates a new group with Huddle in it. */
async function handleDirectMessage(from: string, text: string) {
  const pending = pendingNewTrip.get(from);
  if (pending && Date.now() < pending.expiresAt) {
    pendingNewTrip.delete(from);
    if (YES.test(text)) return createTripGroup(from, pending.numbers, pending.title);
    if (NO.test(text)) {
      await claw.send({ to: from, text: `no worries — sticking with the existing one: ${APP_URL}/trip/${pending.matchedTripId}` });
      return;
    }
    // anything else: fall through and re-evaluate this message as a fresh command
  }

  const numbers = [...new Set((text.match(PHONE) ?? []).map(toE164))].filter((n) => n !== from);

  if (!/start|trip|plan/i.test(text) || numbers.length === 0) {
    await claw.send({
      to: from,
      text: "hey! i'm huddle 🧭 to start planning, text me: start a trip with +1 613 555 0101, +1 613 555 0102 (your friends' numbers). " +
        "add \"named ...\" to give it a title. i'll make a group chat with all of you.",
    });
    return;
  }

  const title = parseTripTitle(text);
  const members = [from, ...numbers];
  const existing = await findTripForMembers(members);
  if (existing) {
    pendingNewTrip.set(from, { numbers, title, matchedTripId: existing.id, expiresAt: Date.now() + CONFIRM_TTL_MS });
    await claw.send({
      to: from,
      text: `a trip already exists for you and this group${existing.title ? ` ("${existing.title}")` : ""}: ${APP_URL}/trip/${existing.id}\n` +
        `want to start a new one instead? reply yes to confirm — both stay, and you can switch back anytime with ` +
        `"huddle plan trip ${existing.id.slice(0, 8)} instead" in the group chat.`,
    });
    return;
  }

  await createTripGroup(from, numbers, title);
}

async function main() {
  for (const key of ["CLAW_API_KEY", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"]) {
    if (!process.env[key]) throw new Error(`Missing ${key} in environment`);
  }

  claw.onEvent((event) => {
    if (event.type === "message") {
      const inbound = parseClawMessage(event);
      if (inbound) {
        enqueue(inbound.groupId, async () => {
          const r = await handleInbound(inbound);
          if (!r.duplicate) console.log(`[huddle] processed group message, orchestrator: ${r.plan ?? "none"}`);
        });
      } else if (!DM_TEST_MODE && !event.isGroup && event.from && event.text && !event.replay) {
        enqueue(`dm:${event.from}`, () => handleDirectMessage(event.from, event.text));
      }
    } else if (event.type === "error") {
      console.warn("[claw] error event", event.code, event.message);
    }
  });

  await claw.connect();

  // Speak gate: check trips with held messages every 15 seconds
  setInterval(async () => {
    const { data } = await db().from("speak_candidates").select("trip_id").eq("status", "pending");
    const tripIds = [...new Set((data ?? []).map((r) => r.trip_id))];
    for (const id of tripIds) {
      enqueue(`tick:${id}`, async () => {
        const r = await tick(id);
        if (r.posted) console.log(`[huddle] posted ${r.posted} message(s) to trip ${id}`);
      });
    }
  }, 15_000);

  // Long-chat monitor: every 2 minutes, scan active trips whose transcript window is full
  setInterval(async () => {
    const { data: trips } = await db()
      .from("trips")
      .select("id")
      .neq("activity_level", "paused")
      .order("created_at", { ascending: false })
      .limit(20);
    for (const t of trips ?? []) {
      enqueue(`monitor:${t.id}`, async () => {
        const ctx = await loadContext(t.id);
        const r = await runMonitor(ctx);
        if (r.scanned && r.issues) console.log(`[monitor] trip ${t.id}: ${r.issues} issue(s)`);
      });
    }
  }, 120_000);

  if (DM_TEST_MODE) {
    console.log("[huddle] DM_TEST_MODE is on: your 1:1 chat with Huddle runs as a one-person group. Turn it off for real groups.");
  }
  console.log("[huddle] worker running");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
