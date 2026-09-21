import type { InboundMessage } from "./messaging";
import { db, type Agent, type Trip } from "./supabase";
import { loadContext } from "./agents/context";
import { runListener } from "./agents/listener";
import { runOrchestrator } from "./agents/orchestrator";
import { runDebate, runSpecialist } from "./agents/specialist";
import { directReply } from "./agents/reply";
import { runMonitor, verifyDraft } from "./agents/monitor";
import { runChimeIn } from "./agents/chimein";
import { answerDigestItems, postDigestNow, runDigest } from "./agents/digest";
import { WHATS_LEFT } from "./agents/digest-state";
import { checkBudget } from "./agents/budget";
import { BUDGET, HUDDLE, unknownAgentMention, whoIsTagged } from "./agents/personas";
import { postNow, tick } from "./agents/spokesperson";
import { enqueuePlan } from "./jobs";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

async function getOrCreateTrip(msg: InboundMessage) {
  const s = db();
  const { data: existing } = await s.from("trips").select("*")
    .eq("provider", msg.provider).eq("provider_group_id", msg.groupId).eq("status", "active").maybeSingle();
  if (existing) return { trip: existing as Trip, isNew: false };
  const trip = await startTrip(msg.provider, msg.groupId);
  return { trip, isNew: true };
}

/**
 * Archives whatever active trip a group chat has (a no-op if none) and starts a fresh one in
 * its place. Used for the first-ever message to a group, and by the DM "start a trip" flow
 * when the confirmed group reuses a chatId iMessage/Claw resolved back to an existing chat.
 */
export async function startTrip(provider: string, groupId: string, title: string | null = null): Promise<Trip> {
  const s = db();
  await s.from("trips").update({ status: "archived" })
    .eq("provider", provider).eq("provider_group_id", groupId).eq("status", "active");
  const { data } = await s.from("trips").insert({ provider, provider_group_id: groupId, title }).select().single();
  return data as Trip;
}

/** "start a trip ... named X" / "... called X" — the words after named/called become the title. */
export function parseTripTitle(text: string): string | null {
  const quoted = text.match(/(?:named|called)\s+"([^"]+)"/i);
  if (quoted) return quoted[1].trim();
  const bare = text.match(/(?:named|called)\s+(.+)$/i);
  return bare ? bare[1].trim().replace(/["'.!]+$/, "") || null : null;
}

const CALL_OUT_PHRASES = /\b(call me|call out|@?huddle only|mentions? only|tag me)\b/i;
const CHIME_IN_PHRASES = /\b(chime in|listen in|jump in|whenever|on your own|read along|proactive(?:ly)?)\b/i;

/** Answer to the "call me or chime in?" onboarding question, if this message looks like one. */
export function parseMentionModeAnswer(text: string): "call_out" | "listen_in" | null {
  if (CALL_OUT_PHRASES.test(text)) return "call_out";
  if (CHIME_IN_PHRASES.test(text)) return "listen_in";
  return null;
}

/**
 * Makes a different trip in this same group chat the active one ("huddle plan trip <id> instead").
 * A chat can end up with more than one trip when a confirmed "start a new one" DM reuses the same
 * chatId (same participant set) — only one can be active at a time, but neither is ever deleted, so
 * this lets the group swap back and forth. `idFragment` only needs to be an unambiguous prefix of
 * the id from the trip's own dashboard link.
 */
export async function switchTrip(
  provider: string,
  groupId: string,
  idFragment: string
): Promise<{ trip: Trip; alreadyActive: boolean } | "not_found" | "ambiguous"> {
  const s = db();
  const frag = idFragment.trim().toLowerCase();
  const { data: trips } = await s.from("trips").select("*").eq("provider", provider).eq("provider_group_id", groupId);
  const matches = (trips ?? []).filter((t) => t.id.toLowerCase().startsWith(frag)) as Trip[];
  if (matches.length === 0) return "not_found";
  if (matches.length > 1) return "ambiguous";
  const target = matches[0];
  if (target.status === "active") return { trip: target, alreadyActive: true };
  await s.from("trips").update({ status: "archived" }).eq("provider", provider).eq("provider_group_id", groupId).eq("status", "active");
  const { data: updated } = await s.from("trips").update({ status: "active" }).eq("id", target.id).select().single();
  return { trip: updated as Trip, alreadyActive: false };
}

async function handleControl(trip: Trip, text: string): Promise<{ handled: boolean; tripId?: string }> {
  const t = text.toLowerCase();
  if (!/\bhuddle\b/.test(t)) return { handled: false };
  const set = async (activity_level: string, reply: string) => {
    await db().from("trips").update({ activity_level }).eq("id", trip.id);
    await postNow({ ...trip, activity_level: activity_level as Trip["activity_level"] }, HUDDLE.key, reply);
    return { handled: true };
  };

  const planTrip = t.match(/plan trip(?:\s*id)?[:\s]+([0-9a-f-]{4,})\s*instead/i);
  if (planTrip) {
    const result = await switchTrip(trip.provider, trip.provider_group_id, planTrip[1]);
    if (result === "not_found") {
      await postNow(trip, HUDDLE.key, `couldn't find a trip starting with "${planTrip[1]}" in this chat.`);
      return { handled: true };
    }
    if (result === "ambiguous") {
      await postNow(trip, HUDDLE.key, `a few trips in this chat start with "${planTrip[1]}" — use a few more characters from the id.`);
      return { handled: true };
    }
    if (result.alreadyActive) {
      await postNow(result.trip, HUDDLE.key, `that's already the one we're planning.`);
      return { handled: true, tripId: result.trip.id };
    }
    await postNow(result.trip, HUDDLE.key, `switched — picking up${result.trip.title ? ` "${result.trip.title}"` : ""} where we left off.`);
    return { handled: true, tripId: result.trip.id };
  }

  if (/\b(pause|stop|shh|shut up)\b/.test(t)) return set("paused", "got it, going quiet. text \"huddle resume\" when you want me back");
  if (/\bresume\b/.test(t)) return set("normal", "i'm back");
  if (/\bchill\b/.test(t)) return set("quiet", "ok, i'll only jump in when it really matters");
  if (/\bmore active\b/.test(t)) return set("active", "ok, i'll speak up more");
  if (/\bjust pick\b/.test(t)) return { handled: false }; // handled as a direct question
  return { handled: false };
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

  const { data: message, error: messageError } = await s.from("messages").insert({
    trip_id: trip.id, participant_id: participant!.id, sender_type: "human", content: msg.text,
    provider_message_id: msg.providerMessageId ?? null,
  }).select().single();
  // A unique provider_message_id violation here means two deliveries of the same message raced
  // past the "seen" check above (e.g. two worker processes briefly both connected) — the other
  // delivery already recorded it, so this one is a duplicate, not a failure.
  if (!message) {
    console.warn("[pipeline] message insert returned nothing, treating as a duplicate", messageError?.message);
    return { duplicate: true };
  }

  if (isNew) {
    await postNow(trip, HUDDLE.key,
      `hey! i'm huddle 🧭 i read this chat to help plan your trip and mostly stay quiet. ` +
      `i'll bring in specialist agents when you need them. text "huddle chill" or "huddle pause" anytime. ` +
      `see where the plan stands: ${APP_URL}/trip/${trip.id}`);
    await postNow(trip, HUDDLE.key,
      `one more thing — want me to only jump in when you say "huddle" (call me), or should i read along and speak up ` +
      `on my own when it seems useful (chime in)? reply "call me" or "chime in" anytime.`);
  }

  const control = await handleControl(trip, msg.text);
  if (control.handled) return { tripId: control.tripId ?? trip.id };

  if (!trip.settings?.mention_mode) {
    const mode = parseMentionModeAnswer(msg.text);
    if (mode) {
      await s.from("trips").update({ settings: { ...trip.settings, mention_mode: mode } }).eq("id", trip.id);
      await postNow(
        trip,
        HUDDLE.key,
        mode === "call_out"
          ? `got it — i'll only jump in when you say "huddle."`
          : `got it — i'll read along and speak up when it's useful (still won't talk much).`
      );
      return { tripId: trip.id };
    }
  }

  let ctx = await loadContext(trip.id);
  const senderLabel = participant!.display_name ?? msg.fromAddress;

  // 1. Listener always runs, silently
  await runListener(ctx, message, senderLabel);
  ctx = await loadContext(trip.id);

  // 1b. On long chats, scan recent agent posts for drift against prefs/decisions
  await runMonitor(ctx);
  ctx = await loadContext(trip.id);

  // 1c. What's still open goes into chat as one short numbered list, rarely, instead of a nudge per
  // decision. The speak gate below decides when it actually posts.
  await runDigest(ctx);
  ctx = await loadContext(trip.id);

  // 2. Agents speak only when someone @mentions them. Nobody volunteers.
  //    The one exception is the trip intro above, which is the "first time" message.
  const pennyOn = ctx.trip.settings?.penny !== false;
  const tagged = whoIsTagged(msg.text, ctx.agents, undefined, pennyOn);

  // "@juno" when only Nova is here would otherwise vanish. Say who is around instead.
  if (!tagged && ctx.trip.activity_level !== "paused") {
    const missing = unknownAgentMention(msg.text, ctx.agents, ctx.participants.map((p) => p.display_name ?? ""));
    if (missing) {
      const here = ctx.agents.map((a) => `${a.persona_name} (${a.role})`).join(", ");
      await postNow(ctx.trip, HUDDLE.key,
        `there's no ${missing} on this trip${here ? `. here: ${here}` : ", just me"}${pennyOn ? ", plus penny for budget" : ""}. ` +
        `tell me what you need and i'll bring in the right specialist`);
      return { tripId: trip.id };
    }
  }

  // "@huddle plan saturday" builds the real itinerary rather than a made-up one in prose.
  // The planner posts its own two-line summary with a link, so no direct reply on top.
  const wantsPlan = tagged?.key === HUDDLE.key && /\b(plan|itinerary|schedule|timeline)\b/i.test(msg.text);
  if (wantsPlan && ctx.trip.activity_level !== "paused") {
    // Queue it (announced) and acknowledge now; the worker posts the plan when it's built
    const job = await enqueuePlan(trip.id, "plan", true);
    await postNow(ctx.trip, HUDDLE.key, job ? "on it, give me a minute" : "already working on it");
    return { tripId: trip.id, plan: "itinerary" };
  }

  // "@huddle what's left?" gets the numbered list of open decisions, threaded under the question
  if (tagged?.key === HUDDLE.key && WHATS_LEFT.test(msg.text) && ctx.trip.activity_level !== "paused") {
    await postDigestNow(ctx, msg.providerMessageId);
    return { tripId: trip.id, plan: "digest" };
  }

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
  } else {
    // 2b. Someone may be answering an item on the open-decisions list: confirm it (or ask for a
    // clearer answer) right under their message, and stay out of the way of anything else.
    const answered = ctx.trip.activity_level !== "paused"
      && await answerDigestItems(ctx, message, { text: msg.text, providerMessageId: msg.providerMessageId, replyToMessageId: msg.replyToMessageId }, senderLabel);
    // 2c. Nobody tagged Huddle, but this group asked it to read along and judge for itself.
    if (!answered && ctx.trip.settings?.mention_mode === "listen_in") await runChimeIn(ctx);
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

  // Keep the plan current without anyone pressing a button. A trip with a title or a decided
  // item gets a silent rebuild queued whenever something changed since the last build; the
  // queue dedupes, so a burst of messages costs one build, and the worker does the slow part.
  await maybeAutoPlan(trip.id);

  // 4b. Is the plan now over what someone said they can spend? Skipped when Penny was just asked
  // directly, since she is already answering the money question; the next message or plan build re-checks.
  if (tagged?.key !== BUDGET.key) await checkBudget(trip.id).catch((err) => console.error("[budget] check failed", err));

  // 5. Speak gate: posts only if the chat is quiet and cooldown allows
  await tick(trip.id);
  return { tripId: trip.id, plan: plan.action };
}

const AUTO_PLAN_MIN_GAP_MS = 3 * 60_000;

async function maybeAutoPlan(tripId: string) {
  const s = db();
  const [{ data: trip }, { data: decided }, { data: lastBuild }, { data: latestChange }] = await Promise.all([
    s.from("trips").select("title").eq("id", tripId).maybeSingle(),
    s.from("decisions").select("id").eq("trip_id", tripId).eq("status", "decided").limit(1),
    s.from("itinerary_items").select("created_at").eq("trip_id", tripId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    s.from("decisions").select("updated_at").eq("trip_id", tripId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!trip?.title && !decided?.length) return;                     // nothing to plan around yet
  const builtAt = lastBuild ? new Date(lastBuild.created_at).getTime() : 0;
  const changedAt = latestChange ? new Date(latestChange.updated_at).getTime() : Date.now();
  if (builtAt && changedAt <= builtAt) return;                        // plan already reflects the latest state
  if (Date.now() - builtAt < AUTO_PLAN_MIN_GAP_MS) return;            // don't thrash on a burst
  await enqueuePlan(tripId, "plan", false);
}
