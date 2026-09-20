"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { Stop } from "@/lib/domain/types";
import { clock, minutes } from "@/lib/format";

/**
 * The left column of a stop row: its start time, how long it takes, and nudge arrows.
 * Click the time or the duration to edit. Everything saves on blur or Enter.
 */
export function TimeCell({
  stop, first, last, busy, onTime, onDuration, onMove,
}: {
  stop: Stop; first: boolean; last: boolean; busy: boolean;
  onTime: (v: string) => void; onDuration: (v: number) => void; onMove: (dir: "up" | "down") => void;
}) {
  const [editing, setEditing] = useState<"time" | "dur" | null>(null);
  const [draft, setDraft] = useState("");
  const commit = () => {
    const v = draft.trim();
    if (editing === "time" && v !== (stop.timeLabel ?? "")) onTime(v);
    if (editing === "dur" && v !== "" && Number(v) !== (stop.durationMin ?? -1)) onDuration(Number(v));
    setEditing(null);
  };
  const input = "w-full rounded-md border border-line-strong bg-surface-1 px-1 py-0.5 text-right text-body-sm text-ink outline-none figures";

  return (
    <div className="flex flex-col items-end gap-0.5 pt-2 text-right">
      {editing === "time" ? (
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(null); }}
          placeholder="1:30pm" aria-label="start time" className={input} />
      ) : (
        <button type="button" onClick={() => { setDraft(stop.time ? clock(stop.time) : stop.timeLabel); setEditing("time"); }}
          className="font-body text-figure text-ink figures underline-offset-4 hover:underline" title="change the time">
          {stop.time ? clock(stop.time) : stop.timeLabel || "tbd"}
        </button>
      )}
      {editing === "dur" ? (
        <input autoFocus type="number" min={0} step={5} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(null); }}
          aria-label="duration in minutes" className={input} />
      ) : (
        <button type="button" onClick={() => { setDraft(String(stop.durationMin ?? "")); setEditing("dur"); }}
          className="text-micro text-ink-3 underline-offset-2 hover:underline" title="how long this takes">
          {stop.durationMin != null ? minutes(stop.durationMin) : "how long?"}
        </button>
      )}
      <div className="mt-0.5 flex gap-0.5">
        <button type="button" disabled={first || busy} onClick={() => onMove("up")} aria-label="move earlier"
          className="rounded-md p-0.5 text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-30"><ArrowUp className="size-2" /></button>
        <button type="button" disabled={last || busy} onClick={() => onMove("down")} aria-label="move later"
          className="rounded-md p-0.5 text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-30"><ArrowDown className="size-2" /></button>
      </div>
    </div>
  );
}

/** Minutes after midnight for a ClockTime, or null. */
export function toMin(t: string | null | undefined) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

/** "starts 20 min before the last one ends" style warnings, from start + duration + travel. */
export function overlap(prev: Stop, next: Stop): number | null {
  const a = toMin(prev.time), b = toMin(next.time);
  if (a === null || b === null || prev.durationMin == null) return null;
  const earliest = a + prev.durationMin + (next.travelFromPrevMin ?? 0);
  return b < earliest ? earliest - b : null;
}
