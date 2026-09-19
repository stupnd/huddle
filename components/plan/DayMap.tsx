"use client";
import { TripMap } from "./TripMap";
import type { Stop } from "@/lib/domain/types";

/** @deprecated use TripMap — kept so older imports keep working */
export function DayMap({ stops, near, focusId, onSelectStop }: { stops: Stop[]; near: string; focusId?: string | null; onSelectStop?: (id: string) => void }) {
  return <TripMap stops={stops} near={near} focusId={focusId} onSelectStop={onSelectStop} />;
}
