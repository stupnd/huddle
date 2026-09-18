"use client";
import { RotateCcw } from "lucide-react";
import type { Agent } from "@/lib/domain/types";
import { api } from "@/lib/api";
import { useAction } from "@/lib/hooks/useAction";
import { useShell } from "@/components/shell/ShellProvider";
import { ThinkingDots } from "@/components/shell/StatusStrip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AgentIdentity } from "./AgentIdentity";

/**
 * AgentThinking: the streaming state. The agent, and its current step in plain
 * language. Announced politely to screen readers. Never a generic spinner.
 */
export function AgentThinking({ agent, className }: { agent: Agent; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5 rounded-lg border border-line bg-surface-1 px-1.5 py-1", className)} role="status" aria-live="polite">
      <AgentIdentity agent={agent} size="sm" showState={false} />
      <p className="flex min-w-0 items-center text-body-sm text-ink-2">
        <ThinkingDots />
        <span className="truncate">{agent.currentStep ?? "thinking"}</span>
      </p>
    </div>
  );
}

/** an agent stopped: who, what it was doing, why, and a retry. */
export function AgentFailure({ agent, className }: { agent: Agent; className?: string }) {
  const { tripId } = useShell();
  const { run, busy } = useAction();
  const retry = () => run(`retry-${agent.id}`, () => api(`/api/trip/${tripId}/agents`, "POST", { retry: agent.id }), { done: `${agent.name} is back on it.` });
  return (
    <div className={cn("flex flex-col gap-1 rounded-xl border border-danger/40 bg-danger-soft/50 p-1.5 md:flex-row md:items-center md:justify-between", className)} role="alert">
      <div className="min-w-0">
        <AgentIdentity agent={agent} size="sm" showState={false} />
        <p className="mt-0.5 text-body-sm text-ink">
          stopped while {agent.failure?.doing ?? agent.currentStep ?? "working"}
          {agent.failure?.reason && <span className="text-ink-2">: {agent.failure.reason}</span>}
        </p>
      </div>
      <Button size="sm" variant="secondary" disabled={busy !== null} onClick={retry} className="self-start md:self-auto">
        <RotateCcw />
        retry
      </Button>
    </div>
  );
}

/** every agent currently in an error state, for the top of a tab */
export function AgentFailures() {
  const { snapshot } = useShell();
  const failed = snapshot.agents.filter((a) => a.active && a.state === "error");
  if (!failed.length) return null;
  return (
    <div className="flex flex-col gap-1">
      {failed.map((a) => (
        <AgentFailure key={a.id} agent={a} />
      ))}
    </div>
  );
}
