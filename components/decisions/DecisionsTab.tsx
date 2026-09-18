"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import type { Decision, DecisionStatus } from "@/lib/domain/types";
import { decisionsByStatus } from "@/lib/domain/select";
import { listStagger } from "@/lib/design/tokens";
import { useShell } from "@/components/shell/ShellProvider";
import { AgentFailures } from "@/components/agents/AgentThinking";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { ThreadCard } from "./ThreadCard";

/**
 * Decisions tab. Threads grouped by what they need: needs you and options ready open
 * by default, agents debating and resolved collapsed. Dedupe happens in the adapter;
 * merged threads carry a note. `?thread=` opens and highlights one thread.
 */
const SECTIONS: { key: DecisionStatus; title: string; blurb: string; open: boolean }[] = [
  { key: "needs_you", title: "needs you", blurb: "nobody is on these. assign an agent and they come back with options.", open: true },
  { key: "options_ready", title: "options ready", blurb: "vote, then settle. the winner goes on the plan at the next replan.", open: true },
  { key: "debating", title: "agents debating", blurb: "two agents disagree. read both, pick one.", open: false },
  { key: "resolved", title: "resolved", blurb: "settled. reopen if the group changes its mind.", open: false },
];

export function DecisionsTab() {
  const { snapshot } = useShell();
  const params = useSearchParams();
  const target = params.get("thread");
  const groups = useMemo(() => decisionsByStatus(snapshot), [snapshot]);
  const [open, setOpen] = useState<Record<DecisionStatus, boolean>>(() => Object.fromEntries(SECTIONS.map((s) => [s.key, s.open])) as Record<DecisionStatus, boolean>);

  // a deep link: open that thread's section and bring it into view
  useEffect(() => {
    if (!target) return;
    const d = snapshot.decisions.find((x) => x.id === target);
    if (!d) return;
    setOpen((o) => ({ ...o, [d.status]: true }));
    // after the router's own scroll-to-top and the section's open animation
    const t = setTimeout(() => document.getElementById(`thread-${target}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 450);
    return () => clearTimeout(t);
  }, [target, snapshot.decisions]);

  if (snapshot.decisions.length === 0) {
    return (
      <EmptyState
        title="nothing to decide yet"
        body="when the group chat hits a fork, huddle opens a thread here with the options. until then, keep talking."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <AgentFailures />
      {SECTIONS.map((section) => {
        const items = groups[section.key];
        const isOpen = open[section.key];
        return (
          <section key={section.key} aria-labelledby={`sec-${section.key}`}>
            <button
              type="button"
              id={`sec-${section.key}`}
              aria-expanded={isOpen}
              onClick={() => setOpen((o) => ({ ...o, [section.key]: !o[section.key] }))}
              className="flex w-full items-center justify-between gap-1 rounded-md py-1 text-left"
            >
              <span className="flex items-baseline gap-1">
                <span className="font-display text-display-md text-ink">{section.title}</span>
                <span className={cn("rounded-full px-1 text-body-sm figures", section.key === "needs_you" && items.length ? "bg-contested-soft text-contested" : "bg-surface-2 text-ink-2")}>{items.length}</span>
              </span>
              <ChevronDown className={cn("size-2 text-ink-3 transition-transform duration-(--duration-fast)", isOpen && "rotate-180")} aria-hidden />
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                  <p className="mb-1 text-body-sm text-ink-3">{section.blurb}</p>
                  {items.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-line px-2 py-1.5 text-body-sm text-ink-3">{emptyLine(section.key)}</p>
                  ) : (
                    <motion.ol variants={listStagger} initial="initial" animate="animate" className="flex flex-col gap-1">
                      {items.map((d: Decision) => (
                        <li key={d.id}>
                          <ThreadCard decision={d} highlighted={target === d.id} />
                        </li>
                      ))}
                    </motion.ol>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        );
      })}
    </div>
  );
}

function emptyLine(key: DecisionStatus) {
  switch (key) {
    case "needs_you":
      return "every open thread has someone on it.";
    case "options_ready":
      return "no options to vote on right now.";
    case "debating":
      return "the agents agree with each other, for once.";
    case "resolved":
      return "nothing settled yet.";
  }
}
