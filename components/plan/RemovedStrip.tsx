"use client";
import { useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import type { Stop } from "@/lib/domain/types";
import { agentById, memberById } from "@/lib/domain/select";
import { timeAgo } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import { useSnapshot } from "@/components/shell/ShellProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Dropped stops collapse into a strip at the bottom of the day. Each one keeps its
 * reason and who removed it, and can be put back. Nothing is deleted silently.
 */
export function RemovedStrip({ stops, busy, onRestore }: { stops: Stop[]; busy: string | null; onRestore: (stop: Stop) => void }) {
  const [open, setOpen] = useState(false);
  const snapshot = useSnapshot();
  const now = useNow();
  if (stops.length === 0) return null;

  return (
    <section className="rounded-xl border border-dashed border-line bg-canvas">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-1 px-2 py-1.5 text-left text-body-sm text-ink-2 hover:text-ink"
      >
        <span>
          removed from plan <span className="text-ink-3 figures">· {stops.length}</span>
        </span>
        <ChevronDown className={cn("size-2 transition-transform duration-(--duration-fast)", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul className="flex flex-col gap-0.5 border-t border-line px-2 py-1">
          {stops.map((s) => {
            const by = s.dropped?.by;
            const who = by ? (by.kind === "agent" ? agentById(snapshot, by.id)?.name : memberById(snapshot, by.id)?.name) ?? "someone" : "huddle";
            return (
              <li key={s.id} className="flex items-center justify-between gap-2 py-0.5">
                <div className="min-w-0">
                  <p className="truncate text-body text-ink-2 line-through decoration-ink-3/60">{s.title}</p>
                  <p className="truncate text-micro text-ink-3">
                    {s.dropped?.reason ?? "removed"} · by {who.toLowerCase()}
                    {s.dropped && ` · ${timeAgo(s.dropped.at, now)}`}
                  </p>
                </div>
                <Button size="sm" variant="ghost" disabled={busy === `restore-${s.id}`} onClick={() => onRestore(s)}>
                  <RotateCcw />
                  put back
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
