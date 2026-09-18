"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { List, Map as MapIcon, Sparkles } from "lucide-react";
import type { Stop } from "@/lib/domain/types";
import { conflictsForDay, days as selectDays, droppedStopsForDay, gapMinutes, liveStopsForDay } from "@/lib/domain/select";
import { listStagger, tabTransition } from "@/lib/design/tokens";
import { api } from "@/lib/api";
import { clock, minutes } from "@/lib/format";
import { useAction } from "@/lib/hooks/useAction";
import { useShell } from "@/components/shell/ShellProvider";
import { StaleBanner } from "@/components/shell/StaleBanner";
import { usePlanActions } from "@/components/shell/usePlanActions";
import { AgentFailures } from "@/components/agents/AgentThinking";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConflictBanner } from "./ConflictBanner";
import { DayMap } from "./DayMap";
import { DaySwitcher } from "./DaySwitcher";
import { RemovedStrip } from "./RemovedStrip";
import { Connector, StopCard } from "./StopCard";

/**
 * Plan tab. Day switcher pinned under the tab bar, a vertical timeline for the
 * selected day, conflicts on top, dropped stops in a strip at the bottom, and a
 * map view behind a toggle. `?day=` and `?stop=` make every stop deep linkable.
 */
export function PlanTab() {
  const { snapshot, tripId } = useShell();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { run, busy } = useAction();
  const { build, busy: planBusy } = usePlanActions();

  const dayList = useMemo(() => selectDays(snapshot), [snapshot]);
  const requested = Number(params.get("day"));
  const selected = dayList.some((d) => d.index === requested) ? requested : (dayList[0]?.index ?? 0);
  const highlightStop = params.get("stop");
  const [view, setView] = useState<"list" | "map">("list");

  const selectDay = useCallback(
    (i: number) => {
      const next = new URLSearchParams(params.toString());
      next.set("day", String(i));
      next.delete("stop");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  // a deep link to a stop: land on its day and bring it into view
  useEffect(() => {
    if (!highlightStop) return;
    const stop = snapshot.stops.find((s) => s.id === highlightStop);
    if (stop && stop.dayIndex !== selected) {
      selectDay(stop.dayIndex);
      return;
    }
    const t = setTimeout(() => document.getElementById(`stop-${highlightStop}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 450);
    return () => clearTimeout(t);
  }, [highlightStop, snapshot.stops, selected, selectDay]);

  const live = useMemo(() => liveStopsForDay(snapshot, selected), [snapshot, selected]);
  const dropped = useMemo(() => droppedStopsForDay(snapshot, selected), [snapshot, selected]);
  const conflicts = useMemo(() => conflictsForDay(snapshot, selected), [snapshot, selected]);

  const setStatus = (stop: Stop, status: Stop["status"], reason?: string) =>
    run(`stop-${stop.id}`, () => api(`/api/trip/${tripId}/stops`, "PATCH", { stopId: stop.id, status, reason, by: "huddle" }), {
      done: status === "dropped" ? `dropped ${stop.title}. it is in the removed strip if you change your mind.` : status === "locked" ? `${stop.title} is locked in.` : `${stop.title} is back on the plan.`,
    });

  const openThread = (decisionId: string) => router.push(`/trip/${tripId}/decisions?thread=${decisionId}`);

  if (snapshot.stops.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <AgentFailures />
        <EmptyState
          title="no plan yet"
          body={
            snapshot.decisions.some((d) => d.status === "resolved")
              ? "the crew has settled a few things. huddle can turn them into a day-by-day plan with real places and prices."
              : "nothing is settled yet. once the group chat picks a destination and dates, huddle builds the days from there."
          }
          action={
            <Button variant="primary" onClick={build} disabled={planBusy !== null}>
              <Sparkles className={planBusy === "build" ? "animate-spin" : undefined} />
              {planBusy === "build" ? "building" : "build the plan"}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <DaySwitcher days={dayList} selected={selected} onSelect={selectDay} currency={snapshot.trip.currency} />

      <StaleBanner />
      <AgentFailures />

      <div className="flex items-center justify-between gap-1">
        <h2 className="font-display text-display-md text-ink">
          {dayList.find((d) => d.index === selected)?.label.toLowerCase()}
        </h2>
        <div className="flex rounded-full border border-line bg-surface-1 p-0.5" role="group" aria-label="view">
          <ViewButton active={view === "list"} onClick={() => setView("list")} label="timeline" Icon={List} />
          <ViewButton active={view === "map"} onClick={() => setView("map")} label="map" Icon={MapIcon} />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {conflicts.map((c) => {
          const stop = snapshot.stops.find((s) => s.id === c.proposal.stopId);
          if (!stop) return null;
          return (
            <ConflictBanner
              key={c.id}
              conflict={c}
              busy={busy === `stop-${stop.id}`}
              onAccept={() => setStatus(stop, "dropped", c.statement)}
              onKeep={() => setStatus(stop, "locked")}
              onDebate={c.decisionId ? () => openThread(c.decisionId!) : undefined}
            />
          );
        })}
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
        {view === "map" ? (
          <motion.div key="map" variants={tabTransition} initial="initial" animate="animate" exit="exit">
            <DayMap stops={live} near={snapshot.trip.destination} />
          </motion.div>
        ) : (
          <motion.ol key={`list-${selected}`} variants={listStagger} initial="initial" animate="animate" className="flex flex-col" aria-label="stops">
            {live.map((stop, i) => (
              <li key={stop.id} className="grid grid-cols-[3.5rem_1fr] gap-x-1 md:grid-cols-[4.5rem_1fr]">
                {i > 0 && (
                  <div className="col-start-2">
                    <Connector label={connectorLabel(live[i - 1], stop)} />
                  </div>
                )}
                <div className="col-start-1 pt-2 text-right">
                  <time className="font-body text-figure text-ink figures">{stop.time ? clock(stop.time) : stop.timeLabel || "tbd"}</time>
                </div>
                <div className="col-start-2">
                  <StopCard stop={stop} onOpenThread={openThread} highlighted={highlightStop === stop.id} />
                </div>
              </li>
            ))}
            {live.length === 0 && (
              <li>
                <EmptyState title="nothing on this day" body="every stop here was dropped. put one back below, or replan and huddle fills it." />
              </li>
            )}
          </motion.ol>
        )}
      </AnimatePresence>

      <RemovedStrip stops={dropped} busy={busy} onRestore={(s) => setStatus(s, "proposed")} />
    </div>
  );
}

function ViewButton({ active, onClick, label, Icon }: { active: boolean; onClick: () => void; label: string; Icon: typeof List }) {
  return (
    <Button size="sm" variant={active ? "primary" : "quiet"} onClick={onClick} aria-pressed={active}>
      <Icon />
      {label}
    </Button>
  );
}

/** what goes in the connector: a ride length when the previous stop was transport, else the gap */
function connectorLabel(prev: Stop, next: Stop): string | null {
  if (prev.category === "transport") {
    const m = prev.reasoning.match(/(\d{1,3})(?:\s*(?:-|to)\s*(\d{1,3}))?\s*min/i);
    if (m) return `ride ${m[2] ? `${m[1]} to ${m[2]}` : `about ${m[1]}`} min`;
  }
  const gap = gapMinutes(prev, next);
  return gap === null ? null : gap === 0 ? "right after" : `${minutes(gap)} later`;
}
