"use client";
import { useCallback, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useShell } from "@/components/shell/ShellProvider";

/**
 * Runs a write against the API with a named busy key, refreshes the trip when it
 * lands, and turns a thrown error into an error toast. Components read `busy` to
 * disable the control that is in flight, and only that control.
 */
export function useAction() {
  const { refresh } = useShell();
  const { notify } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, opts: { done?: string | ((r: T) => string); silent?: boolean } = {}): Promise<T | undefined> => {
      setBusy(key);
      try {
        const r = await fn();
        refresh();
        if (opts.done && !opts.silent) notify(typeof opts.done === "function" ? opts.done(r) : opts.done);
        return r;
      } catch (e) {
        notify(e instanceof Error ? e.message : "something went wrong", { tone: "error" });
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [refresh, notify],
  );

  return { run, busy };
}
