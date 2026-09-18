"use client";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { categoryLabel, categoryTotals, costsRecalculatedAt, dayTotals, groupTotal, owedByMember, perPersonTotal, splitIsUneven } from "@/lib/domain/select";
import { agentEnter, listStagger } from "@/lib/design/tokens";
import { api } from "@/lib/api";
import { money, timeAgo } from "@/lib/format";
import { useAction } from "@/lib/hooks/useAction";
import { useNow } from "@/lib/hooks/useNow";
import { useShell } from "@/components/shell/ShellProvider";
import { StaleBanner } from "@/components/shell/StaleBanner";
import { AgentFailures } from "@/components/agents/AgentThinking";
import { MemberAvatar } from "@/components/crew/MemberAvatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { CategoryBar, chartBg } from "./CategoryBar";

/**
 * Money tab. One source of truth, trip.groupSize, editable in a click at the top;
 * every figure below is derived from it. Everything is labeled an estimate and
 * dated. Category bar, per-day rows with the stops behind them, and who owes what.
 */
export function MoneyTab() {
  const { snapshot, tripId } = useShell();
  const { run, busy } = useAction();
  const now = useNow();
  const { trip, members } = snapshot;
  const currency = trip.currency;

  const perPerson = useMemo(() => perPersonTotal(snapshot), [snapshot]);
  const group = useMemo(() => groupTotal(snapshot), [snapshot]);
  const byCategory = useMemo(() => categoryTotals(snapshot), [snapshot]);
  const byDay = useMemo(() => dayTotals(snapshot), [snapshot]);
  const owed = useMemo(() => owedByMember(snapshot), [snapshot]);
  const uneven = splitIsUneven(snapshot);
  const recalculated = costsRecalculatedAt(snapshot);

  const setGroupSize = (n: number) => run("group-size", () => api(`/api/trip/${tripId}/settings`, "PATCH", { group_size: n }), { done: `${n} going. every number below is recalculated.` });

  if (snapshot.costLines.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <AgentFailures />
        <EmptyState title="no costs yet" body="prices come from the plan. once huddle builds the days, every stop carries an estimate per person and this tab adds them up." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <StaleBanner what="the estimate" />
      <AgentFailures />

      <section className="grid gap-1 md:grid-cols-[1fr_1fr_auto]" aria-label="totals">
        <Hero label="per person, estimate" value={money(perPerson, currency)} sub={`for ${trip.groupSize} going`} />
        <Hero label="group total, estimate" value={money(group, currency)} sub={`${byDay.length} ${byDay.length === 1 ? "day" : "days"} · ${snapshot.costLines.length} priced stops`} />
        <div className="flex flex-col justify-between gap-1 rounded-xl border border-line bg-surface-1 p-2">
          <p className="text-body-sm text-ink-2">how many are going</p>
          <div className="flex items-center gap-1" role="group" aria-label="group size">
            <Button size="icon-sm" variant="secondary" aria-label="one fewer" disabled={trip.groupSize <= 1 || busy === "group-size"} onClick={() => setGroupSize(trip.groupSize - 1)}>
              <Minus />
            </Button>
            <span className="min-w-3 text-center font-body text-figure-lg text-ink figures" aria-live="polite">
              {trip.groupSize}
            </span>
            <Button size="icon-sm" variant="secondary" aria-label="one more" disabled={trip.groupSize >= 20 || busy === "group-size"} onClick={() => setGroupSize(trip.groupSize + 1)}>
              <Plus />
            </Button>
          </div>
          <p className="text-micro text-ink-3">
            {members.length} in the chat. every number here divides by this.
          </p>
        </div>
      </section>

      <p className="text-micro text-ink-3 figures">
        all figures are estimates from the agents, per person unless it says group.
        {recalculated && ` last recalculated ${timeAgo(recalculated, now)}.`}
      </p>

      <section aria-labelledby="by-category" className="flex flex-col gap-1">
        <h2 id="by-category" className="font-display text-display-md text-ink">by category</h2>
        <CategoryBar totals={byCategory} currency={currency} />
      </section>

      <section aria-labelledby="by-day" className="flex flex-col gap-1">
        <h2 id="by-day" className="font-display text-display-md text-ink">by day</h2>
        <motion.ul variants={listStagger} initial="initial" animate="animate" className="flex flex-col gap-0.5">
          {byDay.map((d) => (
            <DayRow key={d.day.index} day={d} currency={currency} groupSize={trip.groupSize} />
          ))}
        </motion.ul>
      </section>

      <section aria-labelledby="split" className="flex flex-col gap-1">
        <h2 id="split" className="font-display text-display-md text-ink">who owes what</h2>
        <p className="text-body-sm text-ink-3">
          {uneven ? "some lines are split unevenly or were fronted by one person. net is what each still owes." : "everything splits evenly, so everyone owes the same share."}
        </p>
        <ul className="grid gap-0.5 sm:grid-cols-2">
          {owed.map(({ member, owes, paid, net }) => (
            <li key={member.id} className="flex items-center justify-between gap-1 rounded-lg border border-line bg-surface-1 px-1.5 py-1">
              <span className="flex min-w-0 items-center gap-1">
                <MemberAvatar member={member} size="sm" />
                <span className="truncate text-body text-ink">{member.name}</span>
              </span>
              <span className="text-right">
                <span className="block font-body text-figure text-ink figures">{money(uneven ? net : owes, currency)}</span>
                <span className="block text-micro text-ink-3 figures">{uneven ? `owes ${money(owes, currency)} · paid ${money(paid, currency)}` : "share, estimate"}</span>
              </span>
            </li>
          ))}
          {trip.groupSize > members.length && (
            <li className="flex items-center justify-between gap-1 rounded-lg border border-dashed border-line px-1.5 py-1 text-body-sm text-ink-3">
              <span>{trip.groupSize - members.length} more going, not in the chat yet</span>
              <span className="figures">{money(perPerson, currency)} each</span>
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

function Hero({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <motion.div variants={agentEnter} initial="initial" animate="animate" className="rounded-xl border border-line bg-surface-1 p-2">
      <p className="text-body-sm text-ink-2">{label}</p>
      <p className="mt-0.5 font-body text-figure-lg text-ink figures">{value}</p>
      <p className="mt-0.5 text-micro text-ink-3 figures">{sub}</p>
    </motion.div>
  );
}

function DayRow({ day, currency, groupSize }: { day: ReturnType<typeof dayTotals>[number]; currency: string; groupSize: number }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.li variants={agentEnter} className="rounded-lg border border-line bg-surface-1">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-1 px-1.5 py-1 text-left">
        <span className="flex items-baseline gap-1">
          <span className="font-display text-display-sm text-ink">{day.day.weekday}</span>
          <span className="text-body-sm text-ink-3 figures">{day.day.date} · {day.lines.length} priced</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="text-right">
            <span className="block font-body text-figure text-ink figures">{money(day.perPerson, currency)}</span>
            <span className="block text-micro text-ink-3 figures">pp · {money(day.group, currency)} group</span>
          </span>
          <ChevronDown className={cn("size-2 text-ink-3 transition-transform duration-(--duration-fast)", open && "rotate-180")} aria-hidden />
        </span>
      </button>
      {open && (
        <ul className="border-t border-line px-1.5 py-0.5">
          {day.lines.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-1 py-0.5 text-body-sm">
              <span className="flex min-w-0 items-center gap-1 text-ink-2">
                <span className={cn("size-1 shrink-0 rounded-full", chartBg[c.category])} aria-label={categoryLabel[c.category]} />
                <span className="truncate">{c.label}</span>
              </span>
              <span className="shrink-0 text-ink figures">
                {money(c.amount / groupSize, currency)} <span className="text-ink-3">pp</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </motion.li>
  );
}
