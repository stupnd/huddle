"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Minus, Plus } from "lucide-react";
import { categoryTotals, groupTotal, needsYouCount, perPersonTotal } from "@/lib/domain/select";
import { agentEnter } from "@/lib/design/tokens";
import { api } from "@/lib/api";
import { dateRange, money, plural } from "@/lib/format";
import { useAction } from "@/lib/hooks/useAction";
import { useShell } from "@/components/shell/ShellProvider";
import { CategoryBar } from "@/components/money/CategoryBar";
import { AvatarStack } from "@/components/crew/MemberAvatar";
import { Button } from "@/components/ui/button";

/**
 * Trip at a glance — denser, more alive: destination signal, crew stack, cost,
 * and a vote nudge when something needs the group.
 */
export function TripGlance() {
  const { snapshot, tripId } = useShell();
  const { trip, members, costLines } = snapshot;
  const { run, busy } = useAction();
  const needsYou = needsYouCount(snapshot);
  const perPerson = perPersonTotal(snapshot);
  const group = groupTotal(snapshot);
  const byCategory = categoryTotals(snapshot);
  const dated = trip.startDate && trip.endDate;
  const hasCosts = costLines.length > 0;

  const setGroupSize = (n: number) =>
    run("group-size", () => api(`/api/trip/${tripId}/settings`, "PATCH", { group_size: n }), {
      done: `${n} going.`,
    });

  return (
    <motion.section
      aria-label="trip at a glance"
      variants={agentEnter}
      initial="initial"
      animate="animate"
      className="relative overflow-hidden rounded-2xl border border-line bg-surface-1 p-2.5 md:p-3"
    >
      <div
        className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-accent/15 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-20 -left-8 size-40 rounded-full bg-chart-activities/10 blur-3xl"
        aria-hidden
      />

      <div className="relative flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-body-sm text-ink-3">where things stand</p>
          <p className="mt-0.5 font-display text-display-md text-ink">
            {trip.destination.toLowerCase() || "destination open"}
            {trip.region && <span className="text-ink-3"> · {trip.region}</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-body-sm text-ink-2">
            {dated ? (
              <span className="figures">{dateRange(trip.startDate!, trip.endDate!)}</span>
            ) : (
              <span className="text-ink-3">dates still fuzzy</span>
            )}
            <span className="text-ink-3">·</span>
            <span className="figures">
              {plural(members.length, "person in chat", "people in chat")}
              {trip.groupSize !== members.length && ` · ${trip.groupSize} going`}
            </span>
          </p>
        </div>
        <AvatarStack members={members} size="md" />
      </div>

      {needsYou > 0 && (
        <Link
          href={`/trip/${tripId}/decisions`}
          className="relative mt-2 flex items-center justify-between gap-2 rounded-xl border border-contested/30 bg-contested-soft/40 px-2 py-1.5 text-body-sm text-ink transition-colors hover:border-contested/50"
        >
          <span>
            <span className="font-medium text-contested">{plural(needsYou, "thing needs a vote", "things need a vote")}</span>
            <span className="text-ink-3"> — decide so the plan can move</span>
          </span>
          <span className="text-micro text-contested">open →</span>
        </Link>
      )}

      {hasCosts ? (
        <div className="relative mt-2 flex flex-col gap-1.5 border-t border-line pt-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <p>
                <span className="font-body text-figure-lg text-ink figures">{money(perPerson, trip.currency)}</span>
                <span className="ml-0.5 text-body-sm text-ink-3">pp, estimate</span>
              </p>
              <p className="text-body-sm text-ink-3 figures">
                {money(group, trip.currency)} group · {costLines.length} priced stops
              </p>
            </div>
            <div className="flex items-center gap-1" role="group" aria-label="how many are going">
              <Button
                size="icon-sm"
                variant="secondary"
                aria-label="one fewer"
                disabled={trip.groupSize <= 1 || busy === "group-size"}
                onClick={() => setGroupSize(trip.groupSize - 1)}
              >
                <Minus />
              </Button>
              <span className="min-w-2 text-center text-body-sm text-ink figures" aria-live="polite">
                {trip.groupSize}
              </span>
              <Button
                size="icon-sm"
                variant="secondary"
                aria-label="one more"
                disabled={trip.groupSize >= 20 || busy === "group-size"}
                onClick={() => setGroupSize(trip.groupSize + 1)}
              >
                <Plus />
              </Button>
            </div>
          </div>
          {byCategory.length > 0 && <CategoryBar totals={byCategory} currency={trip.currency} />}
          <p className="text-micro text-ink-3">estimates from the plan — not settle-up.</p>
        </div>
      ) : (
        <p className="relative mt-2 border-t border-line pt-2 text-body-sm text-ink-3">
          costs show up here once the plan has priced stops.
        </p>
      )}
    </motion.section>
  );
}
