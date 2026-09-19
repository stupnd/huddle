import type { InboundMessage } from "./messaging";
import { db, type Agent, type Trip } from "./supabase";
import { loadContext } from "./agents/context";
import { runListener } from "./agents/listener";
import { runOrchestrator } from "./agents/orchestrator";
import { runDebate, runSpecialist } from "./agents/specialist";
import { directReply } from "./agents/reply";
import { runMonitor, verifyDraft } from "./agents/monitor";
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

type Speaker = { key: string; name: string; role: string };

/** Which agent a message addresses, if any. `except` stops an agent from calling itself. */
function whoIsTagged(text: string, agents: Agent[], except?: string, pennyOn = true): Speaker | null {
  const candidates: Speaker[] = [
    { key: HUDDLE.key, name: HUDDLE.name, role: "host" },
    ...(pennyOn ? [{ key: BUDGET.key, name: BUDGET.name, role: "budget agent" }] : []),
    ...agents.map((a) => ({ key: a.id, name: a.persona_name, role: `${a.role} agent` })),
  ];
  return candidates.find((c) => c.key !== except && isAddressedTo(text, c.key === BUDGET.key ? [c.name, "budget"] : [c.name])) ?? null;
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
    .upsert({ trip_id: trip.id, address: msg.fromAddress }, { onConflict: "trip_id,address" })
    .select().single();
  // A name from the provider fills a blank, but never overwrites one set in the app or from the chat
  if (msg.fromName && !participant!.display_name) {
    await s.from("participants").update({ display_name: msg.fromName }).eq("id", participant!.id);
    participant!.display_name = msg.fromName;
  }

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

  // 1b. On long chats, scan recent agent posts for drift against prefs/decisions
  await runMonitor(ctx);
  ctx = await loadContext(trip.id);

  // 2. Agents speak only when someone @mentions them. Nobody volunteers.
  //    The one exception is the trip intro above, which is the "first time" message.
  const pennyOn = ctx.trip.settings?.penny !== false;
  const tagged = whoIsTagged(msg.text, ctx.agents, undefined, pennyOn);
  if (tagged && ctx.trip.activity_level !== "paused") {
    const draft = await directReply(ctx, tagged, msg.text);
    const answer = await verifyDraft(ctx, tagged, draft);
    await postNow(ctx.trip, tagged.key, answer);
    ctx = await loadContext(trip.id);

    // 3. Agents can call each other: if the reply says "@penny", Penny answers next.
    //    One hop only, so two agents cannot ping-pong forever.
    const next = whoIsTagged(answer, ctx.agents, tagged.key, pennyOn);
    if (next) {
      const followDraft = await directReply(ctx, next, `${tagged.name} asked you: ${answer}`);
      const followUp = await verifyDraft(ctx, next, followDraft);
      await postNow(ctx.trip, next.key, followUp);
      ctx = await loadContext(trip.id);
    }
  }

  // 4. Huddle brings in a specialist only when asked to. "@huddle find us a hotel" spawns a
  //    stays agent, which introduces itself once and is then silent until someone @mentions it.
  let plan: any = { action: "none" };
  if (tagged?.key === HUDDLE.key && ctx.trip.activity_level !== "paused") {
    plan = await runOrchestrator(ctx);
    const spawned: Agent[] = plan.agents ?? [];
    if (plan.action === "spawn_specialist" && spawned[0]) await runSpecialist(spawned[0]);
    if (plan.action === "start_debate" && spawned.length === 2) await runDebate(spawned);
  }

  // 5. Speak gate: posts only if the chat is quiet and cooldown allows
  await tick(trip.id);
  return { tripId: trip.id, plan: plan.action };
}
