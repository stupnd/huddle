import type { Agent } from "@/lib/domain/types";
import { avatarBg, hashSeed, hueFor } from "@/lib/design/tokens";
import { cn } from "@/lib/utils";

/**
 * Generated geometric avatar for an agent. A solid disc in the agent's hue with a
 * dark mark composed from its name hash. Members get monograms (MemberAvatar), agents
 * get marks, so the two are never confused at a glance. Huddle always wears the accent sand
 * and a fixed compass-ring mark.
 */

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

export const avatarSize: Record<AvatarSize, string> = {
  xs: "size-2.5",
  sm: "size-3",
  md: "size-4",
  lg: "size-5",
  xl: "size-7",
};

type Props = {
  agent: Pick<Agent, "id" | "name" | "specialty">;
  size?: AvatarSize;
  className?: string;
};

export function AgentAvatar({ agent, size = "md", className }: Props) {
  const isHuddle = agent.specialty === "orchestrator";
  const hue = hueFor(agent.name);
  const mark = isHuddle ? -1 : hashSeed(agent.name) % MARKS.length;

  return (
    <span
      role="img"
      aria-label={`${agent.name} avatar`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        isHuddle ? "bg-accent" : avatarBg[hue],
        avatarSize[size],
        className,
      )}
    >
      <svg viewBox="0 0 32 32" className="size-full text-canvas" aria-hidden>
        {mark === -1 ? <HuddleMark /> : MARKS[mark]}
      </svg>
    </span>
  );
}

/* marks are drawn in currentColor on a 32 unit grid */

function HuddleMark() {
  return (
    <>
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <circle cx="16" cy="16" r="2.4" fill="currentColor" />
      <path d="M22 10 L17.6 14.4 L14.4 17.6 L10 22 L14.4 14.4 Z" fill="currentColor" />
    </>
  );
}

const MARKS = [
  // quarter disc and a dot
  <g key="q"><path d="M8 24 A16 16 0 0 1 24 8 L24 24 Z" fill="currentColor" /><circle cx="11" cy="11" r="3" fill="currentColor" /></g>,
  // triangle pointing up
  <path key="t" d="M16 7 L26 25 L6 25 Z" fill="currentColor" />,
  // two bars
  <g key="b"><rect x="8" y="7" width="6" height="18" rx="3" fill="currentColor" /><rect x="18" y="7" width="6" height="18" rx="3" fill="currentColor" /></g>,
  // half disc
  <path key="h" d="M6 16 A10 10 0 0 1 26 16 Z" fill="currentColor" />,
  // diamond
  <path key="d" d="M16 6 L26 16 L16 26 L6 16 Z" fill="currentColor" />,
  // ring
  <circle key="r" cx="16" cy="16" r="8" fill="none" stroke="currentColor" strokeWidth="5" />,
  // diagonal split
  <path key="s" d="M6 26 L26 6 L26 26 Z" fill="currentColor" />,
  // three dots
  <g key="3"><circle cx="9" cy="16" r="3.2" fill="currentColor" /><circle cx="16" cy="16" r="3.2" fill="currentColor" /><circle cx="23" cy="16" r="3.2" fill="currentColor" /></g>,
  // arch
  <path key="a" d="M7 26 L7 16 A9 9 0 0 1 25 16 L25 26 L19 26 L19 16 A3 3 0 0 0 13 16 L13 26 Z" fill="currentColor" />,
  // stacked pills
  <g key="p"><rect x="7" y="9" width="18" height="5" rx="2.5" fill="currentColor" /><rect x="7" y="18" width="12" height="5" rx="2.5" fill="currentColor" /></g>,
];
