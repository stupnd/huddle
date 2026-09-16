"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { speakerLabel, useTrip } from "@/lib/ui/useTrip";

const FRIENDS = [
  { address: "+15550000001", name: "Stuti" },
  { address: "+15550000002", name: "Krisha" },
  { address: "+15550000003", name: "Priya" },
  { address: "+15550000004", name: "Arjun" },
];

export default function Simulator() {
  const [groupId, setGroupId] = useState("demo-trip");
  const [tripId, setTripId] = useState<string | null>(null);
  const [sender, setSender] = useState(FRIENDS[0]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const { trip, participants, messages, agents } = useTrip(tripId);
  const threadRef = useRef<HTMLDivElement>(null);

  const lookup = async (id = groupId) => {
    const res = await fetch(`/api/sim/trip?groupId=${encodeURIComponent(id)}`).then((r) => r.json());
    setTripId(res.tripId);
  };
  useEffect(() => { lookup(); }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The speak gate runs on a timer, like a cron would in production
  useEffect(() => {
    const t = setInterval(() => fetch("/api/tick", { method: "POST" }), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }); }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const body = { groupId, from: sender.address, name: sender.name, text };
    setText("");
    setBusy(true);
    setStatus("agents are thinking…");
    try {
      const res = await fetch("/api/sim/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      if (!tripId && res.tripId) setTripId(res.tripId);
      setStatus(res.plan && res.plan !== "none" ? `orchestrator: ${res.plan.replace("_", " ")}` : "");
    } catch {
      setStatus("Message failed to process. Check the server logs.");
    } finally {
      setBusy(false);
    }
  };

  const postPending = async () => {
    const res = await fetch(`/api/tick?force=1${tripId ? `&trip=${tripId}` : ""}`, { method: "POST" }).then((r) => r.json());
    const n = (res.results ?? []).reduce((acc: number, r: any) => acc + (r.posted ?? 0), 0);
    setStatus(n ? `posted ${n} held message${n === 1 ? "" : "s"}` : "nothing waiting to post");
  };

  const nameFor = (participantId: string | null) => participants.find((p) => p.id === participantId);

  return (
    <main className="sim">
      <section className="phone" aria-label="Simulated group chat">
        <header>
          <h2>{trip?.title ?? "New group chat"}</h2>
          <small>{participants.length} people, Huddle{agents.filter((a) => a.status === "active").length ? `, ${agents.filter((a) => a.status === "active").map((a) => a.persona_name).join(", ")}` : ""}</small>
        </header>
        <div className="thread" ref={threadRef}>
          {messages.length === 0 && <p className="empty">Say something to start planning. Huddle joins on the first message.</p>}
          {messages.map((m) => {
            if (m.sender_type === "agent") {
              const l = speakerLabel(m.persona, agents);
              return (
                <div key={m.id} className={`row agent ${l.kind}`}>
                  <span className="who">{l.name}</span>
                  <div className="bubble">{m.content}</div>
                </div>
              );
            }
            const p = nameFor(m.participant_id);
            const me = p?.address === sender.address;
            return (
              <div key={m.id} className={`row ${me ? "me" : ""}`}>
                {!me && <span className="who">{p?.display_name ?? p?.address}</span>}
                <div className="bubble">{m.content}</div>
              </div>
            );
          })}
        </div>
        <div className="composer">
          <div className="senders" role="group" aria-label="Send as">
            {FRIENDS.map((f) => (
              <button key={f.address} className="sender" aria-pressed={sender.address === f.address} onClick={() => setSender(f)} type="button">
                {f.name}
              </button>
            ))}
          </div>
          <form onSubmit={send}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message as ${sender.name}`} aria-label="Message" />
            <button className="send" disabled={busy || !text.trim()}>Send</button>
          </form>
        </div>
      </section>

      <aside className="side">
        <h2>Chat simulator</h2>
        <p>
          Switch who you're texting as to play the whole friend group. Huddle only posts once the chat has been quiet for a bit,
          just like it will in iMessage.
        </p>
        <label className="status">
          Group ID{" "}
          <input value={groupId} onChange={(e) => { setTripId(null); setGroupId(e.target.value); }} aria-label="Group ID" />
        </label>
        <div className="controls">
          <button className="pill" onClick={postPending} type="button">Post held messages now</button>
          {tripId && <Link className="pill ghost" href={`/trip/${tripId}`} target="_blank">Open trip dashboard</Link>}
        </div>
        <p className="status" aria-live="polite">{busy ? "agents are thinking…" : status}</p>
      </aside>
    </main>
  );
}
