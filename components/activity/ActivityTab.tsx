"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Check, FlaskConical, MessageSquareWarning, Pencil, Sparkles, Trash2 } from "lucide-react";
import type { ActivityEvent, ActivityType } from "@/lib/domain/types";
import { agentById } from "@/lib/domain/select";
import { agentEnter, listStaggerDense } from "@/lib/design/tokens";
import { timeAgo } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import { useShell } from "@/components/shell/ShellProvider";
import { AgentIdentity } from "@/components/agents/AgentIdentity";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

/**
 * Activity tab. What the agents did, in order, typed. Not the chat: each entry is
 * an action with a link to the thing it touched. Filters by agent and by type stack.
 */
const TYPES: { key: ActivityType; label: string; Icon: typeof Check; tone: string }[] = [
  { key: "proposed", label: "proposed", Icon: Sparkles, tone: "text-proposed" },
  { key: "revised", label: "revised", Icon: Pencil, tone: "text-ink-2" },
  { key: "removed", label: "removed", Icon: Trash2, tone: "text-dropped" },
  { key: "researched", label: "researched", Icon: FlaskConical, tone: "text-ink-2" },
  { key: "debated", label: "debated", Icon: MessageSquareWarning, tone: "text-contested" },
  { key: "resolved", label: "resolved", Icon: Check, tone: "text-locked" },
];

export function ActivityTab() {
  const { snapshot, tripId, openDrawerAt } = useShell();
  const now = useNow();
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<ActivityType | null>(null);

  const agentsSeen = useMemo(() => {
    const ids = new Set(snapshot.events.map((e) => e.agentId));
    return snapshot.agents.filter((a) => ids.has(a.id));
  }, [snapshot]);

  const events = useMemo(
    () => [...snapshot.events].reverse().filter((e) => (!agentFilter || e.agentId === agentFilter) && (!typeFilter || e.type === typeFilter)),
    [snapshot.events, agentFilter, typeFilter],
  );

  if (snapshot.events.length === 0) {
    return <EmptyState title="nothing has happened yet" body="every move an agent makes lands here: what it proposed, what it dropped, what it argued. the first one shows up when the chat gets going." />;
  }

  const href = (e: ActivityEvent) => {
    switch (e.target.kind) {
      case "stop":
        return `/trip/${tripId}/plan?stop=${e.target.id}`;
      case "day":
        return `/trip/${tripId}/plan?day=${e.target.index}`;
      case "decision":
        return `/trip/${tripId}/decisions?thread=${e.target.id}`;
      case "option":
        return `/trip/${tripId}/decisions?thread=${e.target.decisionId}`;
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap gap-0.5" role="group" aria-label="filter by agent">
          <FilterChip active={agentFilter === null} onClick={() => setAgentFilter(null)}>everyone</FilterChip>
          {agentsSeen.map((a) => (
            <FilterChip key={a.id} active={agentFilter === a.id} onClick={() => setAgentFilter(agentFilter === a.id ? null : a.id)}>
              <AgentAvatar agent={a} size="xs" />
              {a.name.toLowerCase()}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap gap-0.5" role="group" aria-label="filter by type">
          <FilterChip active={typeFilter === null} onClick={() => setTypeFilter(null)}>everything</FilterChip>
          {TYPES.map((t) => (
            <FilterChip key={t.key} active={typeFilter === t.key} onClick={() => setTypeFilter(typeFilter === t.key ? null : t.key)}>
              <t.Icon className={cn("size-1.5", t.tone)} aria-hidden />
              {t.label}
            </FilterChip>
          ))}
        </div>
      </div>

      <p className="text-body-sm text-ink-3 figures">
        {events.length} of {snapshot.events.length} entries, newest first
      </p>

      {events.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-2 py-1.5 text-body-sm text-ink-3">nothing matches those filters.</p>
      ) : (
        <motion.ol key={`${agentFilter}-${typeFilter}`} variants={listStaggerDense} initial="initial" animate="animate" className="flex flex-col">
          {events.map((e) => {
            const agent = agentById(snapshot, e.agentId);
            const type = TYPES.find((t) => t.key === e.type)!;
            return (
              <motion.li key={e.id} variants={agentEnter} className="grid grid-cols-[auto_1fr] gap-1.5 border-b border-line py-1.5 last:border-b-0">
                <span className={cn("mt-0.5 flex size-3 shrink-0 items-center justify-center rounded-full bg-surface-2", type.tone)} aria-label={type.label}>
                  <type.Icon className="size-1.5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-body text-ink">
                    {agent && <AgentIdentity agent={agent} size="xs" showState={false} className="mr-0.5 align-middle text-body" />}
                    <span className="text-ink-2">{e.summary}</span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-micro text-ink-3 figures">
                    <time dateTime={e.at}>{timeAgo(e.at, now)}</time>
                    <span className={type.tone}>{type.label}</span>
                    <Link href={href(e)} className="inline-flex items-center gap-0.5 text-ink-2 hover:text-ink">
                      open {e.target.kind === "day" ? `day ${e.target.index + 1}` : e.target.kind}
                      <ArrowRight className="size-1.5" aria-hidden />
                    </Link>
                    {e.messageId && (
                      <button type="button" onClick={() => openDrawerAt(e.messageId!)} className="text-ink-2 hover:text-ink">
                        in the chat
                      </button>
                    )}
                  </p>
                </div>
              </motion.li>
            );
          })}
        </motion.ol>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-4 items-center gap-0.5 rounded-full border px-1.5 text-body-sm transition-colors duration-(--duration-fast)",
        active ? "border-transparent bg-accent text-accent-ink" : "border-line bg-surface-1 text-ink-2 hover:border-line-strong hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
