"use client";
import { RefreshCw } from "lucide-react";
import { planIsStale } from "@/lib/domain/select";
import { timeAgo } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import { Button } from "@/components/ui/button";
import { useShell } from "./ShellProvider";
import { usePlanActions } from "./usePlanActions";

/** "plan out of date" affordance. Shown on Plan and Money whenever something changed after the last build. */
export function StaleBanner({ what = "the plan" }: { what?: string }) {
  const { snapshot } = useShell();
  const { replan, busy } = usePlanActions();
  const now = useNow();
  if (!planIsStale(snapshot)) return null;
  const { lastChangedAt, lastRecalculatedAt } = snapshot.trip;
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-proposed/40 bg-proposed-soft/50 p-1.5 pl-2 md:flex-row md:items-center md:justify-between">
      <p className="text-body-sm text-ink">
        <span className="font-medium">{what} is out of date.</span>{" "}
        <span className="text-ink-2">
          something changed {lastChangedAt && timeAgo(lastChangedAt, now)}
          {lastRecalculatedAt && `, last built ${timeAgo(lastRecalculatedAt, now)}`}.
        </span>
      </p>
      <Button size="sm" variant="primary" disabled={busy === "replan"} onClick={replan} className="shrink-0 self-start md:self-auto">
        <RefreshCw className={busy === "replan" ? "animate-spin" : undefined} />
        {busy === "replan" ? "replanning" : "replan"}
      </Button>
    </div>
  );
}
