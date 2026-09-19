"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function WaitlistForm({ source = "landing", compact = false }: { source?: string; compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setState("busy"); setMessage(null);
    try {
      const r = await fetch("/api/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, source }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Couldn't save that");
      setState("done");
    } catch (err) { setState("error"); setMessage(err instanceof Error ? err.message : "Couldn't save that"); }
  };

  if (state === "done") {
    return <p className="rounded-xl border border-line bg-surface-1 px-2 py-2 text-body text-ink-2">you're on the list. we'll text before we email.</p>;
  }
  return (
    <form onSubmit={submit} className={`flex ${compact ? "flex-row" : "flex-col sm:flex-row"} gap-1`}>
      <label htmlFor={`wl-${source}`} className="sr-only">email</label>
      <input id={`wl-${source}`} name="email" type="email" autoComplete="email" required placeholder="you@school.edu"
        value={email} onChange={(e) => setEmail(e.target.value)}
        className="min-w-0 flex-1 rounded-full border border-line bg-surface-1 px-2 py-2 text-body text-ink outline-none focus-visible:border-line-strong" />
      <Button type="submit" variant="primary" size="md" disabled={state === "busy"}>{state === "busy" ? "…" : "join the waitlist"}</Button>
      {message && <p role="alert" className="basis-full text-body-sm text-danger">{message}</p>}
    </form>
  );
}
