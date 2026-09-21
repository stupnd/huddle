import type { Agent } from "../supabase";
/**
 * MVP: every agent speaks through the single Huddle line with a name prefix.
 * When dedicated lines per agent are available, the prefix goes away and each persona gets its own number.
 */
export const HUDDLE = { key: "huddle", name: "Huddle", emoji: "🧭" };
export const BUDGET = { key: "budget", name: "Penny", emoji: "💸" };

const CHILD_NAMES = ["Nova", "Rio", "Juno", "Kai", "Sol", "Wren", "Zara", "Milo"];
const ROLE_EMOJI: Record<string, string> = {
  stays: "🏨", flights: "✈️", transport: "🚆", food: "🍜", activities: "🎟️", nightlife: "🪩", weather: "🌦️",
};

/**
 * Picks a name not in `taken`. `taken` should list active agents first, then the most recently
 * departed, so that when the pool is exhausted the recycled name is the one gone longest.
 * Never invents "Agent12": that reads as a bug to the group.
 */
export function pickChildPersona(taken: string[], role: string) {
  const fresh = CHILD_NAMES.find((n) => !taken.includes(n));
  const recycled = [...CHILD_NAMES].sort((a, b) => taken.lastIndexOf(b) - taken.lastIndexOf(a)).pop();
  const name = fresh ?? recycled ?? CHILD_NAMES[0];
  return { name, emoji: ROLE_EMOJI[role] ?? "🤖" };
}

export function prefix(emoji: string, name: string, role?: string) {
  return role ? `${emoji} ${name} (${role})` : `${emoji} ${name}`;
}

export function isAddressedTo(text: string, names: string[]) {
  const t = text.toLowerCase();
  return names.some((n) => new RegExp(`(^|[^a-z])@?${n.toLowerCase()}([^a-z]|$)`).test(t));
}

/** Someone the chat can address: Huddle, Penny, or an active specialist. */
export type Speaker = { key: string; name: string; role: string };

/** Only an explicit "@name" counts, so a passing mention ("the option nova found") never wakes an agent. */
export function isMentioned(text: string, names: string[]) {
  const t = text.toLowerCase();
  return names.some((n) => new RegExp(`(^|[^a-z])@${n.toLowerCase()}([^a-z]|$)`).test(t));
}

function callable(agents: Agent[], pennyOn: boolean): Speaker[] {
  return [
    { key: HUDDLE.key, name: HUDDLE.name, role: "host" },
    ...agents.map((a) => ({ key: a.id, name: a.persona_name, role: `${a.role} agent` })),
    ...(pennyOn ? [{ key: BUDGET.key, name: BUDGET.name, role: "budget agent" }] : []),
  ];
}

const namesOf = (c: Speaker) => (c.key === BUDGET.key ? [c.name, "budget"] : [c.name]);

/** Who a message explicitly "@"-tags. `except` stops an agent from calling itself. */
export function whoIsMentioned(text: string, agents: Agent[], except?: string, pennyOn = true): Speaker | null {
  return callable(agents, pennyOn).find((c) => c.key !== except && isMentioned(text, namesOf(c))) ?? null;
}

/**
 * Which agent a message addresses, if any. An explicit "@name" beats a bare word, so "@nova" is
 * never taken for Penny just because the same message also says "budget".
 */
export function whoIsTagged(text: string, agents: Agent[], except?: string, pennyOn = true): Speaker | null {
  return whoIsMentioned(text, agents, except, pennyOn)
    ?? callable(agents, pennyOn).find((c) => c.key !== except && isAddressedTo(text, namesOf(c)))
    ?? null;
}

/**
 * An "@name" that belongs to no one on this trip but is a name Huddle hands out to specialists
 * ("@juno" when only Nova is here). Real people in the chat are never mistaken for one.
 */
export function unknownAgentMention(text: string, agents: Agent[], memberNames: string[]): string | null {
  const active = new Set(agents.map((a) => a.persona_name.toLowerCase()));
  const people = new Set(memberNames.map((n) => n.toLowerCase()));
  return CHILD_NAMES.find((n) => isMentioned(text, [n]) && !active.has(n.toLowerCase()) && !people.has(n.toLowerCase())) ?? null;
}
