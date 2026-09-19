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
