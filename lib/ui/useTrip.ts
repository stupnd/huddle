"use client";
import { useEffect, useState } from "react";
import { browserDb, type Agent, type Decision, type Message, type Participant, type Preference, type Trip } from "../supabase";

export type SpeakCandidate = {
  id: string; speaker: string; trigger: string; urgency: number; content: string; status: string; reason: string | null; created_at: string;
};

/** Loads a trip and keeps it live with Supabase Realtime. */
export function useTrip(tripId: string | null) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [candidates, setCandidates] = useState<SpeakCandidate[]>([]);

  useEffect(() => {
    if (!tripId) return;
    const s = browserDb();
    const load = async () => {
      const [t, p, m, pr, d, a, c] = await Promise.all([
        s.from("trips").select("*").eq("id", tripId).single(),
        s.from("participants").select("*").eq("trip_id", tripId),
        s.from("messages").select("*").eq("trip_id", tripId).order("created_at"),
        s.from("preferences").select("*").eq("trip_id", tripId).order("updated_at"),
        s.from("decisions").select("*").eq("trip_id", tripId).order("created_at"),
        s.from("agents").select("*").eq("trip_id", tripId).order("created_at"),
        s.from("speak_candidates").select("*").eq("trip_id", tripId).order("created_at", { ascending: false }).limit(50),
      ]);
      setTrip(t.data as Trip);
      setParticipants((p.data ?? []) as Participant[]);
      setMessages((m.data ?? []) as Message[]);
      setPreferences((pr.data ?? []) as Preference[]);
      setDecisions((d.data ?? []) as Decision[]);
      setAgents((a.data ?? []) as Agent[]);
      setCandidates((c.data ?? []) as SpeakCandidate[]);
    };
    load();
    // Simple and robust for an MVP: any change reloads the trip
    const channel = s
      .channel(`trip-${tripId}`)
      .on("postgres_changes", { event: "*", schema: "public", filter: `trip_id=eq.${tripId}` } as any, load)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "trips", filter: `id=eq.${tripId}` }, load)
      .subscribe();
    return () => { s.removeChannel(channel); };
  }, [tripId]);

  return { trip, participants, messages, preferences, decisions, agents, candidates };
}

export function speakerLabel(persona: string | null, agents: Agent[]) {
  if (persona === "huddle") return { name: "🧭 Huddle", kind: "huddle" };
  if (persona === "budget") return { name: "💸 Penny", kind: "budget" };
  const a = agents.find((x) => x.id === persona);
  return a ? { name: `${a.emoji} ${a.persona_name} (${a.role})`, kind: "child" } : { name: "Agent", kind: "child" };
}
