"use client";
import { motion } from "framer-motion";
import { ExternalLink, MapPin, Navigation } from "lucide-react";
import type { Stop } from "@/lib/domain/types";
import { agentEnter } from "@/lib/design/tokens";
import { money } from "@/lib/format";
import { useSnapshot } from "@/components/shell/ShellProvider";
import { ProvenanceTag } from "@/components/agents/ProvenanceTag";
import { cn } from "@/lib/utils";
import { PlacePhoto } from "./PlacePhoto";
import { StatusChip } from "./StatusChip";

/**
 * One stop on the timeline: numbered badge, photo, title, neighborhood, reasoning,
 * cost. Contested stops get a rose edge; active/highlighted stops glow with accent.
 */
export function StopCard({
  stop,
  index,
  onOpenThread,
  highlighted,
  onFocusMap,
}: {
  stop: Stop;
  index?: number;
  onOpenThread?: (decisionId: string) => void;
  highlighted?: boolean;
  onFocusMap?: () => void;
}) {
  const { trip } = useSnapshot();
  const contested = stop.status === "contested";
  return (
    <motion.article
      id={`stop-${stop.id}`}
      variants={agentEnter}
      layout
      whileHover={{ y: -2 }}
      className={cn(
        "grid grid-cols-[auto_1fr] gap-1.5 rounded-2xl border bg-surface-1 p-1.5 transition-[border-color,box-shadow,background] duration-(--duration-slow) md:grid-cols-[auto_1fr_auto] md:gap-2 md:p-2",
        contested ? "border-contested/40" : "border-line",
        stop.status === "locked" && "border-locked/25",
        highlighted && "border-accent bg-accent-soft shadow-[0_0_0_1px_var(--color-accent),0_18px_40px_oklch(0%_0_0_/_0.28)]",
      )}
      aria-label={`${stop.title}, ${stop.status}`}
    >
      <div className="relative">
        <PlacePhoto name={stop.place.name} url={stop.place.photoUrl} className="size-8 rounded-xl md:size-10" />
        {index != null && (
          <span className="absolute -top-0.5 -left-0.5 flex size-2.5 items-center justify-center rounded-full border border-canvas bg-accent text-micro font-bold text-accent-ink figures shadow-sm">
            {index}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1">
          <StatusChip status={stop.status} />
          <span className="text-body-sm text-ink-3">
            {stop.category === "activities" ? "things to do" : stop.category === "transport" ? "getting around" : stop.category}
          </span>
        </div>
        <h3 className="mt-0.5 text-balance font-display text-display-sm text-ink">{stop.title}</h3>
        <p className="mt-0.5 flex items-center gap-0.5 text-body-sm text-ink-2">
          <MapPin className="size-1.5 shrink-0 text-ink-3" aria-hidden />
          <span className="truncate">{stop.place.neighborhood.toLowerCase()}</span>
          {stop.links?.maps && (
            <a
              href={stop.links.maps}
              target="_blank"
              rel="noreferrer"
              className="ml-0.5 inline-flex items-center gap-0.5 text-ink-3 hover:text-ink"
              aria-label={`open ${stop.place.name} in maps`}
            >
              <ExternalLink className="size-1.5" aria-hidden />
            </a>
          )}
          {onFocusMap && (
            <button
              type="button"
              onClick={onFocusMap}
              className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-surface-2 px-1 py-0.5 text-micro text-ink-2 hover:text-ink"
            >
              <Navigation className="size-1.5" aria-hidden />
              on map
            </button>
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

/** connector between stops — travel time from the map when we have it */
export function Connector({
  label,
  accent,
  onJump,
}: {
  label: string | null;
  accent?: boolean;
  onJump?: () => void;
}) {
  if (!label) {
    return (
      <div className="flex items-center py-1 pl-3" aria-hidden>
        <span className="h-4 w-px bg-gradient-to-b from-line-strong to-transparent" />
      </div>
    );
  }
  const inner = (
    <>
      <span className={cn("h-px w-3", accent ? "bg-accent/70" : "bg-line-strong")} />
      <span
        className={cn(
          "rounded-full border px-1.5 py-0.5 text-micro figures",
          accent ? "border-accent/40 bg-accent-soft text-ink" : "border-line bg-surface-2 text-ink-3",
        )}
      >
        {label}
      </span>
      <span className={cn("h-px flex-1", accent ? "bg-accent/40" : "bg-line")} />
    </>
  );
  if (onJump) {
    return (
      <button type="button" onClick={onJump} className="flex w-full items-center gap-1 py-1.5 text-left" aria-label={`jump to next stop: ${label}`}>
        {inner}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1 py-1.5" aria-hidden>
      {inner}
    </div>
  );
}
