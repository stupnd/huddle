/**
 * Huddle domain model for the dashboard.
 *
 * Rules
 *  - Every total is derived (lib/domain/select.ts). Nothing here stores a sum.
 *  - Group size lives in one place: Trip.groupSize. Members are the people we know
 *    about; groupSize is the number every cost divides by.
 *  - Anything an agent produced carries provenance: who, when, and the message it came from.
 *  - Dates are ISO strings. Times of day are "HH:mm" in the trip's local time.
 */

import type { AvatarHue } from "@/lib/design/tokens";

export type ID = string;
export type ISODate = string;
export type ClockTime = `${number}${number}:${number}${number}`;

/* trip ------------------------------------------------------------------ */

export type Trip = {
  id: ID;
  name: string;
  destination: string;
  /** one line under the name, e.g. "most populous city in california" */
  region: string;
  /** null until the plan gives the trip real days */
  startDate: ISODate | null;
  endDate: ISODate | null;
  hero?: { photoUrl: string; caption: string | null; wikiUrl: string | null };
  currency: "USD" | "EUR" | "GBP" | "JPY";
  /** the single source of truth for per-person math. editable in one click on the money tab */
  groupSize: number;
  memberIds: ID[];
  /** when the plan was last derived from preferences and agent output */
  lastRecalculatedAt: ISODate | null;
  /** when anything upstream of the plan last changed. newer than lastRecalculatedAt means stale */
  lastChangedAt: ISODate | null;
  /** counter bumped on every replan, used to detect stale downstream views */
  planVersion: number;
};

/* people ---------------------------------------------------------------- */

export type WantCategory = "destination" | "dates" | "budget" | "stays" | "transport" | "food" | "activities" | "nightlife" | "avoid" | "other";

export type Want = {
  id: ID;
  memberId: ID;
  category: WantCategory;
  text: string;
  /** private wants render as a locked chip. the server blanks the text before it reaches the browser */
  private: boolean;
  /** huddle has checked this one back with the person */
  confirmed: boolean;
  updatedAt: ISODate;
  /** decision thread this want is in tension with, if any */
  conflictsWith?: ID;
};

export type Member = {
  id: ID;
  name: string;
  hue: AvatarHue;
  /** optional photo; absent members render a monogram */
  photoUrl?: string;
  wants: Want[];
};

/* agents ---------------------------------------------------------------- */

export type AgentSpecialty = "orchestrator" | "budget" | "local" | "activities" | "stays" | "food" | "transport" | "flights" | "nightlife";

export type AgentState = "idle" | "thinking" | "debating" | "waiting" | "error";

export type Agent = {
  id: ID;
  name: string;
  specialty: AgentSpecialty;
  /** one line of character so the roster does not read like a config file */
  tagline: string;
  state: AgentState;
  /** plain language current step, shown in the status strip and thinking state */
  currentStep?: string;
  /** set when state is "error": what it was doing and why it stopped */
  failure?: { doing: string; reason: string };
  /** false once dismissed from the trip. kept so provenance still resolves */
  active: boolean;
  joinedAt: ISODate;
  /** the thread this agent was brought in for */
  decisionId?: ID;
  /** true for huddle and the budget agent: they are not rows in the agents table */
  builtIn: boolean;
};

/* plan ------------------------------------------------------------------ */

export type StopCategory = "stays" | "food" | "activities" | "transport" | "nightlife" | "flights";

export type StopStatus = "locked" | "proposed" | "contested" | "dropped";

export type Provenance = {
  agentId: ID;
  at: ISODate;
  /** chat message this came from; the drawer scrolls to it on tap */
  messageId?: ID;
};

export type Place = {
  name: string;
  neighborhood: string;
  photoUrl?: string | null;
  lat?: number;
  lng?: number;
};

export type Stop = {
  id: ID;
  dayIndex: number;
  /** the label the planner wrote, e.g. "Saturday, Oct 24" */
  dayLabel: string;
  /** parsed clock time, null when the planner wrote "morning" */
  time: ClockTime | null;
  /** the planner's own words for the time, shown when time is null */
  timeLabel: string;
  durationMin?: number;
  title: string;
  place: Place;
  links?: { maps?: string; wiki?: string };
  category: StopCategory;
  /** one line: why this is here */
  reasoning: string;
  /** per person, in trip currency. group cost is derived from groupSize */
  costPerPerson: number;
  status: StopStatus;
  proposedBy: Provenance | null;
  /** set when status is "dropped" */
  dropped?: { reason: string; by: { kind: "agent"; id: ID } | { kind: "member"; id: ID }; at: ISODate };
  /** the decision thread this stop is the outcome of, if any */
  decisionId?: ID;
  /** minutes of travel from the previous stop that day, rendered in the connector */
  travelFromPrevMin?: number;
};

/** the timeline disagrees with something newer. shown as a banner on that day */
export type PlanConflict = {
  id: ID;
  dayIndex: number;
  /** one sentence stating the conflict */
  statement: string;
  /** what accepting would do */
  proposal: { stopId: ID; replacesStopId?: ID; by: Provenance };
  /** the thread to open if the humans want the argument */
  decisionId?: ID;
};

/* decisions ------------------------------------------------------------- */

export type DecisionStatus = "needs_you" | "options_ready" | "debating" | "resolved";

export type Raiser = { kind: "member"; id: ID } | { kind: "agent"; id: ID };

export type Option = {
  id: ID;
  decisionId: ID;
  title: string;
  /** per person, in trip currency. null when nobody has priced it */
  pricePerPerson: number | null;
  pro: string;
  /** null when no downside has been named */
  con: string | null;
  place?: Place;
  proposedBy: Provenance;
};

export type Vote = { memberId: ID; optionId: ID; at: ISODate };

export type Position = {
  agentId: ID;
  optionId?: ID;
  /** the claim in one line */
  claim: string;
  /** the single strongest reason */
  reason: string;
};

export type Decision = {
  id: ID;
  /** normalised topic key used for dedupe on ingest, e.g. "stay:night-1" */
  topicKey: string;
  question: string;
  raisedBy: Raiser;
  openedAt: ISODate;
  status: DecisionStatus;
  options: Option[];
  votes: Vote[];
  /** when two agents disagree, their positions side by side */
  debate?: Position[];
  /** set on resolve. the winning option animates into the plan */
  resolvedOptionId?: ID;
  /** the outcome in words when it was not one of the options, e.g. "skip parasailing" */
  resolution?: string;
  /** huddle's proposed pick while the thread is still open, waiting on a yes */
  suggestion?: string;
  resolvedAt?: ISODate;
  /** threads that were merged into this one on ingest */
  mergedFrom?: { id: ID; question: string }[];
  /** for zero-option threads: who to assign, inferred from the topic */
  suggestedSpecialty?: AgentSpecialty;
  /** stops in the plan that depend on this thread */
  stopIds: ID[];
};

/* money ----------------------------------------------------------------- */

export type CostCategory = StopCategory;

/**
 * A line of spend. amount is the group total for the line. split says who it divides
 * across; "all" means groupSize. paidBy is who fronted it, used for the settle-up view.
 */
export type CostLine = {
  id: ID;
  dayIndex: number;
  category: CostCategory;
  label: string;
  amount: number;
  split: "all" | ID[];
  paidBy?: ID;
  stopId?: ID;
  /** estimates carry the agent that produced them */
  source: Provenance | { agentId: null; at: ISODate };
};

/* activity -------------------------------------------------------------- */

export type ActivityType = "proposed" | "revised" | "removed" | "researched" | "debated" | "resolved";

export type ActivityTarget =
  | { kind: "stop"; id: ID }
  | { kind: "decision"; id: ID }
  | { kind: "option"; id: ID; decisionId: ID }
  | { kind: "day"; index: number };

export type ActivityEvent = {
  id: ID;
  at: ISODate;
  agentId: ID;
  type: ActivityType;
  summary: string;
  target: ActivityTarget;
  messageId?: ID;
};

/* agent chat feed ------------------------------------------------------- */

/** structured payloads. agents return JSON with a type field; raw text is the fallback */
export type AgentPayload =
  | { type: "text"; text: string }
  | { type: "itinerary"; days: { label: string; lines: { time: string | null; text: string }[] }[] }
  | { type: "options"; decisionId: ID; optionIds: ID[] }
  | { type: "debate"; decisionId: ID }
  | { type: "status"; step: string }
  | { type: "resolved"; decisionId: ID; optionId: ID };

export type AgentMessage = {
  id: ID;
  agentId: ID;
  at: ISODate;
  payload: AgentPayload;
  /** the human line this replied to, when it was a direct answer */
  replyTo?: { memberId: ID; text: string };
  /** true while the agent is still writing this message */
  streaming?: boolean;
};

/* snapshot -------------------------------------------------------------- */

/** everything the dashboard renders, in one object. the mock and the API adapter both produce this */
export type TripSnapshot = {
  trip: Trip;
  members: Member[];
  agents: Agent[];
  stops: Stop[];
  conflicts: PlanConflict[];
  decisions: Decision[];
  costLines: CostLine[];
  events: ActivityEvent[];
  messages: AgentMessage[];
  /** the viewer, for "needs you" and vote placement */
  viewerId: ID;
  /** when this snapshot was read */
  loadedAt: ISODate;
  /** true when the itinerary table exists and votes can be stored. false means run schema.sql */
  capabilities: { itinerary: boolean; votes: boolean; stopStatus: boolean };
};
