"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, CircleMarker, ZoomControl } from "react-leaflet";
import L from "leaflet";
import { Pause, Play } from "lucide-react";
import type { Stop } from "@/lib/domain/types";
import { formatTravel, useTripGeo, type Leg, type StopPin } from "@/lib/hooks/useTripGeo";
import { clock } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import "leaflet/dist/leaflet.css";

type Props = {
  stops: Stop[];
  near: string;
  focusId?: string | null;
  onSelectStop?: (stopId: string) => void;
  onLegs?: (legs: Leg[]) => void;
  className?: string;
};

/**
 * Real street map (Leaflet + OpenStreetMap tiles, no key). CARTO's basemaps now require a paid key.
 * Numbered pins, route lines with travel times, jump tour between stops.
 */
export function TripMapCanvas({ stops, near, focusId, onSelectStop, onLegs, className }: Props) {
  const { pins, legs, loading, error } = useTripGeo(stops, near);
  const [activeId, setActiveId] = useState<string | null>(focusId ?? null);
  const [touring, setTouring] = useState(false);

  useEffect(() => {
    onLegs?.(legs);
  }, [legs, onLegs]);

  useEffect(() => {
    if (focusId) setActiveId(focusId);
  }, [focusId]);

  useEffect(() => {
    if (!activeId && pins[0]) setActiveId(pins[0].stop.id);
  }, [pins, activeId]);

  const center = useMemo<[number, number]>(() => {
    // Before any pin resolves, start from the first stop that already has coordinates from the
    // planner; failing that a neutral world view. Never a hardcoded city (this used to be Montreal).
    if (pins.length === 0) {
      const known = stops.find((s) => s.place.lat != null && s.place.lng != null);
      return known ? [known.place.lat!, known.place.lng!] : [20, 0];
    }
    const lat = pins.reduce((s, p) => s + p.coord.lat, 0) / pins.length;
    const lng = pins.reduce((s, p) => s + p.coord.lng, 0) / pins.length;
    return [lat, lng];
  }, [pins]);

  const totalTravel = useMemo(() => {
    const sec = legs.reduce((s, l) => s + l.durationSec, 0);
    const m = legs.reduce((s, l) => s + l.distanceM, 0);
    return { sec, m };
  }, [legs]);

  const select = (id: string) => {
    setActiveId(id);
    onSelectStop?.(id);
  };

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-line bg-surface-2", className)}>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex items-start justify-between gap-2 p-2">
        <div className="pointer-events-auto max-w-[72%] rounded-xl border border-line bg-canvas/92 px-2 py-1.5 shadow-[0_12px_40px_oklch(0%_0_0_/_0.35)] backdrop-blur-md">
          <p className="font-display text-display-sm text-ink">
            {loading ? "placing stops on the map…" : error ? error : pins.length === 0 ? "no places to map yet" : `${pins.length} stops on the route`}
          </p>
          {!loading && legs.length > 0 && (
            <p className="text-micro text-ink-3 figures">
              ~{Math.max(1, Math.round(totalTravel.sec / 60))} min between stops · {(totalTravel.m / 1000).toFixed(1)} km
            </p>
          )}
        </div>
        <div className="pointer-events-auto">
          <Button
            size="sm"
            variant={touring ? "secondary" : "primary"}
            disabled={pins.length < 2}
            onClick={() => setTouring((t) => !t)}
            aria-pressed={touring}
          >
            {touring ? <Pause /> : <Play />}
            {touring ? "pause" : "jump tour"}
          </Button>
        </div>
      </div>

      <MapContainer
        center={center}
        zoom={pins.length === 0 && !stops.some((s) => s.place.lat != null) ? 3 : 13}
        className="h-[min(62vh,32rem)] w-full [&_.leaflet-control-attribution]:bg-canvas/80 [&_.leaflet-control-attribution]:text-[9px] [&_.leaflet-control-attribution]:text-ink-3 [&_.leaflet-control-zoom]:border-line [&_.leaflet-control-zoom]:bg-canvas/90 [&_.leaflet-control-zoom_a]:text-ink"
        scrollWheelZoom
        zoomControl={false}
      >
        {/* Real street tiles — free, no API key (not Google) */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={20}
        />
        <ZoomControl position="bottomright" />
        <FitPins pins={pins} />
        <FlyTo activeId={activeId} pins={pins} />
        <TourRunner touring={touring} pins={pins} activeId={activeId} onStep={select} onDone={() => setTouring(false)} />

        {legs.map((leg) => (
          <RouteLeg key={`${leg.fromId}-${leg.toId}`} leg={leg} active={leg.fromId === activeId || leg.toId === activeId} />
        ))}

        {pins.map((pin) => (
          <StopMarker key={pin.stop.id} pin={pin} active={pin.stop.id === activeId} onSelect={() => select(pin.stop.id)} />
        ))}
      </MapContainer>

      {pins.length > 0 && (
        <ol className="flex gap-1 overflow-x-auto border-t border-line bg-surface-1/95 p-1.5 scrollbar-none backdrop-blur-md" aria-label="jump to stop">
          {pins.map((pin, i) => {
            const leg = i > 0 ? legs.find((l) => l.toId === pin.stop.id) : null;
            const travel = leg ? formatTravel(leg.durationSec, leg.distanceM, leg.mode) : null;
            const active = pin.stop.id === activeId;
            return (
              <li key={pin.stop.id} className="flex shrink-0 items-center gap-1">
                {travel && (
                  <span className="hidden text-micro text-ink-3 figures sm:inline" aria-hidden>
                    → {travel.mins}′
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => select(pin.stop.id)}
                  aria-pressed={active}
                  className={cn(
                    "group flex max-w-[11rem] items-center gap-1 rounded-full border py-0.5 pr-2 pl-0.5 text-left transition-all duration-(--duration-fast)",
                    active
                      ? "border-accent bg-accent text-accent-ink shadow-[0_0_0_3px_var(--color-accent-soft)]"
                      : "border-line bg-surface-2 text-ink-2 hover:border-line-strong hover:text-ink",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-3 shrink-0 items-center justify-center rounded-full text-micro font-semibold figures",
                      active ? "bg-accent-ink/15" : "bg-surface-3 text-ink",
                    )}
                  >
                    {pin.n}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-body-sm font-medium">{pin.stop.title}</span>
                    <span className={cn("block truncate text-micro figures", active ? "text-accent-ink/70" : "text-ink-3")}>
                      {pin.stop.time ? clock(pin.stop.time) : pin.stop.timeLabel || "tbd"}
                      {travel ? ` · ${travel.verb} ${travel.mins} min` : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function FitPins({ pins }: { pins: StopPin[] }) {
  const map = useMap();
  const sig = pins.map((p) => p.stop.id).join(",");
  useEffect(() => {
    if (pins.length === 0) return;
    if (pins.length === 1) {
      map.setView([pins[0].coord.lat, pins[0].coord.lng], 15, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(pins.map((p) => [p.coord.lat, p.coord.lng] as [number, number]));
    map.fitBounds(bounds.pad(0.2), { animate: true, maxZoom: 15 });
  }, [map, sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function FlyTo({ activeId, pins }: { activeId: string | null; pins: StopPin[] }) {
  const map = useMap();
  useEffect(() => {
    const pin = pins.find((p) => p.stop.id === activeId);
    if (!pin) return;
    map.flyTo([pin.coord.lat, pin.coord.lng], Math.max(map.getZoom(), 14), { duration: 0.85 });
  }, [activeId, pins, map]);
  return null;
}

function TourRunner({
  touring,
  pins,
  activeId,
  onStep,
  onDone,
}: {
  touring: boolean;
  pins: StopPin[];
  activeId: string | null;
  onStep: (id: string) => void;
  onDone: () => void;
}) {
  const indexRef = useRef(0);

  useEffect(() => {
    if (!touring) return;
    if (pins.length < 2) {
      onDone();
      return;
    }
    const start = pins.findIndex((p) => p.stop.id === activeId);
    indexRef.current = start < 0 ? 0 : start;

    const t = setInterval(() => {
      const next = indexRef.current + 1;
      if (next >= pins.length) {
        onDone();
        return;
      }
      indexRef.current = next;
      onStep(pins[next].stop.id);
    }, 2400);
    return () => clearInterval(t);
  }, [touring]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function RouteLeg({ leg, active }: { leg: Leg; active: boolean }) {
  const mid = leg.coords[Math.floor(leg.coords.length / 2)] ?? leg.coords[0];
  const travel = formatTravel(leg.durationSec, leg.distanceM, leg.mode);
  return (
    <>
      <Polyline
        positions={leg.coords}
        pathOptions={{
          color: active ? "#c4a35a" : "#5b6b8c",
          weight: active ? 5 : 3.5,
          opacity: active ? 0.95 : 0.7,
          lineCap: "round",
          lineJoin: "round",
          dashArray: leg.mode === "foot" ? undefined : "8 10",
        }}
      />
      {mid && (
        <Marker
          position={mid}
          interactive={false}
          icon={L.divIcon({
            className: "huddle-leg-label",
            html: `<span class="huddle-leg-pill">${escapeHtml(travel.label)}</span>`,
            iconSize: [1, 1],
            iconAnchor: [0, 0],
          })}
        />
      )}
    </>
  );
}

function StopMarker({ pin, active, onSelect }: { pin: StopPin; active: boolean; onSelect: () => void }) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "huddle-pin-wrap",
        html: `<div class="huddle-pin ${active ? "is-active" : ""}"><span>${pin.n}</span></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      }),
    [pin.n, active],
  );

  return (
    <>
      {active && (
        <CircleMarker
          center={[pin.coord.lat, pin.coord.lng]}
          radius={20}
          pathOptions={{ color: "#c4a35a", fillColor: "#c4a35a", fillOpacity: 0.12, weight: 1.5, opacity: 0.7 }}
        />
      )}
      <Marker
        position={[pin.coord.lat, pin.coord.lng]}
        icon={icon}
        eventHandlers={{ click: onSelect }}
        zIndexOffset={active ? 800 : 200}
        title={pin.stop.title}
      >
        <Popup>
          <strong>{pin.stop.title}</strong>
          <br />
          <span style={{ fontSize: 12, color: "#555" }}>{pin.stop.place.neighborhood}</span>
          <br />
          <span style={{ fontSize: 11, color: "#777" }}>
            {pin.stop.time ? clock(pin.stop.time) : pin.stop.timeLabel} · {pin.stop.category}
          </span>
        </Popup>
      </Marker>
    </>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
