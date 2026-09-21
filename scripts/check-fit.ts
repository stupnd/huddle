/**
 * Offline checks for the plan-fit check: which needs reach the checker, that the same problem is only
 * raised once, who is asked to fix it, and how the listener matches a name to a person. No database or
 * model calls.
 *
 *   npx tsx scripts/check-fit.ts
 */
import assert from "node:assert/strict";
import type { Agent } from "../lib/supabase";
import type { TripContext } from "../lib/agents/context";
import { composeFitMessage, conflictKey, constraintLines, firstNew, pickFixer, type Conflict } from "../lib/agents/fit";
import { findPerson } from "../lib/agents/listener";

const pref = (participant_id: string, category: string, value: string, visibility = "group") => ({ participant_id, category, value, visibility });
const ctx = {
  participants: [{ id: "p1", display_name: "Priya", address: "+1" }, { id: "p2", display_name: null, address: "+2" }],
  preferences: [
    pref("p1", "food", "vegetarian"),
    pref("p1", "budget", "$500 total", "private"),
    pref("p1", "dates", "dec 26 - jan 5"),
    pref("p2", "dislikes", "no stairs"),
    pref("p2", "food", "secretly on a diet", "private"),
  ],
} as unknown as TripContext;

// the checker sees needs, never budgets, dates or anything private
const lines = constraintLines(ctx);
assert.match(lines, /Priya:\n- food: vegetarian/);
assert.match(lines, /\+2:\n- dislikes: no stairs/, "a person with no name yet is still listed");
assert.ok(!/budget|dates|diet/.test(lines), "budgets, dates and private notes stay out");

// a problem is raised once: the same stop against the same need has the same key however it is worded
const steak: Conflict = { stop: "Steakhouse dinner", constraint: "one of you is vegetarian", message: "the steakhouse dinner is rough for a vegetarian" };
assert.equal(conflictKey(steak), conflictKey({ ...steak, stop: "steakhouse  dinner!", constraint: "One of you is vegetarian." }));
assert.notEqual(conflictKey(steak), conflictKey({ ...steak, stop: "Lakeside picnic" }));
assert.equal(firstNew([steak], [conflictKey(steak)]), undefined, "already raised");
assert.equal(firstNew([steak, { ...steak, stop: "BBQ lunch" }], [conflictKey(steak)])?.stop, "BBQ lunch", "moves on to the next one");
assert.equal(firstNew([{ ...steak, message: "  " }], []), undefined, "a conflict with no message is unusable");

// who is asked to fix it
const agent = (persona_name: string, role: string) => ({ persona_name, role }) as Agent;
const nova = agent("Nova", "activities"), rio = agent("Rio", "food");
assert.equal(pickFixer([nova, rio], "food"), rio, "the specialist whose role matches");
assert.equal(pickFixer([nova], "food"), nova, "else the activities agent that laid the plan out");
assert.equal(pickFixer([agent("Kai", "stays")], "food")?.persona_name, "Kai", "else any specialist");
assert.equal(pickFixer([], "food"), undefined);

// the message tags the fixer, or asks the group when there is no one to tag
assert.equal(
  composeFitMessage(steak, nova),
  "the steakhouse dinner is rough for a vegetarian. @Nova can you swap it for something that works for everyone?"
);
assert.equal(composeFitMessage(steak), "the steakhouse dinner is rough for a vegetarian. want me to swap it?");

// the listener matches "Priya's vegetarian" to the person, by first name or full name, ignoring case
const people = [{ display_name: "Priya Shah" }, { display_name: "Sam" }, { display_name: null }];
assert.equal(findPerson(people, "priya")?.display_name, "Priya Shah");
assert.equal(findPerson(people, "Priya Shah")?.display_name, "Priya Shah");
assert.equal(findPerson(people, "SAM")?.display_name, "Sam");
assert.equal(findPerson(people, "Dave"), undefined);

console.log("fit checks passed");
