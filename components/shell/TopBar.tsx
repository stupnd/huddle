"use client";
import { MessagesSquare, RefreshCw, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AvatarStack } from "@/components/crew/MemberAvatar";
import { dateRange, nightsBetween } from "@/lib/format";
import { primaryAction, unseenMessageCount } from "@/lib/domain/select";
import { cn } from "@/lib/utils";
import { useShell } from "./ShellProvider";
import { usePlanActions } from "./usePlanActions";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Top bar: trip name as oversized display type, dates and destination, the crew
 * stacked, and the single primary action. The drawer toggle lives here too because
 * the drawer is chrome, not content.
 */
export function TopBar() {
  const { snapshot, drawerOpen, drawerMode, toggleDrawer, drawerSeenAt } = useShell();
  const { trip, members } = snapshot;
  const action = primaryAction(snapshot);
  const unseen = unseenMessageCount(snapshot, drawerSeenAt);
  const dated = trip.startDate && trip.endDate;
  const nights = dated ? nightsBetween(trip.startDate!, trip.endDate!) : 0;

  return (
    <header className="mx-auto w-full max-w-(--container-shell) px-2 pt-3 pb-2 md:px-4 md:pt-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between md:gap-4">
        <div className="min-w-0">
          <p className="mb-1 text-body-sm text-ink-2">
            <span className="text-ink">{trip.destination.toLowerCase() || "destination open"}</span>
            {trip.region && <span className="text-ink-3"> · {trip.region}</span>}
            <span className="text-ink-3"> · </span>
            {dated ? (
              <>
                <span className="figures">{dateRange(trip.startDate!, trip.endDate!)}</span>
                <span className="text-ink-3 figures"> · {nights} {nights === 1 ? "night" : "nights"}</span>
              </>
            ) : (
              <span className="text-ink-3">dates not set</span>
            )}
          </p>
          <h1 className="text-balance font-display text-display-xl text-ink md:text-display-2xl">{trip.name}</h1>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 md:pb-1">
          <AvatarStack members={members} size="md" className="mr-0.5" />

          <PrimaryAction kind={action} />

          <ThemeToggle />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={drawerOpen ? "secondary" : "ghost"}
                size="icon"
                aria-label={drawerOpen ? "hide agent chat" : "show agent chat"}
                aria-pressed={drawerOpen}
                onClick={toggleDrawer}
                className={cn("relative", drawerMode === "docked" && "xl:hidden")}
              >
                <MessagesSquare />
                {unseen > 0 && !drawerOpen && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-2 min-w-2 items-center justify-center rounded-full bg-accent px-0.5 text-micro font-semibold text-accent-ink figures" aria-hidden>
                    {unseen}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{drawerOpen ? "hide agent chat" : `agent chat${unseen ? `, ${unseen} new` : ""}`}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}

const actionCopy = {
  build: { label: "build the plan", busyLabel: "building", Icon: Sparkles, hint: "huddle drafts every day from what the crew has said. takes up to a minute" },
  replan: { label: "replan", busyLabel: "replanning", Icon: RefreshCw, hint: "something changed since the last plan. rebuild it. takes up to a minute" },
  share: { label: "share plan", busyLabel: "sharing", Icon: Send, hint: "copy the dashboard link for the group chat" },
} as const;

function PrimaryAction({ kind }: { kind: keyof typeof actionCopy }) {
  const { label, busyLabel, Icon, hint } = actionCopy[kind];
  const { build, replan, share, busy } = usePlanActions();
  const handlers = { build, replan, share } as const;
  const isBusy = busy === kind;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="primary" size="md" onClick={handlers[kind]} disabled={busy !== null} aria-busy={isBusy}>
          <Icon className={isBusy ? "animate-spin" : undefined} />
          {isBusy ? busyLabel : label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
