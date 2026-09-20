"use client";
import { useRef } from "react";
import { motion } from "framer-motion";
import type { Day } from "@/lib/domain/select";
import { spring } from "@/lib/design/tokens";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Segmented control for the days, pinned under the tab bar. Each segment shows the
 * weekday, date, stop count and the day's per-person total. Arrow keys move between
 * days; the selection pill glides. Scrolls horizontally on phones rather than shrinking.
 */
export function DaySwitcher({ days, selected, onSelect, currency }: { days: Day[]; selected: number; onSelect: (i: number) => void; currency: string }) {
  const ref = useRef<HTMLDivElement>(null);

  const onKey = (e: React.KeyboardEvent) => {
    const i = days.findIndex((d) => d.index === selected);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = days[(i + (e.key === "ArrowRight" ? 1 : -1) + days.length) % days.length];
      onSelect(next.index);
      ref.current?.querySelector<HTMLButtonElement>(`[data-day="${next.index}"]`)?.focus();
    }
  };

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label="days"
      onKeyDown={onKey}
      className="sticky top-(--height-tabbar) z-(--z-sticky) -mx-2 flex gap-0.5 overflow-x-auto bg-canvas/85 px-2 py-1 backdrop-blur-md scrollbar-none md:-mx-4 md:px-4 lg:top-0 lg:mx-0 lg:px-0"
    >
      {days.map((d) => {
        const active = d.index === selected;
        return (
          <button
            key={d.index}
            type="button"
            role="tab"
            data-day={d.index}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(d.index)}
            className={cn(
              "relative flex min-w-[7.5rem] shrink-0 flex-col items-start rounded-lg border px-1.5 py-1 text-left transition-colors duration-(--duration-fast)",
              active ? "border-transparent text-accent-ink" : "border-line bg-surface-1 text-ink-2 hover:border-line-strong hover:text-ink",
            )}
          >
            {active && <motion.span layoutId="day-active" transition={spring.snappy} className="absolute inset-0 rounded-lg bg-accent" aria-hidden />}
            <span className="relative font-display text-display-sm">
              {d.weekday} <span className={cn("font-body text-body-sm font-normal figures", active ? "text-accent-ink/70" : "text-ink-3")}>{d.date}</span>
            </span>
            <span className={cn("relative text-micro figures", active ? "text-accent-ink/80" : "text-ink-3")}>
              {d.stopCount} {d.stopCount === 1 ? "stop" : "stops"} · {money(d.total, currency)} pp
            </span>
          </button>
        );
      })}
    </div>
  );
}
