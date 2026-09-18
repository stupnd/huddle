"use client";
import { useState } from "react";
import type { Stop } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { StatusChip } from "./StatusChip";

/**
 * Map view for a day. Stops carry no coordinates yet, only a place name, so the map
 * is one place at a time: pick a stop in the rail, the map shows it. Loaded only when
 * the toggle is on so the timeline never pays for it.
 */
export function DayMap({ stops, near }: { stops: Stop[]; near: string }) {
  const [active, setActive] = useState(stops[0]?.id ?? null);
  const stop = stops.find((s) => s.id === active) ?? stops[0];
  if (!stop) return null;
  const q = encodeURIComponent(`${stop.place.name}, ${near}`);

  return (
    <div className="grid gap-1 md:grid-cols-[16rem_1fr]">
      <ol className="flex gap-0.5 overflow-x-auto scrollbar-none md:flex-col md:overflow-visible" aria-label="stops on the map">
        {stops.map((s, i) => (
          <li key={s.id} className="shrink-0">
            <button
              type="button"
              onClick={() => setActive(s.id)}
              aria-pressed={s.id === stop.id}
              className={cn(
                "flex w-full min-w-[11rem] items-center gap-1 rounded-md border px-1 py-0.5 text-left text-body-sm transition-colors duration-(--duration-fast)",
                s.id === stop.id ? "border-accent bg-accent-soft text-ink" : "border-line bg-surface-1 text-ink-2 hover:text-ink",
              )}
            >
              <span className="flex size-2.5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-micro figures">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{s.title}</span>
              <StatusChip status={s.status} compact />
            </button>
          </li>
        ))}
      </ol>
      <div className="photo-duotone aspect-[4/3] overflow-hidden rounded-xl border border-line bg-surface-2 md:aspect-auto md:min-h-[24rem]">
        <iframe
          title={`map of ${stop.place.name}`}
          src={`https://maps.google.com/maps?q=${q}&z=14&output=embed`}
          className="size-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </div>
  );
}
