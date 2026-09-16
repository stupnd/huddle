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

export function pickChildPersona(taken: string[], role: string) {
  const name = CHILD_NAMES.find((n) => !taken.includes(n)) ?? `Agent${taken.length + 1}`;
  return { name, emoji: ROLE_EMOJI[role] ?? "🤖" };
}

export function prefix(emoji: string, name: string, role?: string) {
  return role ? `${emoji} ${name} (${role})` : `${emoji} ${name}`;
}

export function isAddressedTo(text: string, names: string[]) {
  const t = text.toLowerCase();
  return names.some((n) => new RegExp(`(^|[^a-z])@?${n.toLowerCase()}([^a-z]|$)`).test(t));
}
