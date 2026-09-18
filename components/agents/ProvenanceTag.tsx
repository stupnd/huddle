"use client";
import type { Provenance } from "@/lib/domain/types";
import { agentById } from "@/lib/domain/select";
import { timeAgo } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import { useShell } from "@/components/shell/ShellProvider";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "./AgentAvatar";

/**
 * ProvenanceTag: who made this and when. Tapping opens the drawer at the message it
 * came from, when there is one. Used on stops, options and cost lines.
 */
export function ProvenanceTag({ provenance, verb = "proposed by", className }: { provenance: Provenance; verb?: string; className?: string }) {
  const { snapshot, openDrawerAt } = useShell();
  const now = useNow();
  const agent = agentById(snapshot, provenance.agentId);
  if (!agent) return null;
  const content = (
    <>
      <AgentAvatar agent={agent} size="xs" />
      <span className="text-ink-3">{verb}</span>
      <span className="font-medium text-ink-2">{agent.name}</span>
      <span className="text-ink-3 figures">{timeAgo(provenance.at, now)}</span>
    </>
  );
  const cls = cn("inline-flex min-w-0 items-center gap-0.5 rounded-full text-micro", className);
  if (!provenance.messageId) return <span className={cls}>{content}</span>;
  return (
    <button type="button" onClick={() => openDrawerAt(provenance.messageId!)} className={cn(cls, "hover:text-ink [&_span]:hover:text-ink")} title="open in agent chat">
      {content}
    </button>
  );
}
