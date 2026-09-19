"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Check, GitMerge, UserPlus } from "lucide-react";
import type { AgentSpecialty, Decision, Option } from "@/lib/domain/types";
import { agentById, memberById, tally } from "@/lib/domain/select";
import { agentEnter, spring } from "@/lib/design/tokens";
import { api } from "@/lib/api";
import { openFor, timeAgo } from "@/lib/format";
import { useAction } from "@/lib/hooks/useAction";
import { useNow } from "@/lib/hooks/useNow";
import { useShell } from "@/components/shell/ShellProvider";
import { usePlanActions } from "@/components/shell/usePlanActions";
import { useToast } from "@/components/ui/toast";
import { AgentDebate } from "@/components/agents/AgentDebate";
import { AgentIdentity, specialtyLabel } from "@/components/agents/AgentIdentity";
import { MemberAvatar } from "@/components/crew/MemberAvatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OptionCard } from "./OptionCard";

/**
 * One decision thread. The question, who raised it, how long it has been open,
 * then the body by status:
 *  - options ready: a row of option cards with live voting and a resolve control
 *  - needs you (no options): one action, assign the suggested agent
 *  - debating: the agents' positions side by side with a resolve on each
 *  - resolved: the outcome, quietly
 */

/** specialists the backend can spawn. budget and local questions go to activities */
const SPAWNABLE: Record<AgentSpecialty, string> = {
  orchestrator: "activities", budget: "activities", local: "activities",
  activities: "activities", stays: "stays", food: "food", transport: "transport", flights: "flights", nightlife: "nightlife",
};

export function ThreadCard({ decision, highlighted }: { decision: Decision; highlighted?: boolean }) {
  const { snapshot, tripId } = useShell();
  const { run, busy } = useAction();
  const { replan } = usePlanActions();
  const { notify } = useToast();
  const now = useNow();
  const [flying, setFlying] = useState<string | null>(null);

  const viewer = snapshot.viewerId;
  const votes = tally(decision);
  const myVote = decision.votes.find((v) => v.memberId === viewer)?.optionId ?? null;
  const resolved = decision.status === "resolved";
  const winner = decision.resolvedOptionId;
  const raiser =
    decision.raisedBy.kind === "member" ? memberById(snapshot, decision.raisedBy.id) : undefined;
  const raiserAgent = decision.raisedBy.kind === "agent" ? agentById(snapshot, decision.raisedBy.id) : undefined;
  const totalVotes = decision.votes.length;
  const leader = [...votes.entries()].sort((a, b) => b[1].length - a[1].length)[0];

  const vote = (option: Option) =>
    run(`vote-${decision.id}`, async () => {
      // The server identifies the voter from the sign-in cookie; a guest is sent to sign in first
      if (myVote === option.id) return api(`/api/trip/${tripId}/votes`, "DELETE", { decisionId: decision.id });
      return api(`/api/trip/${tripId}/votes`, "POST", { decisionId: decision.id, optionLabel: option.title });
    });

  const resolve = (chosen: string, optionId?: string) =>
    run(`resolve-${decision.id}`, () => api(`/api/trip/${tripId}/decisions`, "PATCH", { decisionId: decision.id, chosen }), { silent: true }).then((r) => {
      if (!r) return;
      if (optionId) setFlying(optionId);
      notify(`settled: ${chosen.toLowerCase()}. replan to put it on the timeline.`, { action: { label: "replan", onClick: replan } });
    });

  const reopen = () => run(`reopen-${decision.id}`, () => api(`/api/trip/${tripId}/decisions`, "PATCH", { decisionId: decision.id, reopen: true }), { done: "reopened. it is back in the open threads." });

  const assign = () => {
    const role = SPAWNABLE[decision.suggestedSpecialty ?? "activities"];
    return run(`assign-${decision.id}`, () => api(`/api/trip/${tripId}/agents`, "POST", { role, topic: decision.question }), {
      done: "on it. they will post to the chat when they have options.",
    });
  };

  return (
    <motion.article
      id={`thread-${decision.id}`}
      variants={agentEnter}
      layout
      transition={spring.gentle}
      className={cn(
        "flex flex-col gap-1.5 rounded-xl border bg-surface-1 p-2 transition-colors duration-(--duration-slow)",
        highlighted ? "border-accent bg-accent-soft" : decision.status === "debating" ? "border-contested/30" : "border-line",
      )}
    >
      <header className="flex flex-col gap-0.5">
        <h3 className="text-balance font-display text-display-sm text-ink">{decision.question}</h3>
        <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-body-sm text-ink-3">
          {raiser && (
            <span className="inline-flex items-center gap-0.5">
              <MemberAvatar member={raiser} size="xs" /> {raiser.name.toLowerCase()} raised it
            </span>
          )}
          {raiserAgent && <AgentIdentity agent={raiserAgent} size="xs" showState={false} className="text-body-sm" />}
          {raiserAgent && <span>raised it</span>}
          <span className="figures">· open {openFor(decision.openedAt, now)}</span>
          {resolved && decision.resolvedAt && <span className="figures">· settled {timeAgo(decision.resolvedAt, now)}</span>}
        </p>
        {decision.mergedFrom && (
          <p className="inline-flex items-center gap-0.5 text-micro text-ink-3">
            <GitMerge className="size-1.5" aria-hidden />
            merged from {decision.mergedFrom.map((m) => `"${m.question}"`).join(", ")}
          </p>
        )}
      </header>

      {decision.status === "debating" && (
        <AgentDebate decision={decision} busy={busy !== null} onResolve={(p) => resolve(p.claim, p.optionId)} />
      )}

      {decision.options.length > 0 && (
        <div className="-mx-2 flex snap-x gap-1 overflow-x-auto px-2 pb-0.5 scrollbar-none" role="list" aria-label="options">
          {decision.options.map((o) => {
            const voters = (votes.get(o.id) ?? []).map((id) => memberById(snapshot, id)).filter((m): m is NonNullable<typeof m> => !!m);
            const isFlying = flying === o.id;
            return (
              <motion.div key={o.id} role="listitem" className="flex" animate={isFlying ? { x: -24, y: -32, opacity: 0, scale: 0.9 } : { x: 0, y: 0, opacity: 1, scale: 1 }} transition={spring.gentle} onAnimationComplete={() => isFlying && setFlying(null)}>
                <OptionCard
                  option={o}
                  currency={snapshot.trip.currency}
                  voters={voters}
                  viewerVoted={myVote === o.id}
                  winner={winner === o.id}
                  disabled={busy === `vote-${decision.id}` || resolved}
                  onVote={resolved ? undefined : () => vote(o)}
                />
              </motion.div>
            );
          })}
        </div>
      )}

      {decision.suggestion && !resolved && (
        <p className="rounded-md border border-proposed/30 bg-proposed-soft/50 px-1.5 py-1 text-body-sm text-ink">
          <span className="text-proposed">huddle's pick: </span>
          {decision.suggestion}
        </p>
      )}

      {resolved && (
        <p className="inline-flex items-center gap-0.5 text-body text-locked">
          <Check className="size-2" aria-hidden />
          {(winner ? decision.options.find((o) => o.id === winner)?.title : decision.resolution) ?? "settled"}
        </p>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-1">
        {decision.status === "needs_you" && (
          <>
            <p className="text-body-sm text-ink-2">nobody is on this yet.</p>
            <Button size="sm" variant="primary" disabled={busy !== null} onClick={assign}>
              <UserPlus />
              assign {specialtyLabel[decision.suggestedSpecialty ?? "activities"]} agent
            </Button>
          </>
        )}
        {decision.status === "options_ready" && (
          <>
            <p className="text-body-sm text-ink-3 figures">
              {totalVotes === 0 ? "no votes yet" : `${totalVotes} of ${snapshot.members.length} voted`}
            </p>
            <div className="flex flex-wrap gap-0.5">
              {leader && leader[1].length > 0 && (
                <Button size="sm" variant="primary" disabled={busy !== null} onClick={() => resolve(decision.options.find((o) => o.id === leader[0])!.title, leader[0])} className="max-w-[18rem]">
                  <span className="truncate">settle on {decision.options.find((o) => o.id === leader[0])?.title.toLowerCase()}</span>
                </Button>
              )}
              {decision.suggestion && (
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => resolve(decision.suggestion!)}>
                  go with huddle's pick
                </Button>
              )}
            </div>
          </>
        )}
        {resolved && (
          <Button size="sm" variant="quiet" disabled={busy !== null} onClick={reopen} className="ml-auto">
            reopen
          </Button>
        )}
      </footer>
    </motion.article>
  );
}
