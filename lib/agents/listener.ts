import { db, type Message } from "../supabase";
import { askJSON, MODELS } from "./claude";
import { describe, findDecision, sameTopic, type TripContext } from "./context";

type Pref = { category: string; value: string; private: boolean; replaces_existing_category?: boolean; about?: string | null };
type Dec = { topic: string; status: "open" | "proposed" | "decided"; chosen: string | null; options: string[] };
type Vote = { topic: string; option: string };

type ListenerOutput = {
  trip_title?: string | null;
  sender_display_name?: string | null;
  preferences: any[];
  decisions: any[];
  votes: any[];
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
      about: typeof p.about === "string" && p.about.trim() && !/^(me|myself|self|null)$/i.test(p.about.trim()) ? p.about.trim() : null,
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

function normalizeVotes(raw: any[]): Vote[] {
  return (raw ?? []).flatMap((v): Vote[] => {
    const topic = v?.topic ?? v?.decision ?? v?.for;
    const option = v?.option ?? v?.choice ?? v?.pick;
    if (!topic || !option) return [];
    return [{ topic: String(topic).trim(), option: String(option).trim() }];
  });
}

/** Loose enough to match "the hostel" against "Hostel near downtown", strict enough to not match nothing. */
function normOptionLabel(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
function findOption(options: { label: string }[], want: string) {
  const w = normOptionLabel(want);
  if (!w) return undefined;
  return options.find((o) => {
    const l = normOptionLabel(o.label);
    return l === w || l.includes(w) || w.includes(l);
  });
}

const SYSTEM = `You are the Listener agent inside Huddle, a group trip planner that lives in an iMessage group chat.
You NEVER talk in the chat. Your only job is to turn the newest message into structured trip state.

Rules:
- Extract only preferences the SENDER states about themselves (dates they can do, budget, lodging, transport, food, activities, dislikes).
- One exception: a dietary need, allergy, mobility limit or firm dislike the sender states for a NAMED person in the chat ("Priya's vegetarian", "Sam can't do stairs"). Record it with "about" set to that person's name, and never guess a name.
- Budget amounts and anything about money trouble are private: set private=true.
- Ignore jokes, memes, and banter. Most messages produce nothing.
- If the sender changes their mind, set replaces_existing_category=true.
- Track group decisions: a new topic being discussed is "open"; a clear group agreement is "decided".
- If the sender introduces themselves ("it's Priya"), return sender_display_name.
- If the message names the trip (destination, dates), return trip_title like "Montreal, reading week".
- A decision is a choice the group has to make between concrete alternatives: LA vs Bangkok, hostel vs hotel, which night for the concert. Record those.
- A question, a request ("give me a plan for saturday"), a topic someone raised, or a wish is NOT a decision. Never create decisions like "Saturday itinerary", "what to do", "day-by-day plan", or "directions from LAX". Those are requests; the planner handles them.
- Do not create a decision for something already decided or already open under a similar name. When unsure, return no decision. An extra decision row is worse than a missing one.
- If the sender states their OWN pick among a decision's ALREADY LISTED options ("I'm down for the hostel", "put me down for pizza", "hotel gets my vote"), record it under "votes" as {"topic", "option"}. Only when that option is already listed for that decision — proposing something new is not a vote. A vague "sounds good" or "either works" with no specific option named is not a vote either.

Reply with JSON only, using exactly these keys. Use "value", never "preference". Use "topic", never "details".
{"trip_title": "Montreal, reading week",
 "sender_display_name": null,
 "preferences": [{"category": "transport", "value": "wants walkable, no ubers", "private": false, "replaces_existing_category": false, "about": null}],
 "decisions": [{"topic": "where to stay", "status": "open", "chosen": null, "options": []}],
 "votes": [{"topic": "where to stay", "option": "the hostel"}]}

Return empty arrays when the message contains nothing worth recording.`;

/** Matches a name to someone in the chat: the whole display name or just the first name, ignoring case. */
export function findPerson<T extends { display_name: string | null }>(people: T[], name: string): T | undefined {
  const want = name.trim().toLowerCase();
  const first = (s: string) => s.trim().toLowerCase().split(/\s+/)[0];
  return people.find((p) => p.display_name && (p.display_name.trim().toLowerCase() === want || first(p.display_name) === first(want)));
}

export async function runListener(ctx: TripContext, message: Message, senderLabel: string) {
  const out = await askJSON<ListenerOutput>(
    {
      model: MODELS.listener,
      system: SYSTEM,
      prompt: `${describe(ctx)}\n\nNEWEST MESSAGE from ${senderLabel}:\n${message.content}`,
      maxTokens: 800,
    },
    { preferences: [], decisions: [], votes: [] }
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
    // A need the sender states for someone else belongs to that person. When the name matches no one
    // in the chat yet, keep it under the sender with the name in front so it still reaches every agent.
    const subject = p.about ? findPerson(ctx.participants, p.about) : undefined;
    const forOther = Boolean(p.about) && subject?.id !== participantId;
    const ownerId = forOther && subject ? subject.id : participantId;
    const value = forOther && !subject ? `${p.about}: ${p.value}` : p.value;
    // Only someone's own change of mind may clear their earlier answer
    if (p.replaces_existing_category && !forOther) {
      await s.from("preferences").delete().eq("participant_id", participantId).eq("category", p.category);
    }
    const { error } = await s.from("preferences").insert({
      trip_id: ctx.trip.id,
      participant_id: ownerId,
      category: p.category,
      value,
      visibility: p.private ? "private" : "group",
      source_message_id: message.id,
    });
    if (error) console.error("[listener] could not save preference", p, error.message);
  }

  // Tracks the decision rows this message just touched, id and final options, so a vote in the
  // same message ("let's do X, I'm in for the hostel") can match against options just written
  // rather than the stale snapshot in ctx.
  const written: { id: string; topic: string; options: { label: string }[] }[] = [];

  for (const d of normalizeDecisions(out.decisions)) {
    const existing = findDecision(ctx.decisions, d.topic);
    const options = d.options.map((label) => ({ label }));
    const finalOptions = options.length ? options : existing?.options ?? [];
    const { data: row, error } = existing
      ? await s
          .from("decisions")
          .update({
            status: d.status === "decided" ? "decided" : existing.status,
            chosen: d.chosen ?? existing.chosen,
            options: finalOptions,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select("id").single()
      : await s.from("decisions").insert({ trip_id: ctx.trip.id, topic: d.topic, status: d.status, chosen: d.chosen, options }).select("id").single();
    if (error) console.error("[listener] could not save decision", d, error.message);
    if (row) written.push({ id: row.id, topic: d.topic, options: finalOptions });

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

  // A vote is a personal pick, distinct from the group-level "decided" status above — it shows
  // up on the dashboard's votes view even while the thread is still open.
  for (const v of normalizeVotes(out.votes)) {
    const decision =
      written.find((d) => sameTopic(d.topic, v.topic)) ??
      (() => {
        const d = findDecision(ctx.decisions, v.topic);
        return d ? { id: d.id, topic: d.topic, options: d.options } : undefined;
      })();
    if (!decision?.options?.length) continue;
    const match = findOption(decision.options, v.option);
    if (!match) continue;
    const { error } = await s
      .from("decision_votes")
      .upsert(
        { trip_id: ctx.trip.id, decision_id: decision.id, participant_id: participantId, option_label: match.label },
        { onConflict: "decision_id,participant_id" }
      );
    if (error) console.error("[listener] could not save vote", v, error.message);
  }

  return out;
}
