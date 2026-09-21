import type { Agent, AgentState, CostCategory, Decision, Member, PlanConflict, Stop, TripSnapshot } from "./types";
import { dayLabel as fmtDay } from "@/lib/format";

/**
 * Selectors. Every derived value the UI needs comes from here so no component
 * stores a total, and so the mock and the live adapter behave identically.
 * All money is per person unless the name says group.
 */

/* agents ---------------------------------------------------------------- */

export function activeAgents(s: TripSnapshot): Agent[] {
  return s.agents.filter((a) => a.active);
}

/** specialists Huddle brought in. Huddle and Penny are always there, so they are never part of a headcount. */
export function activeSpecialists(s: TripSnapshot): Agent[] {
  return activeAgents(s).filter((a) => !a.builtIn);
}

/** agents that are doing something right now, for the status strip */
export function workingAgents(s: TripSnapshot): Agent[] {
  const busy: AgentState[] = ["thinking", "debating", "waiting", "error"];
  return activeAgents(s).filter((a) => busy.includes(a.state) && a.currentStep);
}

export function agentById(s: TripSnapshot, id: string): Agent | undefined {
  return s.agents.find((a) => a.id === id);
}

export function memberById(s: TripSnapshot, id: string): Member | undefined {
  return s.members.find((m) => m.id === id);
}

/* days ------------------------------------------------------------------ */

export type Day = {
  index: number;
  /** "sat" */
  weekday: string;
  /** "oct 24" */
  date: string;
  label: string;
  stopCount: number;
  /** per person, live stops only */
  total: number;
};

/** the day switcher: one entry per day the plan covers, in order */
export function days(s: TripSnapshot): Day[] {
  const byIndex = new Map<number, Stop[]>();
  for (const st of s.stops) byIndex.set(st.dayIndex, [...(byIndex.get(st.dayIndex) ?? []), st]);
  return [...byIndex.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, stops]) => {
      const live = stops.filter((st) => st.status !== "dropped");
      const iso = s.trip.startDate ? addDays(s.trip.startDate, index) : null;
      const parts = iso ? fmtDay(iso) : { weekday: stops[0].dayLabel.slice(0, 3).toLowerCase(), date: stops[0].dayLabel.split(",")[1]?.trim().toLowerCase() ?? "" };
      return { index, weekday: parts.weekday, date: parts.date, label: stops[0].dayLabel, stopCount: live.length, total: sum(live.map((st) => st.costPerPerson)) };
    });
}

export function dayCount(s: TripSnapshot) {
  return days(s).length;
}

export function stopsForDay(s: TripSnapshot, dayIndex: number): Stop[] {
  return s.stops.filter((st) => st.dayIndex === dayIndex).sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));
}

export function liveStopsForDay(s: TripSnapshot, dayIndex: number): Stop[] {
  return stopsForDay(s, dayIndex).filter((st) => st.status !== "dropped");
}

export function droppedStopsForDay(s: TripSnapshot, dayIndex: number): Stop[] {
  return stopsForDay(s, dayIndex).filter((st) => st.status === "dropped");
}

export function conflictsForDay(s: TripSnapshot, dayIndex: number): PlanConflict[] {
  return s.conflicts.filter((c) => c.dayIndex === dayIndex);
}

/** minutes between two stops' clock times, null when either is vague */
export function gapMinutes(a: Stop, b: Stop): number | null {
  if (!a.time || !b.time) return null;
  const [ah, am] = a.time.split(":").map(Number);
  const [bh, bm] = b.time.split(":").map(Number);
  const diff = bh * 60 + bm - (ah * 60 + am);
  return diff >= 0 ? diff : null;
}

/* plan state ------------------------------------------------------------ */

export function hasPlan(s: TripSnapshot) {
  return s.stops.some((st) => st.status !== "dropped");
}

/** true when something changed after the last recalculation */
export function planIsStale(s: TripSnapshot) {
  const { lastChangedAt, lastRecalculatedAt } = s.trip;
  if (!lastChangedAt) return false;
  if (!lastRecalculatedAt) return hasPlan(s);
  return new Date(lastChangedAt).getTime() > new Date(lastRecalculatedAt).getTime();
}

export type PrimaryAction = "build" | "replan" | "share";

/** the one action in the top bar */
export function primaryAction(s: TripSnapshot): PrimaryAction {
  if (!hasPlan(s)) return "build";
  if (planIsStale(s) || s.conflicts.length > 0) return "replan";
  return "share";
}

/* decisions ------------------------------------------------------------- */

export function decisionsByStatus(s: TripSnapshot) {
  const groups: Record<Decision["status"], Decision[]> = { needs_you: [], options_ready: [], debating: [], resolved: [] };
  for (const d of s.decisions) groups[d.status].push(d);
  // newest open first, oldest resolved last
  for (const k of ["needs_you", "options_ready", "debating"] as const) groups[k].sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  groups.resolved.sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""));
  return groups;
}

/** threads that want a human: no options yet, or options waiting on a vote */
export function needsYouCount(s: TripSnapshot) {
  return s.decisions.filter((d) => d.status === "needs_you" || (d.status === "options_ready" && !d.votes.some((v) => v.memberId === s.viewerId))).length;
}

export function tally(d: Decision): Map<string, string[]> {
  const t = new Map<string, string[]>();
  for (const o of d.options) t.set(o.id, []);
  for (const v of d.votes) t.set(v.optionId, [...(t.get(v.optionId) ?? []), v.memberId]);
  return t;
}

export function decisionById(s: TripSnapshot, id: string) {
  return s.decisions.find((d) => d.id === id);
}

/* money ----------------------------------------------------------------- */

export const COST_CATEGORIES: CostCategory[] = ["stays", "food", "activities", "transport", "nightlife", "flights"];

export const categoryLabel: Record<CostCategory, string> = {
  stays: "stays",
  food: "food",
  activities: "things to do",
  transport: "getting around",
  nightlife: "going out",
  flights: "flights",
};

/** group total across every cost line */
export function groupTotal(s: TripSnapshot) {
  return sum(s.costLines.map((c) => c.amount));
}

/** per person: what each of groupSize people pays if everything splits evenly */
export function perPersonTotal(s: TripSnapshot) {
  return groupTotal(s) / s.trip.groupSize;
}

export function categoryTotals(s: TripSnapshot): { category: CostCategory; group: number; perPerson: number; share: number }[] {
  const total = groupTotal(s);
  return COST_CATEGORIES.map((category) => {
    const group = sum(s.costLines.filter((c) => c.category === category).map((c) => c.amount));
    return { category, group, perPerson: group / s.trip.groupSize, share: total ? group / total : 0 };
  }).filter((c) => c.group > 0);
}

export function dayTotals(s: TripSnapshot): { day: Day; group: number; perPerson: number; lines: TripSnapshot["costLines"] }[] {
  return days(s).map((day) => {
    const lines = s.costLines.filter((c) => c.dayIndex === day.index);
    const group = sum(lines.map((c) => c.amount));
    return { day, group, perPerson: group / s.trip.groupSize, lines };
  });
}

/**
 * What each known member owes. Lines split "all" divide by groupSize (which may be larger
 * than the member list). Lines split across named members divide among them. paidBy
 * credits the payer.
 */
export function owedByMember(s: TripSnapshot): { member: Member; owes: number; paid: number; net: number }[] {
  return s.members.map((member) => {
    let owes = 0;
    let paid = 0;
    for (const c of s.costLines) {
      const among = c.split === "all" ? s.trip.groupSize : c.split.length;
      const included = c.split === "all" || c.split.includes(member.id);
      if (included) owes += c.amount / among;
      if (c.paidBy === member.id) paid += c.amount;
    }
    return { member, owes, paid, net: owes - paid };
  });
}

export function splitIsUneven(s: TripSnapshot) {
  return s.costLines.some((c) => c.split !== "all" || c.paidBy);
}

/** when the numbers were last derived: the newest cost line's provenance */
export function costsRecalculatedAt(s: TripSnapshot): string | null {
  return s.costLines.map((c) => c.source.at).reduce<string | null>((a, b) => (!a || b > a ? b : a), null);
}

/* chat ------------------------------------------------------------------ */

/** messages newer than the given time, for the drawer badge */
export function unseenMessageCount(s: TripSnapshot, seenAt: string | null) {
  if (!seenAt) return s.messages.length;
  const t = new Date(seenAt).getTime();
  return s.messages.filter((m) => new Date(m.at).getTime() > t).length;
}

/* crew ------------------------------------------------------------------ */

/** two members with different stated numbers in the same category */
export function wantConflicts(s: TripSnapshot): { category: string; wants: { member: Member; text: string }[] }[] {
  const out: { category: string; wants: { member: Member; text: string }[] }[] = [];
  const cats = new Set(s.members.flatMap((m) => m.wants.map((w) => w.category)));
  for (const category of cats) {
    const numeric = s.members.flatMap((member) =>
      member.wants.filter((w) => w.category === category && !w.private && /\$\s*\d/.test(w.text)).map((w) => ({ member, text: w.text })),
    );
    if (numeric.length >= 2 && new Set(numeric.map((n) => n.member.id)).size >= 2) out.push({ category, wants: numeric });
  }
  return out;
}

/* helpers --------------------------------------------------------------- */

function sum(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0);
}

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
