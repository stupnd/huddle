"use client";
import { useState } from "react";
import { Check, Lock, Pencil, TriangleAlert, Trash2, X } from "lucide-react";
import type { Want } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A stated want as a chip. Private wants render locked and read "private": intentional,
 * never missing. Group wants edit inline: tap the pencil, change the text, confirm or
 * remove. A conflict marker links to the thread where the disagreement lives.
 */
export function WantChip({
  want,
  busy,
  conflictHref,
  onEdit,
  onConfirm,
  onDelete,
}: {
  want: Want;
  busy: boolean;
  conflictHref?: string;
  onEdit: (text: string) => void;
  onConfirm: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(want.text);

  if (want.private) {
    return (
      <span className="inline-flex h-4 items-center gap-0.5 rounded-full border border-dashed border-line-strong px-1.5 text-body-sm text-ink-3" title="set privately in a dm with huddle">
        <Lock className="size-1.5" aria-hidden />
        private
      </span>
    );
  }

  if (editing) {
    return (
      <form
        className="inline-flex h-4 items-center gap-0.5 rounded-full border border-accent bg-surface-2 pl-1.5 pr-0.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim() && draft.trim() !== want.text) onEdit(draft.trim());
          setEditing(false);
        }}
      >
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          aria-label="edit want"
          className="w-[14rem] bg-transparent text-body-sm text-ink outline-none"
        />
        <Button type="submit" size="icon-sm" variant="ghost" aria-label="save" disabled={busy}>
          <Check />
        </Button>
        <Button type="button" size="icon-sm" variant="quiet" aria-label="cancel" onClick={() => setEditing(false)}>
          <X />
        </Button>
      </form>
    );
  }

  return (
    <span
      className={cn(
        "group inline-flex min-h-4 max-w-full items-center gap-0.5 rounded-lg border bg-surface-2 py-0.5 pl-1.5 pr-0.5 text-body-sm text-ink",
        conflictHref ? "border-contested/50" : want.confirmed ? "border-line" : "border-dashed border-line-strong",
      )}
    >
      <span className="min-w-0 break-words">{want.text}</span>
      {conflictHref && (
        <a href={conflictHref} className="inline-flex size-2.5 items-center justify-center rounded-full text-contested hover:bg-contested-soft" aria-label="conflicts with someone else, open the thread" title="conflicts with someone else, open the thread">
          <TriangleAlert className="size-1.5" aria-hidden />
        </a>
      )}
      {!want.confirmed && (
        <Button size="icon-sm" variant="quiet" aria-label="confirm this is right" title="confirm" disabled={busy} onClick={onConfirm} className="size-2.5 [&_svg]:size-1.5">
          <Check />
        </Button>
      )}
      <Button size="icon-sm" variant="quiet" aria-label="edit" disabled={busy} onClick={() => { setDraft(want.text); setEditing(true); }} className="size-2.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [&_svg]:size-1.5">
        <Pencil />
      </Button>
      <Button size="icon-sm" variant="quiet" aria-label="remove" disabled={busy} onClick={onDelete} className="size-2.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [&_svg]:size-1.5">
        <Trash2 />
      </Button>
    </span>
  );
}
