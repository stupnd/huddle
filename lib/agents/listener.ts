import { db, type Message } from "../supabase";
import { askJSON, MODELS } from "./claude";
import { describe, type TripContext } from "./context";

type ListenerOutput = {
  trip_title?: string | null;
  sender_display_name?: string | null;
  preferences: { category: string; value: string; private: boolean; replaces_existing_category?: boolean }[];
  decisions: { topic: string; status: "open" | "proposed" | "decided"; chosen?: string | null; options?: string[] }[];
};

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

Reply with JSON only:
{"trip_title": null, "sender_display_name": null, "preferences": [], "decisions": []}`;

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

  for (const p of out.preferences ?? []) {
    if (p.replaces_existing_category) {
      await s.from("preferences").delete().eq("participant_id", participantId).eq("category", p.category);
    }
    await s.from("preferences").insert({
      trip_id: ctx.trip.id,
      participant_id: participantId,
      category: p.category,
      value: p.value,
      visibility: p.private ? "private" : "group",
      source_message_id: message.id,
    });
  }

  for (const d of out.decisions ?? []) {
    const existing = ctx.decisions.find((x) => x.topic.toLowerCase() === d.topic.toLowerCase());
    const options = (d.options ?? []).map((label) => ({ label }));
    if (existing) {
      await s
        .from("decisions")
        .update({
          status: d.status === "decided" ? "decided" : existing.status,
          chosen: d.chosen ?? existing.chosen,
          options: options.length ? options : existing.options,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await s.from("decisions").insert({ trip_id: ctx.trip.id, topic: d.topic, status: d.status, chosen: d.chosen ?? null, options });
    }
  }

  return out;
}
