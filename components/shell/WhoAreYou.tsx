"use client";
import { useShell } from "./ShellProvider";
import { MemberAvatar } from "@/components/crew/MemberAvatar";
import { cn } from "@/lib/utils";

/**
 * One-time identity pick. Shared trip links have no login, so we ask once and
 * remember it locally. Editing wants and "needs you" votes only make sense once
 * we know who is looking.
 */
export function WhoAreYou() {
  const { snapshot, setViewer } = useShell();
  const { members, viewerId } = snapshot;

  if (viewerId || members.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-(--container-shell) px-2 md:px-4">
      <div
        role="group"
        aria-label="who are you"
        className="flex flex-col gap-1 rounded-xl border border-accent/30 bg-accent-soft/40 px-2 py-1.5 sm:flex-row sm:items-center sm:gap-2"
      >
        <p className="shrink-0 text-body-sm text-ink">
          <span className="font-medium">who are you?</span>
          <span className="text-ink-2"> pick once so your wants and votes stick.</span>
        </p>
        <ul className="flex flex-wrap gap-0.5">
          {members.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setViewer(m.id)}
                className={cn(
                  "flex items-center gap-1 rounded-full border border-line bg-surface-1 py-0.5 pr-1.5 pl-0.5",
                  "text-body-sm text-ink transition-colors hover:border-accent hover:bg-accent-soft",
                )}
              >
                <MemberAvatar member={m} size="sm" />
                {m.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
