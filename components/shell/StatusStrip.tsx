"use client";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import type { Agent } from "@/lib/domain/types";
import { workingAgents } from "@/lib/domain/select";
import { duration } from "@/lib/design/tokens";
import { useBreakpoint } from "@/lib/hooks/useBreakpoint";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useShell } from "./ShellProvider";

/**
 * Live status strip — only when agents are actually working. Quiet trips stay
 * quiet; the "all quiet" chrome was noise for an iMessage companion.
 *
 * Several agents: equal columns on md+, one-at-a-time cycle below. Dismiss hides
 * until the activity set changes.
 */
export function StatusStrip() {
  const { snapshot, openDrawerAt, openDrawer } = useShell();
  const working = useMemo(() => workingAgents(snapshot), [snapshot]);
  const signature = working.map((a) => `${a.id}:${a.currentStep}`).join("|");
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const dismissed = dismissedFor === signature;

  if (working.length === 0 || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto w-full max-w-(--container-shell) px-2 md:px-4"
    >
      <div className="flex h-(--height-strip) items-center gap-1 rounded-full border border-line bg-surface-1 pr-0.5 pl-1.5">
        <Activities agents={working} onTap={(a) => openDrawerAt(latestMessageFor(snapshot.messages, a.id))} onMore={openDrawer} />
        <Button variant="quiet" size="icon-sm" aria-label="dismiss status" onClick={() => setDismissedFor(signature)}>
          <X />
        </Button>
      </div>
    </div>
  );
}

function latestMessageFor(messages: { id: string; agentId: string }[], agentId: string) {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].agentId === agentId) return messages[i].id;
  return messages[messages.length - 1]?.id ?? "";
}

const MAX_COLUMNS = 3;

function Activities({ agents, onTap, onMore }: { agents: Agent[]; onTap: (a: Agent) => void; onMore: () => void }) {
  const wide = useBreakpoint("md");
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);

  // narrow screens: rotate through the working agents
  useEffect(() => {
    if (wide || agents.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % agents.length), 3600);
    return () => clearInterval(t);
  }, [wide, agents.length]);

  const safeIndex = index % Math.max(agents.length, 1);

  if (wide) {
    // three equal, truncating columns. anything beyond that folds into a count so the line never crowds
    const shown = agents.slice(0, MAX_COLUMNS);
    const more = agents.length - shown.length;
    return (
      <ul className="flex min-w-0 flex-1 items-center gap-2" aria-label="what the agents are doing">
        {shown.map((a) => (
          <li key={a.id} className="min-w-0 flex-1 basis-0">
            <ActivityLine agent={a} onTap={onTap} />
          </li>
        ))}
        {more > 0 && (
          <li className="shrink-0">
            <button
              type="button"
              onClick={onMore}
              className="rounded-full bg-surface-2 px-1 py-0.5 text-micro text-ink-2 hover:text-ink figures"
              aria-label={`${more} more agents working, open the chat`}
            >
              +{more} more
            </button>
          </li>
        )}
      </ul>
    );
  }

  const current = agents[safeIndex];
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current.id + current.currentStep}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: duration.base }}
          >
            <ActivityLine agent={current} onTap={onTap} />
          </motion.div>
        </AnimatePresence>
      </div>
      {agents.length > 1 && (
        <span className="shrink-0 text-micro text-ink-3 figures" aria-label={`${safeIndex + 1} of ${agents.length} agents working`}>
          {safeIndex + 1}/{agents.length}
        </span>
      )}
    </div>
  );
}

function ActivityLine({ agent, onTap }: { agent: Agent; onTap: (a: Agent) => void }) {
  const tone = agent.state === "error" ? "text-danger" : agent.state === "waiting" ? "text-proposed" : "text-ink-2";
  return (
    <button
      type="button"
      onClick={() => onTap(agent)}
      className="group flex w-full min-w-0 items-center gap-1 rounded-full text-left text-body-sm hover:text-ink"
      title={`${agent.name}: ${agent.currentStep}`}
    >
      <AgentAvatar agent={agent} size="xs" />
      <span className="min-w-0 truncate">
        <span className="font-medium text-ink">{agent.name}</span>
        <span className={cn("ml-0.5", tone)}>
          {agent.state === "thinking" && <ThinkingDots />}
          {verb(agent)} {agent.currentStep}
        </span>
      </span>
    </button>
  );
}

function verb(agent: Agent) {
  return agent.state === "error" ? "stopped while" : "is";
}

/** three dots rising in sequence. the streaming affordance used everywhere an agent is mid-thought */
export function ThinkingDots({ className }: { className?: string }) {
  return (
    <span className={cn("mr-0.5 inline-flex items-end gap-px align-middle", className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="inline-block size-0.5 rounded-full bg-accent animate-thinking" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}
