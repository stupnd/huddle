"use client";
import type { CostCategory } from "@/lib/domain/types";
import { categoryLabel } from "@/lib/domain/select";
import { money } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Spend by category as one horizontal stacked bar with a legend under it.
 * Segments keep a 2px surface gap, carry a direct label only when wide enough,
 * and never clip a number: the legend always holds the full figures. Below md
 * the bar gives way to the legend as a list, which is the same data.
 */
export const chartBg: Record<CostCategory, string> = {
  stays: "bg-chart-stays",
  food: "bg-chart-food",
  activities: "bg-chart-activities",
  transport: "bg-chart-transport",
  nightlife: "bg-chart-nightlife",
  flights: "bg-chart-flights",
};

export function CategoryBar({ totals, currency }: { totals: { category: CostCategory; group: number; perPerson: number; share: number }[]; currency: string }) {
  return (
    <figure className="flex flex-col gap-1.5">
      <div className="hidden h-5 w-full overflow-hidden rounded-md bg-surface-2 md:flex" role="img" aria-label={`spend by category: ${totals.map((t) => `${categoryLabel[t.category]} ${Math.round(t.share * 100)} percent`).join(", ")}`}>
        {totals.map((t, i) => (
          <Tooltip key={t.category}>
            <TooltipTrigger asChild>
              <div
                className={cn("relative flex h-full items-center overflow-hidden", chartBg[t.category], i > 0 && "border-l-2 border-surface-1")}
                style={{ width: `${t.share * 100}%` }}
                tabIndex={0}
              >
                {t.share >= 0.14 && (
                  <span className="truncate px-1 text-micro font-medium text-canvas">
                    {categoryLabel[t.category]} · {money(t.perPerson, currency)}
                  </span>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {categoryLabel[t.category]}: {money(t.perPerson, currency)} per person, {money(t.group, currency)} group, {Math.round(t.share * 100)}%
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <figcaption>
        <ul className="grid gap-x-3 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3" aria-label="legend">
          {totals.map((t) => (
            <li key={t.category} className="flex items-center justify-between gap-1 text-body-sm">
              <span className="flex min-w-0 items-center gap-1 text-ink-2">
                <span className={cn("size-1.5 shrink-0 rounded-full", chartBg[t.category])} aria-hidden />
                <span className="truncate">{categoryLabel[t.category]}</span>
              </span>
              <span className="shrink-0 text-ink figures">
                {money(t.perPerson, currency)} <span className="text-ink-3">pp · {Math.round(t.share * 100)}%</span>
              </span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
