import { cn } from "@/lib/utils";

/**
 * Empty state: warm and directive. A headline in display type, one line of what to
 * do next, and the action that does it. Never an emoji, never "no data".
 */
export function EmptyState({ title, body, action, className }: { title: string; body: string; action?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col items-start gap-1.5 rounded-xl border border-dashed border-line-strong bg-surface-1 p-3 md:p-4", className)}>
      <h3 className="text-balance font-display text-display-md text-ink">{title}</h3>
      <p className="max-w-[40em] text-body text-ink-2">{body}</p>
      {action && <div className="mt-0.5">{action}</div>}
    </section>
  );
}
