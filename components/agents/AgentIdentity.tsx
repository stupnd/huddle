import type { Agent, AgentState } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { AgentAvatar, type AvatarSize } from "./AgentAvatar";

/**
 * AgentIdentity: avatar, name, specialty and state. The one way an agent is named
 * anywhere in the interface. Layout variants:
 *  - "inline"  avatar and name on one line, for provenance and message headers
 *  - "stacked" avatar beside name over specialty, for cards and the roster
 */

export const specialtyLabel: Record<Agent["specialty"], string> = {
  orchestrator: "orchestrator",
  budget: "budget",
  local: "local guide",
  activities: "things to do",
  stays: "stays",
  food: "food",
  transport: "getting around",
  flights: "flights",
  nightlife: "nightlife",
};

export const stateLabel: Record<AgentState, string> = {
  idle: "idle",
  thinking: "thinking",
  debating: "debating",
  waiting: "waiting on you",
  error: "stopped",
};

const stateDot: Record<AgentState, string> = {
  idle: "bg-ink-3",
  thinking: "bg-accent animate-pulse-soft",
  debating: "bg-contested",
  waiting: "bg-proposed",
  error: "bg-danger",
};

type Props = {
  agent: Pick<Agent, "id" | "name" | "specialty" | "state">;
  variant?: "inline" | "stacked";
  size?: AvatarSize;
  showState?: boolean;
  showSpecialty?: boolean;
  className?: string;
};

export function AgentIdentity({ agent, variant = "inline", size, showState = true, showSpecialty, className }: Props) {
  const avatar = size ?? (variant === "stacked" ? "lg" : "sm");

  if (variant === "stacked") {
    return (
      <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
        <AgentAvatar agent={agent} size={avatar} />
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="truncate font-display text-display-sm text-ink">{agent.name}</span>
            {showState && <StateDot state={agent.state} />}
          </div>
          <div className="truncate text-body-sm text-ink-2">
            {specialtyLabel[agent.specialty]}
            {showState && <span className="text-ink-3"> · {stateLabel[agent.state]}</span>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <AgentAvatar agent={agent} size={avatar} />
      <span className="truncate font-medium text-ink">{agent.name}</span>
      {showSpecialty && <span className="truncate text-ink-3">{specialtyLabel[agent.specialty]}</span>}
      {showState && <StateDot state={agent.state} />}
    </span>
  );
}

export function StateDot({ state, className }: { state: AgentState; className?: string }) {
  return (
    <span className={cn("inline-block size-1 shrink-0 rounded-full", stateDot[state], className)} role="status" aria-label={stateLabel[state]} />
  );
}
