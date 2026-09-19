"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import type { Stop } from "@/lib/domain/types";
import { conflictsForDay, days as selectDays, droppedStopsForDay, gapMinutes, liveStopsForDay } from "@/lib/domain/select";
import { listStagger } from "@/lib/design/tokens";
import { api } from "@/lib/api";
import { clock, minutes } from "@/lib/format";
import { formatTravel, type Leg } from "@/lib/hooks/useTripGeo";
import { useAction } from "@/lib/hooks/useAction";
import { useShell } from "@/components/shell/ShellProvider";
import { StaleBanner } from "@/components/shell/StaleBanner";
import { usePlanActions } from "@/components/shell/usePlanActions";
import { AgentFailures } from "@/components/agents/AgentThinking";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { ConflictBanner } from "./ConflictBanner";
import { DaySwitcher } from "./DaySwitcher";
import { RemovedStrip } from "./RemovedStrip";
import { Connector, StopCard } from "./StopCard";
import { TripGlance } from "./TripGlance";
import { TripMap } from "./TripMap";

/**
 * Plan tab: glance → interactive whole-day/trip map with travel times → day
 * timeline. Map and list stay in sync when you tap a stop.
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
  const [mapScope, setMapScope] = useState<"day" | "trip">("day");
  const [focusId, setFocusId] = useState<string | null>(highlightStop);
  const [dayLegs, setDayLegs] = useState<Leg[]>([]);

  const onDayLegs = useCallback((legs: Leg[]) => {
    if (mapScope === "day") setDayLegs(legs);
  }, [mapScope]);

  const selectDay = useCallback(
    (i: number) => {
      const next = new URLSearchParams(params.toString());
      next.set("day", String(i));
      next.delete("stop");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      setFocusId(null);
    },
    [params, pathname, router],
  );

  useEffect(() => {
    if (!highlightStop) return;
    const stop = snapshot.stops.find((s) => s.id === highlightStop);
    if (stop && stop.dayIndex !== selected) {
      selectDay(stop.dayIndex);
      return;
    }
    setFocusId(highlightStop);
    const t = setTimeout(() => document.getElementById(`stop-${highlightStop}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 450);
    return () => clearTimeout(t);
  }, [highlightStop, snapshot.stops, selected, selectDay]);

  const live = useMemo(() => liveStopsForDay(snapshot, selected), [snapshot, selected]);
  const allLive = useMemo(
    () => snapshot.stops.filter((s) => s.status !== "dropped").sort((a, b) => a.dayIndex - b.dayIndex || (a.time ?? "").localeCompare(b.time ?? "")),
    [snapshot.stops],
  );
  const mapStops = mapScope === "trip" ? allLive : live;
  const dropped = useMemo(() => droppedStopsForDay(snapshot, selected), [snapshot, selected]);
  const conflicts = useMemo(() => conflictsForDay(snapshot, selected), [snapshot, selected]);

  const setStatus = (stop: Stop, status: Stop["status"], reason?: string) =>
    run(`stop-${stop.id}`, () => api(`/api/trip/${tripId}/stops`, "PATCH", { stopId: stop.id, status, reason, by: "huddle" }), {
      done: status === "dropped" ? `dropped ${stop.title}. it is in the removed strip if you change your mind.` : status === "locked" ? `${stop.title} is locked in.` : `${stop.title} is back on the plan.`,
    });

  const openThread = (decisionId: string) => router.push(`/trip/${tripId}/decisions?thread=${decisionId}`);

  const onMapSelect = (id: string) => {
    setFocusId(id);
    const stop = snapshot.stops.find((s) => s.id === id);
    if (stop && stop.dayIndex !== selected) selectDay(stop.dayIndex);
    requestAnimationFrame(() => document.getElementById(`stop-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };

  if (snapshot.stops.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <TripGlance />
        <AgentFailures />
        <EmptyState
          title="no plan yet"
          body={
            snapshot.decisions.some((d) => d.status === "resolved")
              ? "the group has settled a few things. huddle can turn them into a day-by-day plan with real places and prices."
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
    <div className="flex flex-col gap-3">
      <TripGlance />

      <section className="flex flex-col gap-1.5" aria-label="trip map">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-display-md text-ink">the route</h2>
            <p className="text-body-sm text-ink-3">tap a pin, or hit jump tour to hop stop to stop with travel times on the lines.</p>
          </div>
          <div className="flex rounded-full border border-line bg-surface-1 p-0.5" role="group" aria-label="map scope">
            <ScopeButton active={mapScope === "day"} onClick={() => setMapScope("day")} label="this day" />
            <ScopeButton active={mapScope === "trip"} onClick={() => setMapScope("trip")} label="whole trip" />
          </div>
        </div>
        <TripMap
          key={mapScope === "day" ? `day-${selected}` : "trip"}
          stops={mapStops}
          near={snapshot.trip.destination}
          focusId={focusId}
          onSelectStop={onMapSelect}
          onLegs={mapScope === "day" ? onDayLegs : undefined}
        />
      </section>

      <DaySwitcher days={dayList} selected={selected} onSelect={selectDay} currency={snapshot.trip.currency} />

      <StaleBanner />
      <AgentFailures />

      <h2 className="font-display text-display-md text-ink">
        {dayList.find((d) => d.index === selected)?.label.toLowerCase()}
      </h2>

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

      <motion.ol key={`list-${selected}`} variants={listStagger} initial="initial" animate="animate" className="flex flex-col" aria-label="stops">
        {live.map((stop, i) => {
          const prev = live[i - 1];
          const leg = prev ? dayLegs.find((l) => l.fromId === prev.id && l.toId === stop.id) : null;
          const travel = leg ? formatTravel(leg.durationSec, leg.distanceM, leg.mode) : null;
          return (
            <li key={stop.id} className="grid grid-cols-[3.5rem_1fr] gap-x-1 md:grid-cols-[4.5rem_1fr]">
              {i > 0 && (
                <div className="col-start-2">
                  <Connector
                    label={travel?.label ?? connectorLabel(prev, stop)}
                    accent={Boolean(travel)}
                    onJump={() => onMapSelect(stop.id)}
                  />
                </div>
              )}
              <div className="col-start-1 pt-2 text-right">
                <time className="font-body text-figure text-ink figures">{stop.time ? clock(stop.time) : stop.timeLabel || "tbd"}</time>
              </div>
              <div className="col-start-2">
                <StopCard
                  stop={stop}
                  index={i + 1}
                  onOpenThread={openThread}
                  highlighted={focusId === stop.id || highlightStop === stop.id}
                  onFocusMap={() => onMapSelect(stop.id)}
                />
              </div>
            </li>
          );
        })}
        {live.length === 0 && (
          <li>
            <EmptyState title="nothing on this day" body="every stop here was dropped. put one back below, or replan and huddle fills it." />
          </li>
        )}
      </motion.ol>

      <RemovedStrip stops={dropped} busy={busy} onRestore={(s) => setStatus(s, "proposed")} />
    </div>
  );
}

function ScopeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <Button size="sm" variant={active ? "primary" : "quiet"} onClick={onClick} aria-pressed={active} className={cn(active && "shadow-none")}>
      {label}
    </Button>
  );
}

function connectorLabel(prev: Stop, next: Stop): string | null {
  if (prev.category === "transport") {
    const m = prev.reasoning.match(/(\d{1,3})(?:\s*(?:-|to)\s*(\d{1,3}))?\s*min/i);
    if (m) return `ride ${m[2] ? `${m[1]} to ${m[2]}` : `about ${m[1]}`} min`;
  }
  if (next.travelFromPrevMin) return `${minutes(next.travelFromPrevMin)} travel`;
  const gap = gapMinutes(prev, next);
  return gap === null ? null : gap === 0 ? "right after" : `${minutes(gap)} later`;
}
