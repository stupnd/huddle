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
      run("build", () => api<{ items: number }>(`/api/trip/${tripId}/plan`, "POST"), {
        done: (r) => `plan built: ${r.items} stops. huddle posted it to the chat.`,
      }),
    [run, tripId],
  );

  const replan = useCallback(
    () =>
      run("replan", () => api<{ replanned: string[] }>(`/api/trip/${tripId}/replan`, "POST"), {
        done: (r) => `${r.replanned.join(" and ").toLowerCase()} redid the plan. posted to the chat.`,
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
