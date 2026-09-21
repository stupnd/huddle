/**
 * Offline checks for who a message calls in: explicit "@name" beats a bare word, a passing mention
 * never wakes an agent, and a name nobody on the trip owns is recognised. No database or model calls.
 *
 *   npx tsx scripts/check-handoff.ts
 */
import assert from "node:assert/strict";
import type { Agent } from "../lib/supabase";
import { isMentioned, unknownAgentMention, whoIsMentioned, whoIsTagged } from "../lib/agents/personas";

const nova = { id: "nova-id", persona_name: "Nova", role: "activities" } as Agent;
const agents = [nova];

// Huddle asking a specialist a question reaches that specialist
assert.equal(whoIsMentioned("jan 6-7 cultural activities in calgary. @nova can you find options", agents, "huddle")?.key, "nova-id");

// a passing mention is not a call: "the option nova found" must not wake Nova
assert.equal(whoIsMentioned("you both want the combo option nova found", agents, "huddle"), null);
assert.equal(isMentioned("email@nova.com", ["Nova"]), false, "an address is not a mention");

// an agent never calls itself
assert.equal(whoIsMentioned("@nova thoughts?", agents, "nova-id"), null);

// "@nova" is Nova even when the same message says "budget" (Penny's other name)
assert.equal(whoIsTagged("@nova what fits our budget?", agents)?.key, "nova-id");
assert.equal(whoIsTagged("what's our budget looking like", agents)?.key, "budget", "a bare word still reaches Penny");
assert.equal(whoIsTagged("what's our budget looking like", agents, undefined, false), null, "Penny switched off");

// an "@" name nobody owns, but that Huddle hands out to specialists
assert.equal(unknownAgentMention("@juno?", agents, ["Sam"]), "Juno");
assert.equal(unknownAgentMention("@nova?", agents, ["Sam"]), null, "Nova is here");
assert.equal(unknownAgentMention("@juno hey", agents, ["Juno"]), null, "a person in the chat is not an agent");
assert.equal(unknownAgentMention("@dave hey", agents, ["Sam"]), null, "not a name Huddle hands out");

console.log("handoff checks passed");
