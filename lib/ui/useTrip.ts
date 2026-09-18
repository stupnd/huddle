"use client";
import { useCallback, useEffect, useState } from "react";
import type { Agent, Decision, ItineraryItem, Message, Participant, Preference, Trip } from "../supabase";

export type SpeakCandidate = {
  id: string; speaker: string; trigger: string; urgency: number; content: string; status: string; reason: string | null; created_at: string;
};

type TripData = {
  trip: Trip | null;
  participants: Participant[];
  messages: Message[];
  preferences: Preference[];
  decisions: Decision[];
  agents: Agent[];
  candidates: SpeakCandidate[];
  itinerary: ItineraryItem[];
  itineraryReady: boolean;
};

const EMPTY: TripData = { trip: null, participants: [], messages: [], preferences: [], decisions: [], agents: [], candidates: [], itinerary: [], itineraryReady: true };
const POLL_MS = 2000;

/**
 * Loads a trip from /api/trip/[id] and keeps it fresh by polling.
 *
 * The browser does not read Supabase directly: RLS is on, so anon reads return nothing.
 * Polling also avoids the Realtime binding that silently delivered no events before.
 */
export function useTrip(tripId: string | null) {
  const [data, setData] = useState<TripData>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  /** Reload immediately instead of waiting for the next poll. */
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    setData(EMPTY);
    setError(null);
  }, [tripId]);

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`/api/trip/${tripId}`, { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setError(body?.error ?? `Could not load the trip (${res.status}).`);
          return;
        }
        setData({
          trip: body.trip as Trip,
          participants: (body.participants ?? []) as Participant[],
          messages: (body.messages ?? []) as Message[],
          preferences: (body.preferences ?? []) as Preference[],
          decisions: (body.decisions ?? []) as Decision[],
          agents: (body.agents ?? []) as Agent[],
          candidates: (body.candidates ?? []) as SpeakCandidate[],
          itinerary: (body.itinerary ?? []) as ItineraryItem[],
          itineraryReady: body.itineraryReady !== false,
        });
        setError(null);
      } catch {
        if (!cancelled) setError("Could not reach the server. Is npm run dev still running?");
      }
    };

    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [tripId, nonce]);

  return { ...data, error, refresh };
}

export function speakerLabel(persona: string | null, agents: Agent[]) {
  if (persona === "huddle") return { name: "🧭 Huddle", kind: "huddle" };
  if (persona === "budget") return { name: "💸 Penny", kind: "budget" };
  const a = agents.find((x) => x.id === persona);
  return a ? { name: `${a.emoji} ${a.persona_name} (${a.role})`, kind: "child" } : { name: "Agent", kind: "child" };
}
