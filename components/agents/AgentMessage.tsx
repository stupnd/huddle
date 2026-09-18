"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import type { Agent, AgentMessage as AgentMessageT } from "@/lib/domain/types";
import { decisionById, memberById } from "@/lib/domain/select";
import { agentEnter } from "@/lib/design/tokens";
import { money, timeAgo } from "@/lib/format";
import { useShell } from "@/components/shell/ShellProvider";
import { cn } from "@/lib/utils";
import { AgentIdentity } from "./AgentIdentity";
import { ThinkingDots } from "@/components/shell/StatusStrip";

/**
 * AgentMessage: structured rendering of one agent turn in the drawer.
 * The payload's type decides the body. Raw text is the fallback, never the default.
 *
 *  - text        the fallback, a paragraph
 *  - status      the streaming state, dots plus the current step
 *  - itinerary   a compact timeline preview
 *  - options     the option cards the agent brought back, linked to the thread
 *  - debate      the agent's position with a link to the argument
 *  - resolved    the outcome
 */

type Props = {
  message: AgentMessageT;
  agent: Agent;
  now: number;
  highlighted?: boolean;
};

export function AgentMessage({ message, agent, now, highlighted }: Props) {
  return (
    <motion.article
      id={`msg-${message.id}`}
      variants={agentEnter}
      initial="initial"
      animate="animate"
      aria-label={`${agent.name}, ${timeAgo(message.at, now)}`}
      className={cn(
        "rounded-lg border border-transparent px-1.5 py-1.5 transition-colors duration-(--duration-slow)",
        highlighted && "border-accent/40 bg-accent-soft",
      )}
    >
      {message.replyTo && <ReplyTo memberId={message.replyTo.memberId} text={message.replyTo.text} />}
      <header className="mb-0.5 flex items-center justify-between gap-1">
        <AgentIdentity agent={agent} size="sm" showState={false} showSpecialty className="text-body-sm" />
        <time dateTime={message.at} className="shrink-0 text-micro text-ink-3 figures">
          {timeAgo(message.at, now)}
        </time>
      </header>
      <Body message={message} />
    </motion.article>
  );
}

function Body({ message }: { message: AgentMessageT }) {
  const p = message.payload;
  switch (p.type) {
    case "text":
      return <p className="text-body text-ink whitespace-pre-line">{p.text}</p>;
    case "status":
      return (
        <p className="flex items-center text-body-sm text-ink-2" aria-live="polite">
          <ThinkingDots />
          {p.step}
        </p>
      );
    case "itinerary":
      return <ItineraryPreview days={p.days} />;
    case "options":
      return <OptionsPreview decisionId={p.decisionId} optionIds={p.optionIds} />;
    case "debate":
      return <DebatePreview decisionId={p.decisionId} agentId={message.agentId} />;
    case "resolved":
      return <ResolvedPreview decisionId={p.decisionId} optionId={p.optionId} />;
  }
}

function ReplyTo({ memberId, text }: { memberId: string; text: string }) {
  const { snapshot } = useShell();
  const member = memberById(snapshot, memberId);
  return (
    <p className="mb-0.5 truncate border-l-2 border-line pl-1 text-micro text-ink-3">
      {member ? member.name.toLowerCase() : "someone"}: {text.replace(/@huddle/gi, "").trim()}
    </p>
  );
}

function ThreadLink({ decisionId, children }: { decisionId: string; children: React.ReactNode }) {
  const { tripId } = useShell();
  return (
    <Link href={`/trip/${tripId}/decisions?thread=${decisionId}`} className="inline-flex items-center gap-0.5 text-micro text-ink-2 hover:text-ink">
      {children}
      <ArrowRight className="size-1.5" aria-hidden />
    </Link>
  );
}

/** the options an agent brought back, as compact cards under the thread's question */
function OptionsPreview({ decisionId, optionIds }: { decisionId: string; optionIds: string[] }) {
  const { snapshot } = useShell();
  const decision = decisionById(snapshot, decisionId);
  if (!decision) return <p className="text-body-sm text-ink-2">brought back options.</p>;
  const options = decision.options.filter((o) => optionIds.includes(o.id));
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-line bg-surface-2 p-1.5">
      <p className="text-micro text-ink-3">{options.length === 1 ? "an option" : `${options.length} options`} for {decision.question}</p>
      <ul className="flex flex-col gap-0.5">
        {options.map((o) => (
          <li key={o.id} className="flex items-start justify-between gap-1 rounded-sm bg-surface-1 px-1 py-0.5">
            <span className="min-w-0">
              <span className="block text-body-sm font-medium text-ink">{o.title}</span>
              {o.pro && <span className="line-clamp-2 block text-micro text-ink-2">{o.pro}</span>}
            </span>
            <span className="shrink-0 text-body-sm text-ink figures">{o.pricePerPerson === null ? "" : money(o.pricePerPerson, snapshot.trip.currency)}</span>
          </li>
        ))}
      </ul>
      <ThreadLink decisionId={decision.id}>vote on the decisions tab</ThreadLink>
    </div>
  );
}

function DebatePreview({ decisionId, agentId }: { decisionId: string; agentId: string }) {
  const { snapshot } = useShell();
  const decision = decisionById(snapshot, decisionId);
  const position = decision?.debate?.find((p) => p.agentId === agentId);
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-contested/30 bg-surface-2 p-1.5">
      <p className="text-micro text-contested">debating{decision ? `: ${decision.question}` : ""}</p>
      {position ? (
        <>
          <p className="font-display text-display-sm text-ink">{position.claim.toLowerCase()}</p>
          <p className="text-body-sm text-ink-2">{position.reason}</p>
        </>
      ) : (
        <p className="text-body-sm text-ink-2">took a position.</p>
      )}
      {decision && <ThreadLink decisionId={decision.id}>settle it</ThreadLink>}
    </div>
  );
}

function ResolvedPreview({ decisionId, optionId }: { decisionId: string; optionId: string }) {
  const { snapshot } = useShell();
  const decision = decisionById(snapshot, decisionId);
  const option = decision?.options.find((o) => o.id === optionId);
  return (
    <p className="inline-flex items-center gap-0.5 rounded-md bg-locked-soft px-1.5 py-1 text-body-sm text-locked">
      <Check className="size-1.5" aria-hidden />
      settled{decision ? ` ${decision.question}` : ""}{option ? `: ${option.title}` : ""}
    </p>
  );
}

/** a day-by-day plan the agent wrote, as a compact timeline instead of a text block */
function ItineraryPreview({ days }: { days: { label: string; lines: { time: string | null; text: string }[] }[] }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-line bg-surface-2 p-1.5">
      {days.map((day, i) => (
        <div key={i}>
          {day.label && <p className="mb-0.5 text-micro text-ink-3">{day.label}</p>}
          <ol className="flex flex-col gap-0.5">
            {day.lines.map((l, j) => (
              <li key={j} className="grid grid-cols-[3.5rem_1fr] gap-1 text-body-sm">
                <span className="text-ink-3 figures">{l.time ?? ""}</span>
                <span className="text-ink">{l.text}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
