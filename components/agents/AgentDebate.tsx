"use client";
import type { Decision, Position } from "@/lib/domain/types";
import { agentById } from "@/lib/domain/select";
import { useShell } from "@/components/shell/ShellProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AgentIdentity } from "./AgentIdentity";

/**
 * AgentDebate: two or more positions side by side, each with its strongest reason,
 * and a human resolve control on every side. The humans end debates, not the agents.
 */
export function AgentDebate({ decision, busy, onResolve, className }: { decision: Decision; busy: boolean; onResolve: (position: Position) => void; className?: string }) {
  const { snapshot, openDrawerAt } = useShell();
  const positions = decision.debate ?? [];
  if (!positions.length) return null;
  return (
    <div className={cn("grid gap-1 md:grid-cols-2", positions.length > 2 && "lg:grid-cols-3", className)} role="group" aria-label="positions">
      {positions.map((p) => {
        const agent = agentById(snapshot, p.agentId);
        if (!agent) return null;
        const last = [...snapshot.messages].reverse().find((m) => m.agentId === agent.id);
        return (
          <article key={p.agentId} className="flex flex-col gap-1 rounded-lg border border-contested/30 bg-surface-2 p-1.5">
            <AgentIdentity agent={agent} size="sm" showState={false} />
            <p className="font-display text-display-sm text-ink">{p.claim.toLowerCase()}</p>
            <p className="text-body-sm text-ink-2">{p.reason}</p>
            <div className="mt-auto flex flex-wrap gap-0.5 pt-0.5">
              <Button size="sm" variant="primary" disabled={busy} onClick={() => onResolve(p)}>
                go with {agent.name.toLowerCase()}
              </Button>
              {last && (
                <Button size="sm" variant="ghost" onClick={() => openDrawerAt(last.id)}>
                  read the argument
                </Button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
