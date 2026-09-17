import { db, type Message } from "../supabase";
import { askJSON, MODELS } from "./claude";
import { describe, findDecision, sameTopic, type TripContext } from "./context";

type Pref = { category: string; value: string; private: boolean; replaces_existing_category?: boolean };
type Dec = { topic: string; status: "open" | "proposed" | "decided"; chosen: string | null; options: string[] };

type ListenerOutput = {
  trip_title?: string | null;
  sender_display_name?: string | null;
  preferences: any[];
  decisions: any[];
};

/**
 * The listener model keeps the shape but renames fields ("preference" for "value",
 * "details" for "topic"). Those rows used to hit a not-null constraint and get dropped
 * silently, so fold the common aliases back and skip anything still unusable.
 */
function normalizePrefs(raw: any[]): Pref[] {
  return (raw ?? []).flatMap((p): Pref[] => {
    const category = p?.category ?? p?.type;
    const value = p?.value ?? p?.preference ?? p?.detail ?? p?.details ?? p?.text ?? p?.description;
    if (!category || !value) return [];
    return [{
      category: String(category).toLowerCase().trim(),
      value: String(value).trim(),
      private: Boolean(p.private ?? p.is_private),
      replaces_existing_category: Boolean(p.replaces_existing_category ?? p.replaces),
    }];
  });
}

function normalizeDecisions(raw: any[]): Dec[] {
  return (raw ?? []).flatMap((d): Dec[] => {
    const topic = d?.topic ?? d?.details ?? d?.description ?? d?.question ?? d?.category;
    if (!topic) return [];
    const status = ["open", "proposed", "decided"].includes(d?.status) ? d.status : "open";
    return [{
      topic: String(topic).trim(),
      status,
      chosen: d?.chosen ?? d?.choice ?? null,
      options: Array.isArray(d?.options) ? d.options.map((o: any) => String(o?.label ?? o)) : [],
    }];
  });
}

const SYSTEM = `You are the Listener agent inside Huddle, a group trip planner that lives in an iMessage group chat.
You NEVER talk in the chat. Your only job is to turn the newest message into structured trip state.

Rules:
- Extract only preferences the SENDER states about themselves (dates they can do, budget, lodging, transport, food, activities, dislikes).
- Budget amounts and anything about money trouble are private: set private=true.
- Ignore jokes, memes, and banter. Most messages produce nothing.
- If the sender changes their mind, set replaces_existing_category=true.
- Track group decisions: a new topic being discussed is "open"; a clear group agreement is "decided".
- If the sender introduces themselves ("it's Priya"), return sender_display_name.
- If the message names the trip (destination, dates), return trip_title like "Montreal, reading week".
- Only record a decision when the group is choosing between concrete things. Skip vague topics like "destination" once the destination is already settled.

Reply with JSON only, using exactly these keys. Use "value", never "preference". Use "topic", never "details".
{"trip_title": "Montreal, reading week",
 "sender_display_name": null,
 "preferences": [{"category": "transport", "value": "wants walkable, no ubers", "private": false, "replaces_existing_category": false}],
 "decisions": [{"topic": "where to stay", "status": "open", "chosen": null, "options": []}]}

Return empty arrays when the message contains nothing worth recording.`;

export async function runListener(ctx: TripContext, message: Message, senderLabel: string) {
  const out = await askJSON<ListenerOutput>(
    {
      model: MODELS.listener,
      system: SYSTEM,
      prompt: `${describe(ctx)}\n\nNEWEST MESSAGE from ${senderLabel}:\n${message.content}`,
      maxTokens: 800,
    },
    { preferences: [], decisions: [] }
  );

  const s = db();
  const participantId = message.participant_id!;

  if (out.sender_display_name) {
    await s.from("participants").update({ display_name: out.sender_display_name }).eq("id", participantId);
  }
  if (out.trip_title && !ctx.trip.title) {
    await s.from("trips").update({ title: out.trip_title }).eq("id", ctx.trip.id);
  }

  for (const p of normalizePrefs(out.preferences)) {
    if (p.replaces_existing_category) {
      await s.from("preferences").delete().eq("participant_id", participantId).eq("category", p.category);
    }
    const { error } = await s.from("preferences").insert({
      trip_id: ctx.trip.id,
      participant_id: participantId,
      category: p.category,
      value: p.value,
      visibility: p.private ? "private" : "group",
      source_message_id: message.id,
    });
    if (error) console.error("[listener] could not save preference", p, error.message);
  }

  for (const d of normalizeDecisions(out.decisions)) {
    const existing = findDecision(ctx.decisions, d.topic);
    const options = d.options.map((label) => ({ label }));
    const { error } = existing
      ? await s
          .from("decisions")
          .update({
            status: d.status === "decided" ? "decided" : existing.status,
            chosen: d.chosen ?? existing.chosen,
            options: options.length ? options : existing.options,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
      : await s.from("decisions").insert({ trip_id: ctx.trip.id, topic: d.topic, status: d.status, chosen: d.chosen, options });
    if (error) console.error("[listener] could not save decision", d, error.message);

    // A debate row and the listener's row can describe the same choice in different words.
    // When one is decided, close the others so the dashboard stops showing a finished debate.
    if (d.status === "decided") {
      const stale = ctx.decisions.filter(
        (x) => x.id !== existing?.id && x.status !== "decided" && sameTopic(x.topic, d.topic)
      );
      for (const row of stale) {
        await s.from("decisions")
          .update({ status: "decided", chosen: d.chosen ?? row.chosen, updated_at: new Date().toISOString() })
          .eq("id", row.id);
      }
    }
  }

  return out;
}
