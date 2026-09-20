import type {
  ActivityEvent,
  Agent,
  AgentMessage,
  AgentPayload,
  AgentSpecialty,
  ClockTime,
  CostLine,
  Decision,
  DecisionStatus,
  Member,
  Option,
  PlanConflict,
  Position,
  Raiser,
  Stop,
  StopCategory,
  StopStatus,
  Trip,
  TripSnapshot,
  Vote,
  Want,
  WantCategory,
} from "./types";
import type { TripApi } from "@/lib/trip/api";
import { hueFor } from "@/lib/design/tokens";

/**
 * Adapter: GET /api/trip/[id] rows to a TripSnapshot.
 *
 * Pure and isomorphic. The server layout and the client poller both run it, so
 * it must never import from lib/supabase.
 *
 * The MVP tables store less than the dashboard shows. Everything the schema does
 * not hold is derived here from what it does hold, and every derivation is a
 * named function below so the heuristics are inspectable:
 *   - stop status (locked / proposed / contested) from decisions and preferences
 *   - plan conflicts from "skip X" decisions and "not doing X" wants
 *   - thread status and dedupe from topic keys
 *   - agent state from candidates, debates and open work
 *   - structured chat payloads from message text
 * When the dashboard migration in schema.sql has been run, votes are real and a stop
 * status set from the dashboard (locked, contested, dropped) beats the heuristics.
 */

export const HUDDLE_ID = "huddle";
export const BUDGET_ID = "budget";

export function adaptTrip(api: TripApi): TripSnapshot {
  const members = adaptMembers(api);
  const agents = adaptAgents(api);
  const messages = adaptMessages(api, agents);
  const decisions = adaptDecisions(api, members, agents, messages);
  const { stops, conflicts } = adaptStops(api, decisions, members, messages);
  for (const d of decisions) d.stopIds = stops.filter((s) => s.decisionId === d.id).map((s) => s.id);
  const trip = adaptTrip_(api, decisions, stops, members);
  const costLines = deriveCostLines(stops, trip);
  const events = deriveEvents(api, agents, decisions, stops);

  return {
    trip,
    members,
    agents,
    stops,
    conflicts,
    decisions,
    costLines,
    events,
    messages,
    // No identity until the sign-in cookie says otherwise (set in the trip layout).
    // Defaulting to the first member made every guest act as that person.
    viewerId: "",
    loadedAt: api.loadedAt,
    capabilities: { itinerary: api.itineraryReady, votes: api.votesReady, stopStatus: api.stopStatusReady },
    planJob: api.planJob ? { status: api.planJob.status, error: api.planJob.error, startedAt: api.planJob.started_at } : null,
  };
}

/* text helpers ---------------------------------------------------------- */

const EMOJI = /[\p{Extended_Pictographic}\uFE0F\u200D]/gu;
export function stripEmoji(s: string) {
  return s.replace(EMOJI, "").replace(/\s{2,}/g, " ").trim();
}

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s$]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "near", "from", "into", "over", "walk", "lunch", "dinner", "hotel", "beach", "los", "angeles",
  "santa", "monica", "saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "night", "day", "trip",
  "options", "option", "plan", "itinerary", "time", "timing", "cheap", "eats", "things", "some", "that", "this", "your", "our",
  "west", "east", "north", "south", "downtown", "area", "around", "near", "before", "after", "skip", "not", "doing", "want",
  "wants", "check", "into", "arrive", "land", "people", "person", "group", "afternoon", "morning", "evening",
]);

function tokens(s: string): Set<string> {
  return new Set(
    norm(s)
      .split(" ")
      .filter((w) => w.length >= 4 && !STOP_WORDS.has(w)),
  );
}

/** loose: a and b share a distinctive word or two ordinary ones. used for chat text, where phrasing drifts */
function refersTo(a: string, b: string) {
  const ta = tokens(a);
  const tb = tokens(b);
  let shared = 0;
  let rare = false;
  for (const w of ta) {
    if (tb.has(w)) {
      shared++;
      if (w.length >= 6) rare = true;
    }
  }
  return rare || shared >= 2;
}

/** strict: one phrase contains the other, or they share two words with one distinctive. used to tie stops to threads */
function namesSameThing(a: string, b: string) {
  const na = norm(a);
  const nb = norm(b);
  if (Math.min(na.length, nb.length) >= 8 && (na.includes(nb) || nb.includes(na))) return true;
  const ta = tokens(a);
  const tb = tokens(b);
  let shared = 0;
  let rare = false;
  for (const w of ta) {
    if (tb.has(w)) {
      shared++;
      if (w.length >= 6) rare = true;
    }
  }
  return shared >= 2 && rare;
}

const NEGATION = /^(skip|no|not doing|not|avoid|drop|without)\b/i;

/** "skip parasailing" against "Parasailing near Marina del Rey": the thing being refused is named in the subject */
function refuses(negated: string, subject: string) {
  const object = norm(negated.replace(NEGATION, "").trim());
  if (object.length < 4) return false;
  if (norm(subject).includes(object)) return true;
  const ts = tokens(subject);
  return [...tokens(object)].some((w) => w.length >= 6 && ts.has(w));
}

function firstLine(s: string) {
  return stripEmoji(s.split("\n").find((l) => l.trim()) ?? "");
}

function slug(s: string) {
  return norm(s).replace(/\s/g, "-").slice(0, 48);
}

const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

/* time and date parsing ------------------------------------------------- */

const VAGUE: Record<string, ClockTime> = { morning: "09:00", "late morning": "11:00", noon: "12:00", afternoon: "14:00", evening: "18:00", night: "21:00", "late night": "23:00" };

export function parseClock(label: string | null): ClockTime | null {
  if (!label) return null;
  const s = label.trim().toLowerCase();
  const m = s.match(/^~?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (m) {
    let h = Number(m[1]);
    const min = Number(m[2] ?? 0);
    if (m[3] === "pm" && h < 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` as ClockTime;
  }
  for (const [k, v] of Object.entries(VAGUE)) if (s.includes(k)) return v;
  return null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** "Saturday, Oct 24" to an ISO date. the year is the first one on or after `anchor` where the weekday fits */
export function parseDayLabel(label: string, anchor: string): string | null {
  const s = label.toLowerCase();
  const month = MONTHS.findIndex((m) => new RegExp(`\\b${m}`).test(s));
  const day = s.match(/\b(\d{1,2})\b/);
  if (month === -1 || !day) return null;
  const weekday = WEEKDAYS.findIndex((w) => s.startsWith(w) || s.includes(`${w}`));
  const anchorDate = new Date(anchor);
  let year = anchorDate.getUTCFullYear();
  for (let i = 0; i < 3; i++) {
    const d = new Date(Date.UTC(year + i, month, Number(day[1])));
    const notTooEarly = d.getTime() > anchorDate.getTime() - 45 * 86_400_000;
    const weekdayFits = weekday === -1 || d.getUTCDay() === weekday;
    if (notTooEarly && weekdayFits) return d.toISOString().slice(0, 10);
  }
  return new Date(Date.UTC(year, month, Number(day[1]))).toISOString().slice(0, 10);
}

/* members --------------------------------------------------------------- */

const WANT_CATEGORY: Record<string, WantCategory> = {
  destination: "destination", dates: "dates", budget: "budget", lodging: "stays", stays: "stays", transport: "transport",
  food: "food", activities: "activities", nightlife: "nightlife", dislikes: "avoid", avoid: "avoid",
};

function memberName(p: TripApi["participants"][number]) {
  if (p.display_name) return p.display_name;
  const digits = p.address.replace(/\D/g, "");
  return digits.length >= 4 ? `friend ${digits.slice(-4)}` : p.address;
}

function adaptMembers(api: TripApi): Member[] {
  return api.participants.map((p) => {
    const wants: Want[] = api.preferences
      .filter((x) => x.participant_id === p.id)
      .map((x) => ({
        id: x.id,
        memberId: p.id,
        category: WANT_CATEGORY[x.category] ?? "other",
        text: stripEmoji(x.value),
        private: x.visibility === "private",
        confirmed: x.confirmed,
        updatedAt: x.updated_at,
      }));
    return { id: p.id, name: memberName(p), hue: hueFor(p.address), wants };
  });
}

/* agents ---------------------------------------------------------------- */

const ROLE_SPECIALTY: Record<string, AgentSpecialty> = {
  stays: "stays", flights: "flights", transport: "transport", food: "food", activities: "activities", nightlife: "nightlife",
};

const TAGLINE: Record<AgentSpecialty, string> = {
  orchestrator: "keeps the plan honest",
  budget: "counts every dollar out loud",
  local: "knows the city better than the guidebook",
  activities: "has never said no to a plan",
  stays: "will find the room with the view",
  food: "knows a guy at every counter",
  transport: "has strong feelings about transit",
  flights: "refreshes fares for sport",
  nightlife: "will not let you sleep before 2",
};

function specialtyFor(role: string): AgentSpecialty {
  return ROLE_SPECIALTY[role] ?? "local";
}

function stepFromTask(task: string) {
  const t = stripEmoji(task);
  const find = t.match(/^find options for:\s*(.+)$/i);
  if (find) return `looking into ${find[1].trim()}`;
  const argue = t.match(/^argue for\s+"?([^"]+?)"?\s+in the debate about:\s*(.+)$/i);
  if (argue) return `arguing for ${argue[1].trim()} on ${argue[2].trim()}`;
  return t.toLowerCase();
}

function adaptAgents(api: TripApi): Agent[] {
  const pending = new Set(api.candidates.filter((c) => c.status === "pending").map((c) => c.speaker));
  const decisionsById = new Map(api.decisions.map((d) => [d.id, d]));
  const postedBy = new Set(api.messages.filter((m) => m.sender_type === "agent").map((m) => m.persona));
  const pennyOn = api.trip.settings?.penny !== false;

  const huddle: Agent = {
    id: HUDDLE_ID,
    name: "Huddle",
    specialty: "orchestrator",
    tagline: TAGLINE.orchestrator,
    state: pending.has(HUDDLE_ID) ? "thinking" : "idle",
    currentStep: pending.has(HUDDLE_ID) ? "drafting a reply for the group chat" : undefined,
    active: api.trip.activity_level !== "paused",
    joinedAt: api.trip.created_at,
    builtIn: true,
  };
  const penny: Agent = {
    id: BUDGET_ID,
    name: "Penny",
    specialty: "budget",
    tagline: TAGLINE.budget,
    state: pending.has(BUDGET_ID) ? "thinking" : "idle",
    currentStep: pending.has(BUDGET_ID) ? "checking the numbers before posting" : undefined,
    active: pennyOn,
    joinedAt: api.trip.created_at,
    builtIn: true,
  };

  const rest = api.agents.map<Agent>((a) => {
    const specialty = specialtyFor(a.role);
    const decision = a.decision_id ? decisionsById.get(a.decision_id) : undefined;
    const active = a.status === "active";
    let state: Agent["state"] = "idle";
    let currentStep: string | undefined;
    if (active) {
      if (decision?.status === "debating" && a.champions) {
        state = "debating";
        currentStep = `arguing for ${a.champions} on ${stripEmoji(decision.topic)}`;
      } else if (pending.has(a.id)) {
        state = "thinking";
        currentStep = "writing up what it found";
      } else if (decision && (decision.options?.length ?? 0) > 0 && decision.status !== "decided") {
        state = "waiting";
        currentStep = `waiting on you: ${stripEmoji(decision.topic)}`;
      } else if (!postedBy.has(a.id)) {
        state = "thinking";
        currentStep = stepFromTask(a.task);
      }
    }
    return {
      id: a.id,
      name: a.persona_name,
      specialty,
      tagline: TAGLINE[specialty],
      state,
      currentStep,
      active,
      joinedAt: a.created_at,
      decisionId: a.decision_id ?? undefined,
      builtIn: false,
    };
  });

  return [huddle, penny, ...rest];
}

/* messages -------------------------------------------------------------- */

const TIME_LINE = /^\s*~?\d{1,2}(:\d{2})?\s*(am|pm)\b/i;
const DAY_LINE = /^\s*(mon|tues|wednes|thurs|fri|satur|sun)day\b[^a-z]*$/i;

function parsePayload(content: string, agent: Agent, api: TripApi): AgentPayload {
  const text = stripEmoji(content);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // an itinerary: several lines that start with a clock time, optionally under day headers
  const timed = lines.filter((l) => TIME_LINE.test(l)).length;
  if (timed >= 3) {
    const days: { label: string; lines: { time: string | null; text: string }[] }[] = [];
    let current = { label: "", lines: [] as { time: string | null; text: string }[] };
    for (const l of lines) {
      if (DAY_LINE.test(l)) {
        if (current.lines.length) days.push(current);
        current = { label: l.toLowerCase(), lines: [] };
        continue;
      }
      const m = l.match(TIME_LINE);
      if (m) current.lines.push({ time: m[0].trim(), text: l.slice(m[0].length).replace(/^[\s,:.-]+/, "") });
      else if (current.lines.length) current.lines[current.lines.length - 1].text += ` ${l}`;
    }
    if (current.lines.length) days.push(current);
    if (days.length) return { type: "itinerary", days };
  }

  // a specialist reporting back on its thread: match lines to the thread's options
  const decision = agent.decisionId ? api.decisions.find((d) => d.id === agent.decisionId) : undefined;
  if (decision && decision.options?.length) {
    const matched = decision.options.filter((o) => refersTo(o.label, text)).map((o) => optionId(decision.id, o.label));
    if (matched.length >= 1 && (text.includes("$") || matched.length >= 2)) return { type: "options", decisionId: decision.id, optionIds: matched };
    if (decision.status === "debating") return { type: "debate", decisionId: decision.id };
  }

  return { type: "text", text };
}

function adaptMessages(api: TripApi, agents: Agent[]): AgentMessage[] {
  const known = new Set(agents.map((a) => a.id));
  const out: AgentMessage[] = [];
  const rows = api.messages;
  rows.forEach((m, i) => {
    if (m.sender_type !== "agent") return;
    const agentId = m.persona && known.has(m.persona) ? m.persona : HUDDLE_ID;
    const agent = agents.find((a) => a.id === agentId)!;
    const prev = rows[i - 1];
    const replyTo = prev && prev.sender_type === "human" && prev.participant_id && /@huddle/i.test(prev.content) ? { memberId: prev.participant_id, text: stripEmoji(prev.content) } : undefined;
    out.push({ id: m.id, agentId, at: m.created_at, payload: parsePayload(m.content, agent, api), replyTo });
  });

  // queued replies: something written, waiting for a lull in the chat
  const seen = new Set<string>();
  for (const c of api.candidates) {
    if (c.status !== "pending" || seen.has(c.speaker)) continue;
    seen.add(c.speaker);
    const agentId = known.has(c.speaker) ? c.speaker : HUDDLE_ID;
    out.push({ id: `queued-${c.id}`, agentId, at: c.created_at, payload: { type: "status", step: "has something to say, waiting for a lull in the chat" }, streaming: true });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/* decisions ------------------------------------------------------------- */

const STATUS_RANK: Record<string, number> = { open: 0, debating: 1, proposed: 2, decided: 3 };

function topicKey(topic: string) {
  return norm(topic).replace(/\$/g, "");
}
function topicBase(topic: string) {
  return topicKey(topic.split(":")[0]);
}

export function optionId(decisionId: string, label: string) {
  return `${decisionId}:${slug(label)}`;
}

function suggestSpecialty(topic: string): AgentSpecialty {
  const t = topic.toLowerCase();
  if (/hotel|stay|hostel|airbnb|lodging|room/.test(t)) return "stays";
  if (/eat|food|meal|restaurant|lunch|dinner|breakfast/.test(t)) return "food";
  if (/flight|fly|airline/.test(t)) return "flights";
  if (/transport|direction|uber|train|bus|metro|drive|airport|get to|getting/.test(t)) return "transport";
  if (/club|bar|night|party|drinks/.test(t)) return "nightlife";
  if (/budget|cost|price|split/.test(t)) return "budget";
  return "activities";
}

function priceIn(text: string | undefined): number | null {
  if (!text) return null;
  const m = text.match(/\$\s*(\d{1,5})/);
  return m ? Number(m[1]) : null;
}

type Row = TripApi["decisions"][number];

/** identical or near-identical topics merge into one thread. earliest row is the primary */
function mergeRows(rows: Row[]): { primary: Row; merged: Row[] }[] {
  const groups: { primary: Row; merged: Row[] }[] = [];
  for (const r of rows) {
    const key = topicKey(r.topic);
    const base = topicBase(r.topic);
    const hit = groups.find((g) => {
      const gk = topicKey(g.primary.topic);
      const gb = topicBase(g.primary.topic);
      return gk === key || gb === key || base === gk || (base === gb && base.length > 6);
    });
    if (hit) hit.merged.push(r);
    else groups.push({ primary: r, merged: [] });
  }
  return groups;
}

function adaptDecisions(api: TripApi, members: Member[], agents: Agent[], messages: AgentMessage[]): Decision[] {
  const humans = api.messages.filter((m) => m.sender_type === "human" && m.participant_id);
  const memberIds = new Set(members.map((m) => m.id));

  return mergeRows(api.decisions).map(({ primary, merged }) => {
    const all = [primary, ...merged];
    const top = all.reduce((a, b) => (STATUS_RANK[b.status] > STATUS_RANK[a.status] ? b : a));
    const chosen = all.map((r) => r.chosen).find(Boolean) ?? null;
    const updatedAt = all.map((r) => r.updated_at).reduce((a, b) => (a > b ? a : b));

    // options: union across merged rows, deduped by label
    const seen = new Map<string, Option>();
    for (const r of all) {
      const owner = agents.filter((a) => a.decisionId === r.id).at(-1);
      for (const o of r.options ?? []) {
        const id = optionId(primary.id, o.label);
        if (seen.has(id)) continue;
        const provenanceMsg = owner ? messages.filter((m) => m.agentId === owner.id).at(-1) : undefined;
        seen.set(id, {
          id,
          decisionId: primary.id,
          title: stripEmoji(o.label),
          pricePerPerson: typeof o.est_cost_per_person === "number" ? o.est_cost_per_person : priceIn(o.label) ?? priceIn(o.details),
          pro: stripEmoji(o.details ?? ""),
          con: null,
          proposedBy: { agentId: owner?.id ?? HUDDLE_ID, at: r.updated_at, messageId: provenanceMsg?.id },
        });
      }
    }
    const options = [...seen.values()];

    // who raised it: the last human line before the thread opened, else huddle
    const before = humans.filter((m) => m.created_at <= primary.created_at).at(-1);
    const raisedBy: Raiser =
      before && memberIds.has(before.participant_id!) && new Date(primary.created_at).getTime() - new Date(before.created_at).getTime() < 15 * 60_000
        ? { kind: "member", id: before.participant_id! }
        : { kind: "agent", id: HUDDLE_ID };

    const votes: Vote[] = api.votes
      .filter((v) => all.some((r) => r.id === v.decision_id))
      .map((v) => ({ memberId: v.participant_id, optionId: optionId(primary.id, v.option_label), at: v.created_at }))
      .filter((v) => seen.has(v.optionId));

    const debaters = agents.filter((a) => all.some((r) => r.id === a.decisionId) && a.name && api.agents.find((x) => x.id === a.id)?.champions);
    const debate: Position[] | undefined =
      top.status === "debating" && debaters.length
        ? debaters.map((a) => {
            const champions = api.agents.find((x) => x.id === a.id)!.champions!;
            const last = messages.filter((m) => m.agentId === a.id && m.payload.type === "text").at(-1);
            return {
              agentId: a.id,
              optionId: options.find((o) => norm(o.title) === norm(champions))?.id,
              claim: stripEmoji(champions),
              reason: last && last.payload.type === "text" ? firstLine(last.payload.text) : `is making the case for ${champions}`,
            };
          })
        : undefined;

    const status: DecisionStatus =
      top.status === "decided" ? "resolved" : top.status === "debating" ? "debating" : options.length > 0 ? "options_ready" : "needs_you";

    const resolvedOption = chosen ? options.find((o) => norm(o.title) === norm(chosen)) : undefined;

    return {
      id: primary.id,
      topicKey: topicKey(primary.topic),
      question: stripEmoji(primary.topic),
      raisedBy,
      openedAt: primary.created_at,
      status,
      options,
      votes,
      debate,
      resolvedOptionId: status === "resolved" ? resolvedOption?.id : undefined,
      resolution: status === "resolved" && chosen && !resolvedOption ? stripEmoji(chosen) : undefined,
      suggestion: status !== "resolved" && chosen ? stripEmoji(chosen) : undefined,
      resolvedAt: status === "resolved" ? updatedAt : undefined,
      mergedFrom: merged.length ? merged.map((r) => ({ id: r.id, question: stripEmoji(r.topic) })) : undefined,
      suggestedSpecialty: status === "needs_you" ? suggestSpecialty(primary.topic) : undefined,
      stopIds: [],
    };
  });
}

/* stops ----------------------------------------------------------------- */

const STOP_CATEGORY: Record<string, StopCategory> = { stays: "stays", food: "food", activities: "activities", transport: "transport", nightlife: "nightlife", flights: "flights" };

function neighborhoodOf(place: string | null, title: string) {
  const src = place ?? title;
  const first = src.split(",")[0].trim();
  return first.replace(/^(lunch|dinner|breakfast|brunch) at /i, "");
}

function adaptStops(api: TripApi, decisions: Decision[], members: Member[], messages: AgentMessage[]): { stops: Stop[]; conflicts: PlanConflict[] } {
  const conflicts: PlanConflict[] = [];
  const decided = api.decisions.filter((d) => d.status === "decided" && d.chosen);
  const openWithOptions = decisions.filter((d) => d.status !== "resolved" && d.options.length > 1);
  const refusals = members.flatMap((m) => m.wants.filter((w) => !w.private && (w.category === "avoid" || NEGATION.test(w.text))).map((w) => ({ member: m, want: w })));
  const primaryFor = (rowId: string) => decisions.find((d) => d.id === rowId || d.mergedFrom?.some((m) => m.id === rowId));

  const stops = api.itinerary.map<Stop>((row) => {
    const subject = `${row.title} ${row.place ?? ""}`;
    const builtAt = row.created_at;
    const announce = messages.find((m) => m.agentId === HUDDLE_ID && m.at >= builtAt && new Date(m.at).getTime() - new Date(builtAt).getTime() < 10 * 60_000);
    const proposedBy = { agentId: HUDDLE_ID, at: builtAt, messageId: announce?.id };

    let status: StopStatus = "proposed";
    let decisionId: string | undefined;
    let dropped: Stop["dropped"];

    // a stored status set from the dashboard wins. the column default "proposed" means nobody has touched it, so derive
    if (api.stopStatusReady && row.status && row.status !== "proposed") {
      status = row.status;
      if (row.status === "dropped" && row.dropped_at) {
        dropped = { reason: row.dropped_reason ?? "removed", by: { kind: "agent", id: row.dropped_by ?? HUDDLE_ID }, at: row.dropped_at };
      }
    } else {
      // a decided thread whose outcome names this stop locks it; a "skip X" outcome contests it
      for (const d of decided) {
        const negated = NEGATION.test(d.chosen!);
        if (negated ? !refuses(d.chosen!, subject) : !namesSameThing(d.chosen!, subject)) continue;
        const primary = primaryFor(d.id);
        if (negated) {
          status = "contested";
          decisionId = primary?.id ?? d.id;
          conflicts.push({
            id: `conflict-${row.id}`,
            dayIndex: row.day_index,
            statement: `"${row.title}" is still on the plan, but the group settled on "${stripEmoji(d.chosen!)}".`,
            proposal: { stopId: row.id, by: { agentId: HUDDLE_ID, at: d.updated_at } },
            decisionId: primary?.id ?? d.id,
          });
        } else {
          status = "locked";
          decisionId = primary?.id ?? d.id;
        }
        break;
      }
      // a thread still open with this stop as one of its options means the plan picked early
      if (status === "proposed") {
        const open = openWithOptions.find((d) => d.options.some((o) => namesSameThing(o.title, subject)));
        if (open) {
          status = "contested";
          decisionId = open.id;
        }
      }
      // someone said they are not doing this
      if (status !== "locked") {
        const refusal = refusals.find(({ want }) => refuses(want.text, subject));
        if (refusal) {
          status = "contested";
          conflicts.push({
            id: `conflict-${row.id}-${refusal.want.id}`,
            dayIndex: row.day_index,
            statement: `"${row.title}" is on the plan, but ${refusal.member.name} said "${refusal.want.text}".`,
            proposal: { stopId: row.id, by: { agentId: HUDDLE_ID, at: refusal.want.updatedAt } },
            decisionId,
          });
        }
      }
      if (status === "proposed" && /locked in/i.test(row.notes ?? "")) status = "locked";
    }

    return {
      id: row.id,
      dayIndex: row.day_index,
      dayLabel: row.day_label,
      time: parseClock(row.start_time),
      timeLabel: (row.start_time ?? "").toLowerCase(),
      durationMin: row.duration_min ?? undefined,
      travelFromPrevMin: row.travel_from_prev_min ?? undefined,
      title: stripEmoji(row.title),
      place: { name: row.place ?? row.title, neighborhood: neighborhoodOf(row.place, row.title), photoUrl: row.image_url, lat: row.lat ?? undefined, lng: row.lng ?? undefined },
      links: { maps: row.maps_url ?? undefined, wiki: row.wiki_url ?? undefined },
      category: STOP_CATEGORY[row.category ?? ""] ?? "activities",
      reasoning: stripEmoji(row.notes ?? ""),
      costPerPerson: typeof row.est_cost_per_person === "number" ? row.est_cost_per_person : Number(row.est_cost_per_person ?? 0) || 0,
      status,
      proposedBy,
      dropped,
      decisionId,
    };
  });

  // one banner per stop: prefer the decision-driven conflict over the preference one
  const byStop = new Map<string, PlanConflict>();
  for (const c of conflicts) if (!byStop.has(c.proposal.stopId)) byStop.set(c.proposal.stopId, c);

  return { stops, conflicts: [...byStop.values()] };
}

/* money ----------------------------------------------------------------- */

function deriveCostLines(stops: Stop[], trip: Trip): CostLine[] {
  return stops
    .filter((s) => s.status !== "dropped" && s.costPerPerson > 0)
    .map((s) => ({
      id: `cost-${s.id}`,
      dayIndex: s.dayIndex,
      category: s.category,
      label: s.title,
      amount: s.costPerPerson * trip.groupSize,
      split: "all" as const,
      stopId: s.id,
      source: s.proposedBy ?? { agentId: null, at: trip.lastRecalculatedAt ?? trip.lastChangedAt ?? new Date(0).toISOString() },
    }));
}

/* activity -------------------------------------------------------------- */

function deriveEvents(api: TripApi, agents: Agent[], decisions: Decision[], stops: Stop[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  // the plan itself: one event per build, per day
  const days = new Map<number, Stop[]>();
  for (const s of stops) days.set(s.dayIndex, [...(days.get(s.dayIndex) ?? []), s]);
  for (const [dayIndex, list] of days) {
    events.push({
      id: `ev-plan-${dayIndex}`,
      at: api.itinerary.find((r) => r.day_index === dayIndex)?.created_at ?? api.loadedAt,
      agentId: HUDDLE_ID,
      type: "proposed",
      summary: `built ${list[0].dayLabel.toLowerCase()} with ${list.length} stops`,
      target: { kind: "day", index: dayIndex },
      messageId: list[0].proposedBy?.messageId,
    });
  }

  for (const d of decisions) {
    const raisedByAgent = d.raisedBy.kind === "agent" ? d.raisedBy.id : HUDDLE_ID;
    events.push({ id: `ev-open-${d.id}`, at: d.openedAt, agentId: raisedByAgent, type: "proposed", summary: `opened a thread: ${d.question}`, target: { kind: "decision", id: d.id } });
    if (d.options.length) {
      const by = d.options[0].proposedBy;
      events.push({ id: `ev-opt-${d.id}`, at: by.at, agentId: by.agentId, type: "researched", summary: `brought back ${d.options.length} options for ${d.question}`, target: { kind: "decision", id: d.id }, messageId: by.messageId });
    }
    if (d.debate?.length) {
      events.push({ id: `ev-debate-${d.id}`, at: d.openedAt, agentId: d.debate[0].agentId, type: "debated", summary: `${d.debate.map((p) => p.claim).join(" vs ")} on ${d.question}`, target: { kind: "decision", id: d.id } });
    }
    if (d.status === "resolved" && d.resolvedAt) {
      const outcome = d.resolvedOptionId ? d.options.find((o) => o.id === d.resolvedOptionId)?.title : d.resolution;
      events.push({ id: `ev-res-${d.id}`, at: d.resolvedAt, agentId: HUDDLE_ID, type: "resolved", summary: `settled ${d.question}: ${outcome ?? "done"}`, target: { kind: "decision", id: d.id } });
    }
    if (d.mergedFrom?.length) {
      events.push({ id: `ev-merge-${d.id}`, at: d.openedAt, agentId: HUDDLE_ID, type: "revised", summary: `merged ${d.mergedFrom.length + 1} threads about ${d.question}`, target: { kind: "decision", id: d.id } });
    }
  }

  for (const a of agents) {
    if (a.builtIn) continue;
    const d = a.decisionId ? decisions.find((x) => x.id === a.decisionId || x.mergedFrom?.some((m) => m.id === a.decisionId)) : undefined;
    events.push({
      id: `ev-join-${a.id}`,
      at: a.joinedAt,
      agentId: a.id,
      type: "researched",
      summary: d ? `joined to look into ${d.question}` : "joined the trip",
      target: d ? { kind: "decision", id: d.id } : { kind: "day", index: 0 },
    });
  }

  for (const s of stops) {
    if (s.status === "contested" && s.decisionId) {
      events.push({ id: `ev-contest-${s.id}`, at: s.proposedBy?.at ?? api.loadedAt, agentId: HUDDLE_ID, type: "debated", summary: `${s.title} is contested`, target: { kind: "stop", id: s.id } });
    }
    if (s.dropped) {
      events.push({ id: `ev-drop-${s.id}`, at: s.dropped.at, agentId: s.dropped.by.kind === "agent" ? s.dropped.by.id : HUDDLE_ID, type: "removed", summary: `removed ${s.title}: ${s.dropped.reason}`, target: { kind: "stop", id: s.id } });
    }
  }

  return events.sort((a, b) => a.at.localeCompare(b.at));
}

/* trip ------------------------------------------------------------------ */

function adaptTrip_(api: TripApi, decisions: Decision[], stops: Stop[], members: Member[]): Trip {
  const t = api.trip;
  const destinationThread = decisions.find((d) => d.status === "resolved" && /destination|where/.test(d.topicKey));
  const destination = destinationThread
    ? (destinationThread.resolvedOptionId ? destinationThread.options.find((o) => o.id === destinationThread.resolvedOptionId)?.title : destinationThread.resolution) ?? t.title ?? ""
    : t.title ?? "";

  const dates = api.itinerary
    .map((r) => parseDayLabel(r.day_label, t.created_at))
    .filter((d): d is string => !!d)
    .sort();

  const lastRecalculatedAt = api.itinerary.map((r) => r.created_at).reduce<string | null>(later, null);
  const lastChangedAt = [...api.preferences.map((p) => p.updated_at), ...api.decisions.map((d) => d.updated_at)].reduce<string | null>(later, null);

  const settings = t.settings ?? {};
  const hero = settings.hero_image ? { photoUrl: settings.hero_image, caption: settings.hero_caption ?? null, wikiUrl: settings.hero_wiki ?? null } : undefined;

  return {
    id: t.id,
    name: t.title ?? destination ?? "untitled trip",
    destination,
    region: (settings.hero_caption ?? "").toLowerCase(),
    startDate: dates[0] ?? null,
    endDate: dates[dates.length - 1] ?? null,
    hero,
    currency: "USD",
    groupSize: Math.max(1, settings.group_size ?? members.length),
    memberIds: members.map((m) => m.id),
    lastRecalculatedAt,
    lastChangedAt,
    planVersion: stops.length ? 1 : 0,
  };
}
