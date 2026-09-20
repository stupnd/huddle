import { db, type Trip } from "../supabase";

/**
 * The open-decisions digest: one short numbered list of what the group still has to settle, most
 * important first, instead of a separate robotic nudge per decision. Everything here is pure
 * or plain state handling; the model calls live in digest.ts.
 *
 * The list is kept on trips.settings.digest so a later message can be matched back to an item
 * ("1: yes, jan 4") and answered in the same thread.
 */

export type DigestItem = {
  n: number;
  /** short label, "Skiing" or "Johnston Canyon tour date" */
  topic: string;
  /** what a friend would ask, in plain words */
  question: string;
  decision_id?: string;
  status: "open" | "answered";
  /** what the group said, once it is clear */
  answer?: string;
};

export type DigestState = {
  items: DigestItem[];
  created_at: string;
  /** set when the list actually reached the chat */
  posted_at?: string;
  /** the provider's id for that bubble, so a threaded reply to it is recognized */
  message_id?: string;
  /** last time we looked for something to raise, so we do not re-ask the model on every message */
  checked_at?: string;
};

export const MAX_ITEMS = 4;
/** After a list goes out, wait this long before putting another one in the chat. */
export const REPOST_AFTER_MS = 6 * 60 * 60 * 1000;
/** A list stays answerable for this long. */
export const ANSWERABLE_MS = 24 * 60 * 60 * 1000;
export const CHECK_EVERY_MS = 30 * 60 * 1000;

/** Trims a model-written line so the whole list stays well inside the chat's length cap. */
function tidy(text: string, max: number) {
  const one = text.replace(/\s+/g, " ").replace(/^\d{1,2}[.)]\s+/, "").trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}

export function renderDigest(items: Pick<DigestItem, "question">[]): string {
  const lines = items.slice(0, MAX_ITEMS).map((it, i) => `${i + 1}. ${tidy(it.question, 80)}`);
  return `still open, most important first:\n${lines.join("\n")}\nanswer any of them by number, like "1: yes, jan 4"`;
}

/** "@huddle what's left?" and its usual phrasings: someone asking for the list on demand. */
export const WHATS_LEFT = /\b(what'?s|whats|what is)\s+(left|still open|open|next)\b|\bstill\s+(open|need|to decide|to pick)\b|\b(remaining|open|pending)\s+decisions?\b|\bwhat\s+(do|should)\s+we\s+(still\s+)?(need|have)\s+to\s+(decide|pick|settle)\b/i;

export function openItems(state?: DigestState): DigestItem[] {
  return state?.items.filter((i) => i.status === "open") ?? [];
}

/** True while a posted list can still be answered. */
export function isLive(state: DigestState | undefined, now = Date.now()): state is DigestState {
  return Boolean(state?.posted_at && now - new Date(state.posted_at).getTime() < ANSWERABLE_MS && openItems(state).length);
}

const STOP = new Set(["the", "a", "an", "is", "it", "we", "to", "of", "and", "or", "for", "on", "in", "at", "do", "does", "are", "be", "which", "what"]);
// Light stemming so "ski" in a message still meets "skiing" in the list
const stem = (w: string) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w);
const contentWords = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map(stem);

/**
 * Cheap gate before spending a model call: could this message be answering the list?
 * True for a threaded reply to it, a number-led answer ("2: friday"), a message that shares a word
 * with an open item, or a short reply right after the list went out.
 */
export function mightAnswer(state: DigestState, text: string, opts: { replyToMessageId?: string; now?: number } = {}): boolean {
  const now = opts.now ?? Date.now();
  if (!isLive(state, now)) return false;
  if (opts.replyToMessageId && opts.replyToMessageId === state.message_id) return true;
  if (/^\s*\d\s*[.):\-]/.test(text)) return true;
  const said = new Set(contentWords(text));
  if (openItems(state).some((it) => contentWords(`${it.topic} ${it.question}`).some((w) => said.has(w)))) return true;
  const sincePost = now - new Date(state.posted_at!).getTime();
  return sincePost < 5 * 60 * 1000 && text.trim().split(/\s+/).length <= 8;
}

export type Verdict = { n: number; status: "clear" | "unclear"; answer?: string; follow_up?: string };

/** Applies the model's verdicts to the list. Only items still open can change. */
export function applyVerdicts(state: DigestState, verdicts: Verdict[]): { state: DigestState; confirmed: DigestItem[]; unclear: (DigestItem & { follow_up: string })[] } {
  const confirmed: DigestItem[] = [];
  const unclear: (DigestItem & { follow_up: string })[] = [];
  const items = state.items.map((it) => {
    const v = verdicts.find((x) => x.n === it.n);
    if (!v || it.status !== "open") return it;
    if (v.status === "clear" && v.answer?.trim()) {
      const done = { ...it, status: "answered" as const, answer: tidy(v.answer, 60) };
      confirmed.push(done);
      return done;
    }
    if (v.status === "unclear") unclear.push({ ...it, follow_up: tidy(v.follow_up || `${it.topic}: can you say a bit more?`, 90) });
    return it;
  });
  return { state: { ...state, items }, confirmed, unclear };
}

/** The reply that goes back under the person's answer: confirm what was clear, ask again about what was not. */
export function composeReply(confirmed: DigestItem[], unclear: { n: number; follow_up: string }[], stillOpen: number): string {
  const lines = [
    ...confirmed.map((it) => `${it.n}. ${tidy(it.topic, 40)}: ${it.answer}, locked in`),
    ...unclear.map((it) => `${it.n}. ${it.follow_up}`),
  ];
  if (confirmed.length && !stillOpen) lines.push("that's everything that was open");
  return lines.join("\n");
}

export async function readDigest(tripId: string): Promise<DigestState | undefined> {
  const { data } = await db().from("trips").select("settings").eq("id", tripId).single();
  return (data?.settings as Trip["settings"])?.digest;
}

/** Re-reads settings first: other writers (monitor, mention mode) keep their own keys in the same object. */
export async function writeDigest(tripId: string, digest: DigestState | undefined) {
  const s = db();
  const { data } = await s.from("trips").select("settings").eq("id", tripId).single();
  const settings = { ...((data?.settings as Trip["settings"]) ?? {}) };
  if (digest) settings.digest = digest;
  else delete settings.digest;
  await s.from("trips").update({ settings }).eq("id", tripId);
}

/** Called once the list has really been sent, with the provider's id for the bubble when there is one. */
export async function markDigestPosted(tripId: string, messageId?: string) {
  const digest = await readDigest(tripId);
  if (!digest || digest.posted_at) return;
  await writeDigest(tripId, { ...digest, posted_at: new Date().toISOString(), message_id: messageId });
}
