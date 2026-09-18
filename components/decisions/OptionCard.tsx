"use client";
import { motion } from "framer-motion";
import { Check, Minus, Plus } from "lucide-react";
import type { Member, Option } from "@/lib/domain/types";
import { spring } from "@/lib/design/tokens";
import { money } from "@/lib/format";
import { MemberAvatar } from "@/components/crew/MemberAvatar";
import { ProvenanceTag } from "@/components/agents/ProvenanceTag";
import { cn } from "@/lib/utils";

/**
 * One option in a thread: title, price per person, a one-line pro and con, and the
 * members who have voted for it. The whole card is the vote control for the viewer;
 * a second tap takes the vote back.
 */
export function OptionCard({
  option,
  currency,
  voters,
  viewerVoted,
  winner,
  disabled,
  onVote,
}: {
  option: Option;
  currency: string;
  voters: Member[];
  viewerVoted: boolean;
  winner?: boolean;
  disabled?: boolean;
  onVote?: () => void;
}) {
  const interactive = Boolean(onVote) && !disabled;
  return (
    <motion.div
      layout
      transition={spring.gentle}
      className={cn(
        "flex h-full w-[17rem] shrink-0 snap-start flex-col gap-1 rounded-lg border bg-surface-2 p-1.5 text-left transition-colors duration-(--duration-fast)",
        winner ? "border-locked/50" : viewerVoted ? "border-accent" : "border-line",
        interactive && "hover:border-line-strong",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <h4 className="text-balance font-display text-display-sm text-ink">{option.title}</h4>
        <p className="shrink-0 text-right">
          <span className="block font-body text-figure text-ink figures">{option.pricePerPerson === null ? "unpriced" : money(option.pricePerPerson, currency)}</span>
          <span className="block text-micro text-ink-3">{option.pricePerPerson === null ? "estimate pending" : "per person, est."}</span>
        </p>
      </div>
      {option.pro && (
        <p className="flex gap-0.5 text-body-sm text-ink-2">
          <Plus className="mt-0.5 size-1.5 shrink-0 text-locked" aria-label="pro" />
          <span className="line-clamp-2">{option.pro}</span>
        </p>
      )}
      <p className="flex gap-0.5 text-body-sm text-ink-3">
        <Minus className="mt-0.5 size-1.5 shrink-0 text-contested" aria-label="con" />
        <span className="line-clamp-2">{option.con ?? "no downside named yet"}</span>
      </p>
      <div className="mt-auto flex items-center justify-between gap-1 pt-0.5">
        <ProvenanceTag provenance={option.proposedBy} verb="from" />
        <div className="flex items-center" aria-label={voters.length ? `votes: ${voters.map((v) => v.name).join(", ")}` : "no votes yet"}>
          {voters.map((v, i) => (
            <MemberAvatar key={v.id} member={v} size="xs" className={cn("outline-2 outline-surface-2", i > 0 && "-ml-0.5")} />
          ))}
        </div>
      </div>
      {onVote && (
        <button
          type="button"
          onClick={onVote}
          disabled={disabled}
          aria-pressed={viewerVoted}
          className={cn(
            "mt-0.5 flex h-4 items-center justify-center gap-0.5 rounded-full text-body-sm font-medium transition-colors duration-(--duration-fast)",
            viewerVoted ? "bg-accent text-accent-ink" : "border border-line text-ink-2 hover:border-line-strong hover:text-ink",
            disabled && "opacity-40",
          )}
        >
          {viewerVoted && <Check className="size-1.5" aria-hidden />}
          {winner ? "chosen" : viewerVoted ? "your vote" : "vote for this"}
        </button>
      )}
    </motion.div>
  );
}
