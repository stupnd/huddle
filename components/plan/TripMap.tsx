"use client";
import dynamic from "next/dynamic";
import type { Stop } from "@/lib/domain/types";
import type { Leg } from "@/lib/hooks/useTripGeo";
import { Skeleton } from "@/components/ui/skeleton";

const Canvas = dynamic(() => import("./TripMapCanvas").then((m) => m.TripMapCanvas), {
  ssr: false,
  loading: () => <Skeleton className="h-[min(62vh,32rem)] w-full rounded-2xl" />,
});

/** Real street map (Leaflet). Client-only — do not import the canvas directly. */
export function TripMap(props: {
  stops: Stop[];
  near: string;
  focusId?: string | null;
  onSelectStop?: (stopId: string) => void;
  onLegs?: (legs: Leg[]) => void;
  className?: string;
}) {
  return <Canvas {...props} />;
}
