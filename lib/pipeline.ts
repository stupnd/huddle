import type { InboundMessage } from "./messaging";
import { db, type Agent, type Trip } from "./supabase";
import { loadContext } from "./agents/context";
import { runListener } from "./agents/listener";
import { runOrchestrator } from "./agents/orchestrator";
import { runBudget } from "./agents/budget";
import { runDebate, runSpecialist } from "./agents/specialist";
import { directReply } from "./agents/reply";
import { BUDGET, HUDDLE, isAddressedTo } from "./agents/personas";
import { postNow, tick } from "./agents/spokesperson";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

async function getOrCreateTrip(msg: InboundMessage) {
  const s = db();
  const { data: existing } = await s.from("trips").select("*")
    .eq("provider", msg.provider).eq("provider_group_id", msg.groupId).maybeSingle();
  if (existing) return { trip: existing as Trip, isNew: false };
  const { data } = await s.from("trips").insert({ provider: msg.provider, provider_group_id: msg.groupId }).select().single();
  return { trip: data as Trip, isNew: true };
}

async function handleControl(trip: Trip, text: string) {
  const t = text.toLowerCase();
  if (!/\bhuddle\b/.test(t)) return false;
  const set = async (activity_level: string, reply: string) => {
    await db().from("trips").update({ activity_level }).eq("id", trip.id);
    await postNow({ ...trip, activity_level: activity_level as Trip["activity_level"] }, HUDDLE.key, reply);
    return true;
  };
  if (/\b(pause|stop|shh|shut up)\b/.test(t)) return set("paused", "got it, going quiet. text \"huddle resume\" when you want me back");
  if (/\bresume\b/.test(t)) return set("normal", "i'm back");
  if (/\bchill\b/.test(t)) return set("quiet", "ok, i'll only jump in when it really matters");
  if (/\bmore active\b/.test(t)) return set("active", "ok, i'll speak up more");
  if (/\bjust pick\b/.test(t)) return false; // handled as a direct question
  return false;
}

export async function handleInbound(msg: InboundMessage): Promise<{ tripId?: string; plan?: string; duplicate?: boolean }> {
  const s = db();

  // Providers can replay messages after a reconnect, so skip anything already stored
  if (msg.providerMessageId) {
    const { data: seen } = await s.from("messages").select("id").eq("provider_message_id", msg.providerMessageId).maybeSingle();
    if (seen) return { duplicate: true };
  }

  const { trip, isNew } = await getOrCreateTrip(msg);

  const { data: participant } = await s.from("participants")
    .upsert({ trip_id: trip.id, address: msg.fromAddress, ...(msg.fromName ? { display_name: msg.fromName } : {}) },
      { onConflict: "trip_id,address" })
    .select().single();

  const { data: message } = await s.from("messages").insert({
    trip_id: trip.id, participant_id: participant!.id, sender_type: "human", content: msg.text,
    provider_message_id: msg.providerMessageId ?? null,
  }).select().single();

  if (isNew) {
    await postNow(trip, HUDDLE.key,
      `hey! i'm huddle 🧭 i read this chat to help plan your trip and mostly stay quiet. ` +
      `i'll bring in specialist agents when you need them. text "huddle chill" or "huddle pause" anytime. ` +
      `see where the plan stands: ${APP_URL}/trip/${trip.id}`);
  }

  if (await handleControl(trip, msg.text)) return { tripId: trip.id };

  let ctx = await loadContext(trip.id);
  const senderLabel = participant!.display_name ?? msg.fromAddress;

  // 1. Listener always runs, silently
  await runListener(ctx, message!, senderLabel);
  ctx = await loadContext(trip.id);

  // 2. Direct tags always get a reply
  const tagged =
    isAddressedTo(msg.text, [HUDDLE.name]) ? { key: HUDDLE.key, name: "Huddle", role: "host" } :
    isAddressedTo(msg.text, [BUDGET.name, "budget"]) ? { key: BUDGET.key, name: BUDGET.name, role: "budget agent" } :
    (() => {
      const a = ctx.agents.find((x) => isAddressedTo(msg.text, [x.persona_name]));
      return a ? { key: a.id, name: a.persona_name, role: `${a.role} agent` } : null;
    })();
  if (tagged && ctx.trip.activity_level !== "paused") {
    const answer = await directReply(ctx, tagged, msg.text);
    await postNow(ctx.trip, tagged.key, answer);
    ctx = await loadContext(trip.id);
  }

  // 3. Orchestrator decides whether to spawn child agents or start a debate
  const plan: any = await runOrchestrator(ctx);
  const spawned: Agent[] = plan.agents ?? [];
  if (plan.action === "spawn_specialist" && spawned[0]) await runSpecialist(spawned[0]);
  if (plan.action === "start_debate" && spawned.length === 2) await runDebate(spawned);

  // 4. Budget agent checks whether money needs raising
  ctx = await loadContext(trip.id);
  await runBudget(ctx);

  // 5. Speak gate: posts only if the chat is quiet and cooldown allows
  await tick(trip.id);
  return { tripId: trip.id, plan: plan.action };
}
