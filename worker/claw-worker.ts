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
import { handleInbound } from "../lib/pipeline";
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

/** DMs: "start a trip with +1 613 555 0101, +1 613 555 0102" creates a new group with Huddle in it. */
async function handleDirectMessage(from: string, text: string) {
  const numbers = [...new Set((text.match(PHONE) ?? []).map(toE164))].filter((n) => n !== from);

  if (!/start|trip|plan/i.test(text) || numbers.length === 0) {
    await claw.send({
      to: from,
      text: "hey! i'm huddle 🧭 to start planning, text me: start a trip with +1 613 555 0101, +1 613 555 0102 (your friends' numbers). i'll make a group chat with all of you.",
    });
    return;
  }

  for (const n of [from, ...numbers]) {
    const r = await claw.registerNumber(n);
    if (!r.ok) console.warn(`[claw] could not register ${n.slice(0, 5)}…`, r.body?.error ?? "");
  }

  const members = [from, ...numbers];
  const result = await claw.send({
    to: members,
    text: "hey everyone! i'm huddle 🧭 i'll read this chat to help plan your trip and mostly stay quiet. " +
      "i'll bring in specialist agents when you need them. text \"huddle chill\" or \"huddle pause\" anytime.",
  });

  if (!result.ok || !result.chatId) {
    await claw.send({ to: from, text: `couldn't create the group (${result.error ?? result.errorCode ?? "unknown error"}). check your plan's registered number limit.` });
    return;
  }

  const s = db();
  const { data: trip } = await s.from("trips")
    .upsert({ provider: "claw", provider_group_id: result.chatId }, { onConflict: "provider,provider_group_id" })
    .select().single();
  await s.from("participants").upsert(members.map((address) => ({ trip_id: trip!.id, address })), { onConflict: "trip_id,address" });
  await s.from("messages").insert({ trip_id: trip!.id, sender_type: "agent", persona: "huddle", content: "group created" });

  await claw.send({ chatId: result.chatId, text: `see where the plan stands anytime: ${APP_URL}/trip/${trip!.id}` });
  console.log(`[huddle] trip ${trip!.id} created for chat ${result.chatId}`);
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
