"use client";
import { useCallback } from "react";
import { api } from "@/lib/api";
import { useAction } from "@/lib/hooks/useAction";
import { useToast } from "@/components/ui/toast";
import { useShell } from "./ShellProvider";

/** build, replan and share, wired to the real routes. one place so the top bar and the banners agree. */
export function usePlanActions() {
  const { tripId } = useShell();
  const { run, busy } = useAction();
  const { notify } = useToast();

  const build = useCallback(
    () =>
      run("build", () => api<{ queued: boolean; alreadyRunning: boolean }>(`/api/trip/${tripId}/plan`, "POST"), {
        done: (r) => (r.alreadyRunning ? "huddle is already building it." : "huddle is building the plan. under a minute, this page updates on its own."),
      }),
    [run, tripId],
  );

  const replan = useCallback(
    () =>
      run("replan", () => api<{ queued: boolean; alreadyRunning: boolean }>(`/api/trip/${tripId}/replan`, "POST"), {
        done: (r) => (r.alreadyRunning ? "already replanning." : "replanning. the agents refresh their options first, then the plan. about a minute."),
      }),
    [run, tripId],
  );

  const share = useCallback(async () => {
    const url = `${window.location.origin}/trip/${tripId}/plan`;
    try {
      await navigator.clipboard.writeText(url);
      notify("link copied. paste it in the group chat.");
    } catch {
      notify(url);
    }
  }, [tripId, notify]);

  return { build, replan, share, busy };
}
