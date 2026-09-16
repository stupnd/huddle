"use client";
import { use } from "react";
import { speakerLabel, useTrip } from "@/lib/ui/useTrip";

const LEVEL_COPY: Record<string, string> = { quiet: "Chill mode", normal: "Normal", active: "Chatty", paused: "Paused" };

export default function TripDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { trip, participants, preferences, decisions, agents, candidates } = useTrip(id);

  const act = (prefId: string, action: "confirm" | "delete") =>
    fetch("/api/preferences", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: prefId, action }) });

  if (!trip) return <main className="dash"><p className="empty">Loading trip…</p></main>;

  const activeAgents = agents.filter((a) => a.status === "active");

  return (
    <main className="dash">
      <div className="dash-head">
        <div>
          <h1>{trip.title ?? "Untitled trip"}</h1>
          <p className="empty">Where the plan stands right now</p>
        </div>
        <div className="mood">
          <span>Huddle: {LEVEL_COPY[trip.activity_level]}</span>
          <span>Debates: {trip.debate_mode}</span>
        </div>
      </div>

      <div className="grid">
        <div>
          <section className="panel">
            <h2>What everyone wants</h2>
            {participants.length === 0 && <p className="empty">No one has texted yet.</p>}
            {participants.map((p) => {
              const mine = preferences.filter((x) => x.participant_id === p.id);
              return (
                <div className="person" key={p.id}>
                  <h3>{p.display_name ?? p.address}</h3>
                  {mine.length === 0 ? (
                    <p className="empty">Nothing captured yet.</p>
                  ) : (
                    <div className="chips">
                      {mine.map((pref) => (
                        <span key={pref.id} className={`chip ${pref.confirmed ? "" : "unconfirmed"}`}>
                          <b>{pref.category}</b>
                          {pref.visibility === "private" ? "set privately" : pref.value}
                          {!pref.confirmed && <button onClick={() => act(pref.id, "confirm")} aria-label={`Confirm ${pref.category}`} title="Confirm">✓</button>}
                          <button onClick={() => act(pref.id, "delete")} aria-label={`Remove ${pref.category}`} title="Remove">✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          <section className="panel">
            <h2>Decisions</h2>
            {decisions.length === 0 && <p className="empty">Open questions and choices show up here as the group talks.</p>}
            {decisions.map((d) => (
              <div className="decision" key={d.id}>
                <div className="top">
                  <strong>{d.topic}</strong>
                  <span className={`tag ${d.status}`}>{d.status}</span>
                </div>
                {d.chosen && <p className="chosen">Picked: {d.chosen}</p>}
                {d.options.length > 0 && (
                  <ul>
                    {d.options.map((o, i) => (
                      <li key={i}>
                        {o.label}
                        {o.est_cost_per_person ? `, about $${o.est_cost_per_person} each` : ""}
                        {o.details ? <div className="empty">{o.details}</div> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        </div>

        <div>
          <section className="panel">
            <h2>Agents in the chat</h2>
            <div className="agent-line">🧭 <span><strong>Huddle</strong>, host</span></div>
            <div className="agent-line">💸 <span><strong>Penny</strong>, budget</span></div>
            {activeAgents.map((a) => (
              <div className="agent-line" key={a.id}>{a.emoji} <span><strong>{a.persona_name}</strong>, {a.task}</span></div>
            ))}
          </section>

          <section className="panel">
            <h2>Speak log</h2>
            <p className="empty">Everything the agents wanted to say, including what they held back and why.</p>
            <ul className="log">
              {candidates.map((c) => {
                const l = speakerLabel(c.speaker, agents);
                return (
                  <li key={c.id} className={c.status === "posted" ? "" : "held"}>
                    <div className="meta">{l.name}, {c.status === "posted" ? "said" : c.status === "pending" ? "waiting" : "held back"} ({c.trigger}{c.reason ? `, ${c.reason}` : ""})</div>
                    {c.content}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
