"use client";
import { motion } from "framer-motion";
import { TriangleAlert } from "lucide-react";
import type { PlanConflict } from "@/lib/domain/types";
import { agentEnter } from "@/lib/design/tokens";
import { Button } from "@/components/ui/button";

/**
 * The plan disagrees with something newer. One sentence, three ways out:
 * accept (drop the stop), keep current (lock it), or open the debate.
 */
export function ConflictBanner({
  conflict,
  busy,
  onAccept,
  onKeep,
  onDebate,
}: {
  conflict: PlanConflict;
  busy: boolean;
  onAccept: () => void;
  onKeep: () => void;
  onDebate?: () => void;
}) {
  return (
    <motion.section
      variants={agentEnter}
      initial="initial"
      animate="animate"
      role="alert"
      className="flex flex-col gap-1.5 rounded-xl border border-contested/40 bg-contested-soft/60 p-2 md:flex-row md:items-center md:justify-between"
    >
      <p className="flex min-w-0 items-start gap-1 text-body text-ink">
        <TriangleAlert className="mt-0.5 size-2 shrink-0 text-contested" aria-hidden />
        <span>{conflict.statement}</span>
      </p>
      <div className="flex shrink-0 flex-wrap gap-0.5">
        <Button size="sm" variant="primary" disabled={busy} onClick={onAccept}>
          accept, drop it
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={onKeep}>
          keep current
        </Button>
        {onDebate && (
          <Button size="sm" variant="ghost" onClick={onDebate}>
            open the debate
          </Button>
        )}
      </div>
    </motion.section>
  );
}
