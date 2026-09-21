/**
 * Offline checks for the open-decisions digest: the list format, which messages count as an answer,
 * and the confirm / ask-again reply. No database or model calls.
 *
 *   npx tsx scripts/check-digest.ts
 */
import assert from "node:assert/strict";
import { formatParts, splitMessage } from "../lib/agents/spokesperson";
import {
  MAX_ITEMS, WHATS_LEFT, applyVerdicts, composeReply, isLive, mightAnswer, renderDigest, type DigestItem, type DigestState,
} from "../lib/agents/digest-state";

const now = Date.parse("2026-09-20T02:00:00Z");
const at = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();

const items: DigestItem[] = [
  { n: 1, topic: "Skiing", question: "Skiing - is it happening?", status: "open" },
  { n: 2, topic: "Johnston Canyon tour", question: "Johnston Canyon full day tour - which date?", status: "open" },
];
const state = (over: Partial<DigestState> = {}): DigestState => ({
  items, created_at: at(60), posted_at: at(60), message_id: "digest-msg", ...over,
});

// the list is short, numbered, most important first, and tells people how to answer
assert.equal(
  renderDigest(items),
  'Decisions Remaining:\n1. Skiing - is it happening?\n2. Johnston Canyon full day tour - which date?\nreply by number, like "1: yes, jan 4"'
);

// never more than four items, and a full list survives the chat's length cap untouched
const long = Array.from({ length: 9 }, (_, i) => ({ question: `${i + 1}. ${"a very long question about something ".repeat(6)}` }));
const full = renderDigest(long);
assert.equal(full.split("\n").filter((l) => /^\d\. /.test(l)).length, MAX_ITEMS);
assert.equal(formatParts("huddle", full, []).join("\n"), full, "the digest must not lose any text to the spokesperson's length cap");

// a message over the cap is split into bubbles, never cut: every word comes through, in order, each within the caps
const wall = Array.from({ length: 30 }, (_, i) => `line ${i + 1} has some words in it`).join("\n") + "\n" + "One long sentence. ".repeat(60);
const parts = splitMessage(wall);
assert.ok(parts.length > 1, "an over-long message becomes several bubbles");
assert.ok(parts.every((p) => p.length <= 420 && p.split("\n").length <= 6), "each bubble fits the caps");
assert.equal(parts.join(" ").replace(/\s+/g, " "), wall.replace(/\s+/g, " ").trim(), "nothing is dropped");
assert.deepEqual(splitMessage("short and sweet"), ["short and sweet"]);

// which messages are worth a model call
assert.equal(mightAnswer(state(), "yes let's ski jan 4", { now }), true, "shares a word with an item");
assert.equal(mightAnswer(state(), "2: friday", { now }), true, "number-led");
assert.equal(mightAnswer(state(), "sounds good", { now, replyToMessageId: "digest-msg" }), true, "threaded reply to the list");
assert.equal(mightAnswer(state(), "lol", { now, replyToMessageId: "someone-elses-msg" }), false);
assert.equal(mightAnswer(state(), "what's for dinner tonight, i'm starving and cannot decide anything", { now }), false, "unrelated");
assert.equal(mightAnswer(state({ posted_at: at(2) }), "yeah", { now }), true, "short reply right after the list");
assert.equal(mightAnswer(state({ posted_at: at(60 * 30) }), "yes skiing", { now }), false, "a list older than a day is no longer live");
assert.equal(mightAnswer({ items, created_at: at(1) }, "1: yes", { now }), false, "an unposted list cannot be answered");
assert.equal(isLive(state({ items: items.map((i) => ({ ...i, status: "answered" as const })) }), now), false);

// asking for the list on demand
for (const ask of ["@huddle what's left?", "huddle whats still open", "what do we still need to decide", "any open decisions?", "@huddle what is next"]) {
  assert.ok(WHATS_LEFT.test(ask), `should read as a request for the list: ${ask}`);
}
for (const other of ["@huddle plan saturday", "the door is open", "what's for dinner", "left at the airport"]) {
  assert.ok(!WHATS_LEFT.test(other), `should not read as a request for the list: ${other}`);
}
assert.ok(!WHATS_LEFT.source.includes("\b"), "regex must not contain literal backspace characters");

// one message answering item 1 clearly and item 2 vaguely: confirm one, ask again about the other
const one = applyVerdicts(state(), [
  { n: 1, status: "clear", answer: "yes, jan 4-5" },
  { n: 2, status: "unclear", follow_up: "which day works for the tour?" },
]);
assert.deepEqual(one.confirmed.map((i) => i.n), [1]);
assert.equal(one.state.items[0].status, "answered");
assert.equal(one.state.items[1].status, "open", "an unclear answer leaves the item open");
assert.equal(
  composeReply(one.confirmed, one.unclear, 1),
  "1. Skiing: yes, jan 4-5, locked in\n2. which day works for the tour?"
);

// an answered item cannot be answered twice, and finishing the list says so
const again = applyVerdicts(one.state, [{ n: 1, status: "clear", answer: "no" }, { n: 2, status: "clear", answer: "jan 3" }]);
assert.deepEqual(again.confirmed.map((i) => i.n), [2]);
assert.equal(again.state.items[0].answer, "yes, jan 4-5");
assert.match(composeReply(again.confirmed, [], 0), /that's everything that was open$/);

// a "clear" verdict with no answer text is not clear
assert.equal(applyVerdicts(state(), [{ n: 1, status: "clear", answer: "  " }]).confirmed.length, 0);

console.log("digest checks passed");
