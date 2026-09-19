import { db, type Trip } from "../supabase";
import { askJSON, MODELS } from "./claude";
import { describe, type TripContext } from "./context";
import { VOICE } from "./voice";

/**
 * Silent monitoring agent. Catches hallucinations that grow as the chat gets long:
 * agents inventing decisions, prices, or preferences that aren't in structured state,
 * or treating open options as locked in.
 *
 * Two modes:
 *   verifyDraft  — gate a reply before it posts; rewrite if needed
 *   runMonitor   — scan recent agent posts on long chats; soft-correct via Huddle when severe
 */

export type MonitorIssue = {
  claim: string;
  contradicts: string;
  severity: 1 | 2 | 3;
};

export type MonitorFinding = MonitorIssue & { at: string; speaker?: string };

const THRESHOLD = Number(process.env.MONITOR_MESSAGE_THRESHOLD ?? 25);
const COOLDOWN_MS = Number(process.env.MONITOR_COOLDOWN_SECONDS ?? 300) * 1000;

type DraftCheck = {
  ok: boolean;
  issues: MonitorIssue[];
  revision: string;
};

type ScanOut = {
  issues: MonitorIssue[];
  speak: boolean;
  urgency: number;
  message: string;
};

const DRAFT_SYSTEM = `You are the Monitor agent inside Huddle, a group trip planner. You NEVER speak in the chat.
Your job is to fact-check one agent draft against the GROUND TRUTH below (preferences, decisions, trip title).

Flag a claim when it:
- says something is decided / locked / picked when decision status is not "decided"
- invents a price, time, place, or option that is not in decisions.options and not in the recent chat
- contradicts a recorded preference (public ones only — ignore private budgets)
- invents content "in the app" that is not reflected in decisions or preferences

Do NOT flag:
- casual tone, shortening, or rephrasing of real facts
- web-research details that are plausible for a specialist (street names, venue hours) unless they contradict ground truth
- silence or hedging ("not sure", "don't know")

If issues are severity 2+, rewrite the draft so every claim is grounded. Keep the same voice and length rules.
If ok, return the draft unchanged as revision.

Reply with JSON only:
{"ok": true, "issues": [], "revision": ""}
issues items: {"claim": "", "contradicts": "", "severity": 1}`;

const SCAN_SYSTEM = `You are the Monitor agent inside Huddle. You NEVER speak unless a severe already-posted hallucination needs a short correction.

Ground truth = preferences + decisions + trip title. Recent agent messages can drift after a long chat.

Speak only when severity 3 issues exist that people might act on (wrong "we decided X", invented locked prices, contradicting a hard preference). One short correction as Huddle, no lecture.
Otherwise speak=false.

${VOICE}
Reply with JSON only:
{"issues": [{"claim": "", "contradicts": "", "severity": 1}], "speak": false, "urgency": 1, "message": ""}`;

function recentAgentLines(ctx: TripContext, limit = 8) {
  return ctx.messages
    .filter((m) => m.sender_type === "agent")
    .slice(-limit)
    .map((m) => {
      const who =
        m.persona === "huddle" ? "Huddle" :
        m.persona === "budget" ? "Penny" :
        ctx.agents.find((a) => a.id === m.persona)?.persona_name ?? "agent";
      return `${who}: ${m.content}`;
    })
    .join("\n");
}

async function touchMonitor(trip: Trip, issues: MonitorIssue[] = [], speaker?: string) {
  const at = new Date().toISOString();
  const prev = (trip.settings?.monitor?.issues ?? []) as MonitorFinding[];
  const next: MonitorFinding[] = issues.length
    ? [...issues.map((i) => ({ ...i, at, speaker })), ...prev].slice(0, 8)
    : prev;

  await db()
    .from("trips")
    .update({
      settings: {
        ...trip.settings,
        monitor: { last_checked_at: at, issues: next },
      },
    })
    .eq("id", trip.id);
}

/** Fact-check a draft before it reaches the chat. Returns a grounded revision when needed. */
export async function verifyDraft(
  ctx: TripContext,
  speaker: { name: string; role: string },
  draft: string
): Promise<string> {
  if (!draft?.trim()) return draft;

  const out = await askJSON<DraftCheck>(
    {
      model: MODELS.listener,
      maxTokens: 800,
      system: DRAFT_SYSTEM,
      prompt: `${describe(ctx)}\n\nDRAFT from ${speaker.name} (${speaker.role}):\n${draft}`,
    },
    { ok: true, issues: [], revision: draft }
  );

  const issues = (out.issues ?? []).filter((i) => i?.claim && i?.contradicts);
  if (issues.length) {
    console.warn(
      `[monitor] ${speaker.name} draft issues:`,
      issues.map((i) => `${i.severity}:${i.claim}`).join(" | ")
    );
    await touchMonitor(ctx.trip, issues, speaker.name);
  }

  const revision = (out.revision || "").trim();
  // Prefer the rewrite when the monitor found real problems; otherwise keep the original.
  if (!out.ok && revision && issues.some((i) => i.severity >= 2)) return revision;
  return draft;
}

/**
 * Long-chat scan. Runs when the transcript is long enough that older claims have fallen
 * out of the 40-message window and agents start inventing continuity.
 */
export async function runMonitor(ctx: TripContext) {
  // loadContext only keeps the last 40 messages; once that window is full (or past the
  // configured threshold), older claims have fallen out and hallucination risk spikes.
  if (ctx.messages.length < Math.min(THRESHOLD, 40)) return { scanned: false };

  const lastCheck = ctx.trip.settings?.monitor?.last_checked_at;
  if (lastCheck && Date.now() - new Date(lastCheck).getTime() < COOLDOWN_MS) {
    return { scanned: false, reason: "cooldown" };
  }

  const agentLines = recentAgentLines(ctx);
  if (!agentLines) {
    await touchMonitor(ctx.trip);
    return { scanned: true, issues: 0 };
  }

  const out = await askJSON<ScanOut>(
    {
      model: MODELS.listener,
      maxTokens: 700,
      system: SCAN_SYSTEM,
      prompt: `${describe(ctx)}\n\nRECENT AGENT MESSAGES TO CHECK:\n${agentLines}`,
    },
    { issues: [], speak: false, urgency: 1, message: "" }
  );

  const issues = (out.issues ?? []).filter((i) => i?.claim && i?.contradicts);
  await touchMonitor(ctx.trip, issues);

  if (out.speak && out.message && issues.some((i) => i.severity >= 3)) {
    const { data: pending } = await db()
      .from("speak_candidates")
      .select("id")
      .eq("trip_id", ctx.trip.id)
      .eq("speaker", "huddle")
      .eq("trigger", "conflict")
      .eq("status", "pending");
    if (!pending?.length) {
      await db().from("speak_candidates").insert({
        trip_id: ctx.trip.id,
        speaker: "huddle",
        trigger: "conflict",
        urgency: Math.min(3, Math.max(1, out.urgency || 3)),
        content: out.message,
      });
    }
  }

  if (issues.length) {
    console.warn(`[monitor] trip ${ctx.trip.id}: ${issues.length} issue(s)`, issues.map((i) => i.claim).join("; "));
  }
  return { scanned: true, issues: issues.length, speak: Boolean(out.speak && out.message) };
}
