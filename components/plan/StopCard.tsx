"use client";
import { motion } from "framer-motion";
import { ExternalLink, MapPin } from "lucide-react";
import type { Stop } from "@/lib/domain/types";
import { agentEnter } from "@/lib/design/tokens";
import { money } from "@/lib/format";
import { useSnapshot } from "@/components/shell/ShellProvider";
import { ProvenanceTag } from "@/components/agents/ProvenanceTag";
import { cn } from "@/lib/utils";
import { PlacePhoto } from "./PlacePhoto";
import { StatusChip } from "./StatusChip";

/**
 * One stop on the timeline: time, title, neighborhood, one line of reasoning, cost,
 * status chip, provenance. Contested stops get a rose hairline so the eye finds them
 * before reading; locked stops are calm.
 */
export function StopCard({ stop, onOpenThread, highlighted }: { stop: Stop; onOpenThread?: (decisionId: string) => void; highlighted?: boolean }) {
  const { trip } = useSnapshot();
  const contested = stop.status === "contested";
  return (
    <motion.article
      id={`stop-${stop.id}`}
      variants={agentEnter}
      className={cn(
        "grid grid-cols-[auto_1fr] gap-1.5 rounded-xl border bg-surface-1 p-1.5 transition-colors duration-(--duration-slow) md:grid-cols-[auto_1fr_auto] md:gap-2 md:p-2",
        contested ? "border-contested/40" : "border-line",
        stop.status === "locked" && "border-locked/25",
        highlighted && "border-accent bg-accent-soft",
      )}
      aria-label={`${stop.title}, ${stop.status}`}
    >
      <PlacePhoto name={stop.place.name} url={stop.place.photoUrl} className="size-7 md:size-9" />

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1">
          <StatusChip status={stop.status} />
          <span className="text-body-sm text-ink-3">{stop.category === "activities" ? "things to do" : stop.category === "transport" ? "getting around" : stop.category}</span>
        </div>
        <h3 className="mt-0.5 text-balance font-display text-display-sm text-ink">{stop.title}</h3>
        <p className="mt-0.5 flex items-center gap-0.5 text-body-sm text-ink-2">
          <MapPin className="size-1.5 shrink-0 text-ink-3" aria-hidden />
          <span className="truncate">{stop.place.neighborhood.toLowerCase()}</span>
          {stop.links?.maps && (
            <a href={stop.links.maps} target="_blank" rel="noreferrer" className="ml-0.5 inline-flex items-center gap-0.5 text-ink-3 hover:text-ink" aria-label={`open ${stop.place.name} in maps`}>
              <ExternalLink className="size-1.5" aria-hidden />
            </a>
          )}
        </p>
        {stop.reasoning && <p className="mt-1 text-body-sm text-ink-2">{stop.reasoning}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {stop.proposedBy && <ProvenanceTag provenance={stop.proposedBy} />}
          {stop.decisionId && onOpenThread && (
            <button type="button" onClick={() => onOpenThread(stop.decisionId!)} className="text-micro text-contested hover:underline">
              {contested ? "open the thread" : "see the decision"}
            </button>
          )}
        </div>
        <Cost stop={stop} currency={trip.currency} groupSize={trip.groupSize} className="mt-1 md:hidden" />
      </div>

      <Cost stop={stop} currency={trip.currency} groupSize={trip.groupSize} className="hidden text-right md:block" />
    </motion.article>
  );
}

function Cost({ stop, currency, groupSize, className }: { stop: Stop; currency: string; groupSize: number; className?: string }) {
  const free = stop.costPerPerson === 0;
  return (
    <div className={cn("shrink-0", className)}>
      <p className={cn("font-body text-figure figures", free ? "text-ink-3" : "text-ink")}>{free ? "free" : money(stop.costPerPerson, currency)}</p>
      <p className="text-micro text-ink-3 figures">{free ? "per person" : `per person · ${money(stop.costPerPerson * groupSize, currency)} group`}</p>
    </div>
  );
}

/** the connector between two stops: a line with the gap or travel time in it */
export function Connector({ label }: { label: string | null }) {
  return (
    <div className="flex items-center gap-1 py-0.5 pl-2" aria-hidden>
      <span className="h-3 w-px bg-line-strong" />
      {label && <span className="text-micro text-ink-3 figures">{label}</span>}
    </div>
  );
}

