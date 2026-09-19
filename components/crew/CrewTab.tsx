"use client";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, MessagesSquare, Pencil, X } from "lucide-react";
import type { Member, WantCategory } from "@/lib/domain/types";
import { activeAgents, wantConflicts } from "@/lib/domain/select";
import { agentEnter, listStagger } from "@/lib/design/tokens";
import { api } from "@/lib/api";
import { plural } from "@/lib/format";
import { useAction } from "@/lib/hooks/useAction";
import { useShell } from "@/components/shell/ShellProvider";
import { AgentFailures } from "@/components/agents/AgentThinking";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { MemberAvatar } from "./MemberAvatar";
import { WantChip } from "./WantChip";

/**
 * Us tab. People and their wants — confirm, edit, delete. Agents live in chat
 * and the drawer; this view is not a roster admin panel.
 */

const CATEGORY_LABEL: Record<WantCategory, string> = {
  destination: "where",
  dates: "when",
  budget: "budget",
  stays: "stays",
  transport: "getting around",
  food: "food",
  activities: "things to do",
  nightlife: "going out",
  avoid: "not doing",
  other: "other",
};
const CATEGORY_ORDER: WantCategory[] = [
  "destination",
  "dates",
  "budget",
  "stays",
  "transport",
  "food",
  "activities",
  "nightlife",
  "avoid",
  "other",
];

export function CrewTab() {
  const { snapshot, tripId, setViewer, openDrawer } = useShell();
  const { run, busy } = useAction();
  const conflicts = useMemo(() => wantConflicts(snapshot), [snapshot]);
  const agents = useMemo(() => activeAgents(snapshot), [snapshot]);
  const conflictCategories = new Set(conflicts.map((c) => c.category));

  const threadFor = (category: string) => {
    const words: Record<string, RegExp> = {
      budget: /budget|cost|price/,
      stays: /hotel|stay|lodging|room|budget/,
      food: /eat|food|meal/,
      transport: /transport|direction|uber|train/,
      nightlife: /club|bar|night/,
      activities: /activit|things to do/,
    };
    const re = words[category];
    const d = re ? snapshot.decisions.find((x) => x.status !== "resolved" && re.test(x.question.toLowerCase())) : undefined;
    return d ? `/trip/${tripId}/decisions?thread=${d.id}` : undefined;
  };

  const rename = (m: Member, name: string) =>
    run(`name-${m.id}`, () => api("/api/participants", "PATCH", { id: m.id, display_name: name }));
  const editWant = (id: string, value: string) =>
    run(`want-${id}`, () => api("/api/preferences", "PATCH", { id, action: "edit", value }));
  const confirmWant = (id: string) => run(`want-${id}`, () => api("/api/preferences", "PATCH", { id, action: "confirm" }));
  const deleteWant = (id: string) => run(`want-${id}`, () => api("/api/preferences", "PATCH", { id, action: "delete" }));

  return (
    <div className="flex flex-col gap-3">
      <AgentFailures />

      <header className="flex flex-wrap items-baseline justify-between gap-1">
        <h2 className="font-display text-display-md text-ink">
          us{" "}
          <span className="font-body text-body-sm font-normal text-ink-3 figures">
            {plural(snapshot.members.length, "person", "people")}
            {snapshot.trip.groupSize !== snapshot.members.length && ` · ${snapshot.trip.groupSize} going`}
          </span>
        </h2>
        {agents.length > 0 && (
          <Button size="sm" variant="quiet" onClick={openDrawer}>
            <MessagesSquare />
            {plural(agents.length, "agent")} helping · open chat
          </Button>
        )}
      </header>

      <p className="text-body-sm text-ink-3">
        wants land here from the group chat. confirm or fix yours — agents join the chat when the group is stuck, not from this screen.
      </p>

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
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
                aria-label="name"
                className="w-full rounded-sm border border-accent bg-surface-2 px-1 font-display text-display-sm text-ink outline-none"
              />
              <Button type="submit" size="icon-sm" variant="ghost" aria-label="save name">
                <Check />
              </Button>
              <Button type="button" size="icon-sm" variant="quiet" aria-label="cancel" onClick={() => setEditing(false)}>
                <X />
              </Button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraft(member.name);
                setEditing(true);
              }}
              className="group flex items-center gap-0.5 rounded-sm text-left font-display text-display-sm text-ink"
              aria-label={`rename ${member.name}`}
            >
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
