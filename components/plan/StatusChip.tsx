import { Ban, CircleDashed, Lock, TriangleAlert } from "lucide-react";
import type { StopStatus } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/**
 * Status chip for a stop. Four states, four fills, four icons: the hierarchy the
 * old build lacked. Locked is calm, proposed is warm, contested is the only one
 * that pulls the eye, dropped is quiet and struck.
 */
const config: Record<StopStatus, { label: string; Icon: typeof Lock; className: string }> = {
  locked: { label: "locked", Icon: Lock, className: "bg-locked-soft text-locked" },
  proposed: { label: "proposed", Icon: CircleDashed, className: "bg-proposed-soft text-proposed" },
  contested: { label: "contested", Icon: TriangleAlert, className: "bg-contested-soft text-contested" },
  dropped: { label: "dropped", Icon: Ban, className: "bg-dropped-soft text-dropped line-through decoration-dropped/60" },
};

export function StatusChip({ status, className, compact }: { status: StopStatus; className?: string; compact?: boolean }) {
  const { label, Icon, className: tone } = config[status];
  return (
    <span className={cn("inline-flex h-2.5 shrink-0 items-center gap-0.5 rounded-full px-1 text-micro font-medium", tone, className)}>
      <Icon className="size-1.5" aria-hidden />
      {!compact && label}
      {compact && <span className="sr-only">{label}</span>}
    </span>
  );
}
