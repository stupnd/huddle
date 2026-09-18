"use client";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Pencil, UserMinus, UserPlus, X } from "lucide-react";
import type { Agent, AgentSpecialty, Member, WantCategory } from "@/lib/domain/types";
import { activeAgents, wantConflicts } from "@/lib/domain/select";
import { agentEnter, listStagger } from "@/lib/design/tokens";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useAction } from "@/lib/hooks/useAction";
import { useNow } from "@/lib/hooks/useNow";
import { useShell } from "@/components/shell/ShellProvider";
import { AgentFailures } from "@/components/agents/AgentThinking";
import { AgentIdentity, specialtyLabel, stateLabel } from "@/components/agents/AgentIdentity";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { MemberAvatar } from "./MemberAvatar";
import { WantChip } from "./WantChip";

/**
 * Crew tab. People first: each member with their wants as chips grouped by category,
 * editable in place, private ones locked. Then the agents: who is on the trip, what
 * state they are in, a dismiss, and a row to bring in a specialist.
 */

const CATEGORY_LABEL: Record<WantCategory, string> = {
  destination: "where", dates: "when", budget: "budget", stays: "stays", transport: "getting around", food: "food",
  activities: "things to do", nightlife: "going out", avoid: "not doing", other: "other",
};
const CATEGORY_ORDER: WantCategory[] = ["destination", "dates", "budget", "stays", "transport", "food", "activities", "nightlife", "avoid", "other"];

const ADDABLE: { role: string; specialty: AgentSpecialty; blurb: string }[] = [
  { role: "stays", specialty: "stays", blurb: "hotels, hostels, the room with the view" },
  { role: "food", specialty: "food", blurb: "where to eat, what it costs" },
  { role: "activities", specialty: "activities", blurb: "things to do, tickets, timing" },
  { role: "transport", specialty: "transport", blurb: "airport runs, trains, getting between stops" },
  { role: "flights", specialty: "flights", blurb: "fares and times" },
  { role: "nightlife", specialty: "nightlife", blurb: "bars, clubs, the late plan" },
];

export function CrewTab() {
  const { snapshot, tripId, setViewer } = useShell();
  const { run, busy } = useAction();
  const now = useNow();
  const conflicts = useMemo(() => wantConflicts(snapshot), [snapshot]);
  const agents = useMemo(() => activeAgents(snapshot), [snapshot]);
  const specialists = agents.filter((a) => !a.builtIn);
  const conflictCategories = new Set(conflicts.map((c) => c.category));

  const threadFor = (category: string) => {
    const words: Record<string, RegExp> = { budget: /budget|cost|price/, stays: /hotel|stay|lodging|room|budget/, food: /eat|food|meal/, transport: /transport|direction|uber|train/, nightlife: /club|bar|night/, activities: /activit|things to do/ };
    const re = words[category];
    const d = re ? snapshot.decisions.find((x) => x.status !== "resolved" && re.test(x.question.toLowerCase())) : undefined;
    return d ? `/trip/${tripId}/decisions?thread=${d.id}` : undefined;
  };

  const rename = (m: Member, name: string) => run(`name-${m.id}`, () => api("/api/participants", "PATCH", { id: m.id, display_name: name }));
  const editWant = (id: string, value: string) => run(`want-${id}`, () => api("/api/preferences", "PATCH", { id, action: "edit", value }));
  const confirmWant = (id: string) => run(`want-${id}`, () => api("/api/preferences", "PATCH", { id, action: "confirm" }));
  const deleteWant = (id: string) => run(`want-${id}`, () => api("/api/preferences", "PATCH", { id, action: "delete" }));
  const dismiss = (a: Agent) => run(`dismiss-${a.id}`, () => api(`/api/trip/${tripId}/agents`, "PATCH", { agentId: a.id }), { done: `${a.name} said bye in the chat.` });
  const add = (role: string) => run(`add-${role}`, () => api(`/api/trip/${tripId}/agents`, "POST", { role }), { done: "they are researching now. watch the chat." });
  const setPenny = (on: boolean) => run("penny", () => api(`/api/trip/${tripId}/settings`, "PATCH", { penny: on }), { done: on ? "penny is back on the trip." : "penny is off. costs stay on the money tab." });

  return (
    <div className="flex flex-col gap-4">
      <AgentFailures />

      <section aria-labelledby="members" className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <h2 id="members" className="font-display text-display-md text-ink">
            the crew <span className="font-body text-body-sm font-normal text-ink-3 figures">{snapshot.members.length} in the chat · {snapshot.trip.groupSize} going</span>
          </h2>
        </div>
        {snapshot.members.length === 0 ? (
          <EmptyState title="nobody here yet" body="huddle adds everyone who talks in the group chat. wants show up as chips as people say them." />
        ) : (
          <motion.ul variants={listStagger} initial="initial" animate="animate" className="grid gap-1 lg:grid-cols-2">
            {snapshot.members.map((m) => (
              <MemberCard
                key={m.id}
                member={m}
                isViewer={m.id === snapshot.viewerId}
                busy={busy}
                conflictCategories={conflictCategories}
                threadFor={threadFor}
                onRename={(name) => rename(m, name)}
                onBeMe={() => setViewer(m.id)}
                onEditWant={editWant}
                onConfirmWant={confirmWant}
                onDeleteWant={deleteWant}
              />
            ))}
          </motion.ul>
        )}
      </section>

      <section aria-labelledby="agents" className="flex flex-col gap-1.5">
        <h2 id="agents" className="font-display text-display-md text-ink">
          agents <span className="font-body text-body-sm font-normal text-ink-3 figures">{agents.length} on the trip</span>
        </h2>
        <motion.ul variants={listStagger} initial="initial" animate="animate" className="grid gap-1 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((a) => (
            <AgentCard key={a.id} agent={a} now={now} busy={busy} onDismiss={a.builtIn ? (a.specialty === "budget" ? () => setPenny(false) : undefined) : () => dismiss(a)} />
          ))}
          {!agents.some((a) => a.specialty === "budget") && (
            <li className="flex items-center justify-between gap-1 rounded-xl border border-dashed border-line p-1.5">
              <span className="text-body-sm text-ink-2">penny, the budget agent, is off.</span>
              <Button size="sm" variant="secondary" disabled={busy === "penny"} onClick={() => setPenny(true)}>
                bring her back
              </Button>
            </li>
          )}
        </motion.ul>

        <h3 className="mt-1 font-display text-display-sm text-ink-2">bring in an agent</h3>
        <p className="text-body-sm text-ink-3">
          {specialists.length >= 3 ? "three specialists is the limit. dismiss one to bring in another." : "they join the group chat, research, and come back with options."}
        </p>
        <ul className="flex flex-wrap gap-0.5">
          {ADDABLE.map((s) => {
            const here = specialists.some((a) => a.specialty === s.specialty);
            return (
              <li key={s.role}>
                <Button size="sm" variant="secondary" disabled={here || specialists.length >= 3 || busy !== null} onClick={() => add(s.role)} title={s.blurb} aria-busy={busy === `add-${s.role}`}>
                  <UserPlus />
                  {busy === `add-${s.role}` ? "joining" : specialtyLabel[s.specialty]}
                  {here && <span className="text-ink-3">· here</span>}
                </Button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function MemberCard({
  member,
  isViewer,
  busy,
  conflictCategories,
  threadFor,
  onRename,
  onBeMe,
  onEditWant,
  onConfirmWant,
  onDeleteWant,
}: {
  member: Member;
  isViewer: boolean;
  busy: string | null;
  conflictCategories: Set<string>;
  threadFor: (category: string) => string | undefined;
  onRename: (name: string) => void;
  onBeMe: () => void;
  onEditWant: (id: string, text: string) => void;
  onConfirmWant: (id: string) => void;
  onDeleteWant: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(member.name);
  const grouped = CATEGORY_ORDER.map((c) => ({ category: c, wants: member.wants.filter((w) => w.category === c) })).filter((g) => g.wants.length);

  return (
    <motion.li variants={agentEnter} className={cn("flex flex-col gap-1.5 rounded-xl border bg-surface-1 p-2", isViewer ? "border-accent/40" : "border-line")}>
      <header className="flex items-center gap-1.5">
        <MemberAvatar member={member} size="lg" />
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              className="flex items-center gap-0.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim() && draft.trim() !== member.name) onRename(draft.trim());
                setEditing(false);
              }}
            >
              <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setEditing(false)} aria-label="name" className="w-full rounded-sm border border-accent bg-surface-2 px-1 font-display text-display-sm text-ink outline-none" />
              <Button type="submit" size="icon-sm" variant="ghost" aria-label="save name"><Check /></Button>
              <Button type="button" size="icon-sm" variant="quiet" aria-label="cancel" onClick={() => setEditing(false)}><X /></Button>
            </form>
          ) : (
            <button type="button" onClick={() => { setDraft(member.name); setEditing(true); }} className="group flex items-center gap-0.5 rounded-sm text-left font-display text-display-sm text-ink" aria-label={`rename ${member.name}`}>
              {member.name}
              <Pencil className="size-1.5 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
            </button>
          )}
          <p className="text-body-sm text-ink-3 figures">
            {member.wants.length} wants · {member.wants.filter((w) => w.private).length} private
          </p>
        </div>
        {isViewer ? (
          <span className="rounded-full bg-accent-soft px-1 text-micro text-ink">this is you</span>
        ) : (
          <Button size="sm" variant="quiet" onClick={onBeMe}>
            this is me
          </Button>
        )}
      </header>

      {grouped.length === 0 ? (
        <p className="text-body-sm text-ink-3">nothing stated yet. anything they say in the chat lands here.</p>
      ) : (
        <dl className="flex flex-col gap-1">
          {grouped.map((g) => (
            <div key={g.category} className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] gap-1">
              <dt className="pt-0.5 text-body-sm text-ink-3">{CATEGORY_LABEL[g.category]}</dt>
              <dd className="flex min-w-0 flex-wrap gap-0.5">
                {g.wants.map((w) => (
                  <WantChip
                    key={w.id}
                    want={w}
                    busy={busy === `want-${w.id}`}
                    conflictHref={conflictCategories.has(w.category) && !w.private && /\$\s*\d/.test(w.text) ? threadFor(w.category) : undefined}
                    onEdit={(t) => onEditWant(w.id, t)}
                    onConfirm={() => onConfirmWant(w.id)}
                    onDelete={() => onDeleteWant(w.id)}
                  />
                ))}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </motion.li>
  );
}

function AgentCard({ agent, now, busy, onDismiss }: { agent: Agent; now: number; busy: string | null; onDismiss?: () => void }) {
  const { snapshot } = useShell();
  const lastEvent = [...snapshot.events].reverse().find((e) => e.agentId === agent.id);
  const summary = agent.currentStep ?? (lastEvent ? `${lastEvent.summary} · ${timeAgo(lastEvent.at, now)}` : agent.tagline);
  return (
    <motion.li variants={agentEnter} className={cn("flex flex-col gap-1 rounded-xl border bg-surface-1 p-2", agent.state === "error" ? "border-danger/40" : agent.state === "debating" ? "border-contested/30" : "border-line")}>
      <div className="flex items-start justify-between gap-1">
        <AgentIdentity agent={agent} variant="stacked" />
        {onDismiss && (
          <Button size="icon-sm" variant="quiet" aria-label={`dismiss ${agent.name}`} title="dismiss from the trip" disabled={busy === `dismiss-${agent.id}` || busy === "penny"} onClick={onDismiss}>
            <UserMinus />
          </Button>
        )}
      </div>
      <p className="text-body-sm text-ink-2">{summary}</p>
      <p className="text-micro text-ink-3">
        <span className={cn(agent.state === "waiting" && "text-proposed", agent.state === "debating" && "text-contested", agent.state === "thinking" && "text-ink")}>{stateLabel[agent.state]}</span>
        {" · "}joined {timeAgo(agent.joinedAt, now)}
      </p>
    </motion.li>
  );
}

